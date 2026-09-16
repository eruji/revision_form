/* ═══════════════════════════════════════════════════════════════════════════
   Office view — password-protected list of submitted revision requests.
   Talks to /api/admin, sending the team password in the x-admin-key header.
   The password is kept in sessionStorage for the tab only.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SS_KEY = 'po_admin_key';

  function $(sel) { return document.querySelector(sel); }

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function getKey() {
    try { return sessionStorage.getItem(SS_KEY) || ''; } catch (e) { return ''; }
  }
  function setKey(v) {
    try { v ? sessionStorage.setItem(SS_KEY, v) : sessionStorage.removeItem(SS_KEY); } catch (e) {}
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function showGate(showError) {
    $('#gateCard').hidden = false;
    $('#listWrap').hidden = true;
    $('#refreshBtn').hidden = true;
    $('#exportCsvBtn').hidden = true;
    $('#signOutBtn').hidden = true;
    $('#gateError').hidden = !showError;
    if (showError) $('#adminKey').focus();
  }

  function showList() {
    $('#gateCard').hidden = true;
    $('#listWrap').hidden = false;
    $('#refreshBtn').hidden = false;
    $('#exportCsvBtn').hidden = false;
    $('#signOutBtn').hidden = false;
  }

  async function fetchRecords(key) {
    const res = await fetch('/api/admin', {
      headers: { 'x-admin-key': key },
      cache: 'no-store'
    });
    if (res.status === 401) return { unauthorized: true };
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv(records) {
    let header = null;
    const rows = [];
    records.forEach((rec) => {
      const sub = rec.submission || {};
      const L = sub._labels || { about: {}, revision: {}, ack: {} };
      const aboutIds = Object.keys(L.about || {});
      const revIds = Object.keys(L.revision || {});
      const ackIds = Object.keys(L.ack || {});
      if (!header) {
        header = ['Submitted At',
          ...aboutIds.map((id) => L.about[id]),
          ...revIds.map((id) => L.revision[id]),
          ...ackIds.map((id) => L.ack[id])];
      }
      const aboutVals = aboutIds.map((id) => (sub.about || {})[id]);
      const ackVals = ackIds.map((id) => (sub.acknowledgment || {})[id]);
      const revs = sub.revisions || [];
      if (!revs.length) rows.push([sub.submittedAt, ...aboutVals, ...revIds.map(() => ''), ...ackVals]);
      revs.forEach((rev) => rows.push([
        sub.submittedAt, ...aboutVals, ...revIds.map((id) => rev[id]), ...ackVals
      ]));
    });
    const all = header ? [header, ...rows] : [];
    return all.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyText(text, btn) {
    const done = () => {
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = original; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = h('textarea', {});
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); if (done) done(); } catch (e) {}
    ta.remove();
  }

  function toast(msg) {
    const t = document.querySelector('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  function clientLink(code) { return location.origin + '/?resume=' + encodeURIComponent(code); }
  function draftViewLink(code) { return location.origin + '/view.html?draft=' + encodeURIComponent(code); }

  async function deleteDraft(code, name) {
    if (!window.confirm('Delete the saved draft for ' + (name || 'this client') + '? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin?draft=' + encodeURIComponent(code), {
        method: 'DELETE', headers: { 'x-admin-key': getKey() }, cache: 'no-store'
      });
      if (!res.ok) throw new Error('delete failed');
      toast('Draft deleted');
      load(getKey(), false);
    } catch (e) {
      toast('Could not delete draft');
    }
  }

  function renderDrafts(drafts) {
    const list = document.querySelector('#draftList');
    const count = document.querySelector('#draftCount');
    if (!list) return;
    list.innerHTML = '';
    if (count) count.textContent = drafts.length ? '(' + drafts.length + ')' : '';

    if (!drafts.length) {
      list.append(h('p', { class: 'admin-empty', text: 'No saved drafts right now.' }));
      return;
    }

    drafts.forEach((d) => {
      const name = d.clientName || 'Unnamed client';
      const project = d.projectName ? ' · ' + d.projectName : '';
      list.append(h('div', { class: 'draft-card' },
        h('div', { class: 'draft-card__head' },
          h('strong', { text: name + project }),
          h('span', { class: 'badge', text: (d.itemCount || 0) + (d.itemCount === 1 ? ' item' : ' items') })
        ),
        h('div', { class: 'draft-card__meta' },
          h('span', { text: 'Saved ' + fmtDate(d.savedAt) }),
          d.expiresAt ? h('span', { text: '· expires ' + fmtDate(d.expiresAt) }) : null,
          h('code', { class: 'code-chip', text: d.code })
        ),
        h('div', { class: 'draft-card__actions' },
          h('a', { class: 'btn btn--ghost', href: draftViewLink(d.code), target: '_blank', rel: 'noopener', text: 'View' }),
          h('button', { type: 'button', class: 'btn btn--ghost', text: 'Copy client link',
            onclick: (e) => copyText(clientLink(d.code), e.currentTarget) }),
          h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete',
            onclick: () => deleteDraft(d.code, name) })
        )
      ));
    });
  }
  function renderRecords(records) {
    const list = $('#adminList');
    list.innerHTML = '';
    $('#adminSummary').textContent =
      records.length + (records.length === 1 ? ' submission' : ' submissions') + ' total.';

    if (!records.length) {
      list.append(h('div', { class: 'empty-state' },
        h('div', { text: '🗂' }),
        h('p', { text: 'No revision requests yet.' })
      ));
      return;
    }

    records.forEach((rec) => {
      const sub = rec.submission || {};
      const aboutLabels = (sub._labels && sub._labels.about) || {};
      const nameId = Object.keys(aboutLabels).find((id) => /client name/i.test(aboutLabels[id]));
      const projId = Object.keys(aboutLabels).find((id) => /project/i.test(aboutLabels[id]));
      const name = nameId ? sub.about[nameId] : 'Client';
      const project = projId ? sub.about[projId] : '';

      const items = h('div', { class: 'sub__body' });
      (sub.revisions || []).forEach((rev, i) => {
        const cat = rev.category || 'Revision';
        const loc = rev.location ? ' — ' + rev.location : '';
        const desc = rev.description || rev.reason || '';
        items.append(h('div', { class: 'sub__item' },
          h('b', { text: '#' + (i + 1) + ' ' + cat + loc }),
          desc ? h('small', { text: desc }) : null
        ));
      });

      list.append(h('div', { class: 'sub' },
        h('div', { class: 'sub__head' },
          h('strong', { text: name + (project ? ' · ' + project : '') }),
          h('span', { text: fmtDate(rec.submittedAt) }),
          h('span', { class: 'badge', text: (sub.revisions || []).length + ' items' })
        ),
        items
      ));
    });
  }

  async function load(key, showErrorOnFail) {
    try {
      const data = await fetchRecords(key);
      if (data.unauthorized) { setKey(''); showGate(!!showErrorOnFail); return false; }
      setKey(key);
      showList();
      renderRecords(data.records || []);
      renderDrafts(data.drafts || []);
      return true;
    } catch (e) {
      showGate(false);
      $('#adminSummary').textContent = 'Could not load submissions. Is the site backend available?';
      return false;
    }
  }

  async function exportCsv() {
    const key = getKey();
    try {
      const res = await fetch('/api/admin?format=csv', { headers: { 'x-admin-key': key }, cache: 'no-store' });
      if (!res.ok) throw new Error('export failed');
      const csv = await res.text();
      download('revision-requests.csv', csv, 'text/csv;charset=utf-8');
    } catch (e) {
      // Fall back to building CSV from the currently loaded records.
      const res = await fetchRecords(key);
      if (res && res.records) download('revision-requests.csv', buildCsv(res.records), 'text/csv;charset=utf-8');
    }
  }

  function bind() {
    $('#gateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const key = $('#adminKey').value;
      if (!key) return;
      load(key, true);
    });
    $('#refreshBtn').addEventListener('click', () => load(getKey(), false));
    $('#exportCsvBtn').addEventListener('click', exportCsv);
    $('#signOutBtn').addEventListener('click', () => { setKey(''); $('#adminKey').value = ''; showGate(false); });
  }

  function init() {
    if (init._done) return;
    init._done = true;
    bind();
    const key = getKey();
    if (key) load(key, false); else showGate(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
