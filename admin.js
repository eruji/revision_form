/* ═══════════════════════════════════════════════════════════════════════════
   Office dashboard — password-protected list of submitted revision requests.
   Talks to /api/admin, sending the team password in the x-admin-key header.
   The password is kept in sessionStorage for the tab only.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SS_KEY = 'po_admin_key';
  let workQueueSheetUrl = '';
  let lastRecords = [];

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

  function clientLink(code) { return location.origin + '/form.html?resume=' + encodeURIComponent(code); }
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
  // ── Full submission detail (view + export) ──────────────────────────────
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

  function appendTextWithLinks(parent, text) {
    const s = text == null ? '' : String(text);
    let last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(s)) !== null) {
      if (m.index > last) parent.append(document.createTextNode(s.slice(last, m.index)));
      const url = m[0].replace(/[.,;:)\]]+$/, '');
      parent.append(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
      last = m.index + m[0].length;
    }
    if (last < s.length) parent.append(document.createTextNode(s.slice(last)));
  }

  function linkified(tag, cls, text) {
    const el = h(tag, cls ? { class: cls } : {});
    appendTextWithLinks(el, text);
    return el;
  }

  function valueRows(labels, values) {
    const rows = [];
    Object.keys(labels || {}).forEach((id) => {
      const v = values ? values[id] : '';
      const isCheckbox = typeof v === 'boolean' || v === 'true' || v === 'false';
      if (Array.isArray(v)) {
        const files = v.filter((f) => f && f.url);
        rows.push({ label: labels[id], value: files.map((f) => f.name || 'attachment').join(', ') || '—', files: files, image: null, checked: null });
        return;
      }
      if (typeof v === 'string' && v.indexOf('data:image/') === 0) {
        rows.push({ label: labels[id], value: 'Signed', files: null, image: v, checked: null });
        return;
      }
      let display;
      if (isCheckbox) display = (v === true || v === 'true') ? 'Agreed' : 'Not agreed';
      else display = v == null || v === '' ? '—' : String(v);
      rows.push({ label: labels[id], value: display, files: null, image: null, checked: isCheckbox ? (v === true || v === 'true') : null });
    });
    return rows;
  }

  function mediaNode(row) {
    if (row.image) {
      return h('span', { class: 'media-inline' }, h('img', { class: 'sig-image', src: row.image, alt: 'Drawn signature' }));
    }
    if (row.files && row.files.length) {
      const wrap = h('span', { class: 'media-inline' });
      row.files.forEach((f) => {
        const isImage = f.type && /^image\//.test(f.type);
        wrap.append(h('a', { class: 'attach-view__item', href: f.url, target: '_blank', rel: 'noopener noreferrer' },
          isImage ? h('img', { src: f.url, alt: f.name || 'attachment', loading: 'lazy' })
                  : h('span', { class: 'attach-view__doc', text: '📄 ' + (f.name || 'document') })));
      });
      return wrap;
    }
    return null;
  }

  function buildDetail(rec) {
    const sub = rec.submission || {};
    const L = sub._labels || { about: {}, revision: {}, ack: {} };
    const about = sub.about || {};
    const wrap = h('article', { class: 'detail' });

    const nameId = Object.keys(L.about || {}).find((id) => /client name/i.test(L.about[id]));
    const projId = Object.keys(L.about || {}).find((id) => /project/i.test(L.about[id]));
    const name = nameId ? about[nameId] : 'Revision request';
    const project = projId ? about[projId] : '';
    wrap.append(h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow', text: sub.business || 'Pepper & Olive Interiors' }),
      h('h1', { text: 'Design Revision Request' }),
      h('p', { class: 'view-head__meta', text: [name, project, 'Submitted ' + fmtDate(rec.submittedAt)].filter(Boolean).join(' · ') })
    ));

    const aboutCard = h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { text: 'About this round' }))));
    const dl = h('dl', { class: 'kv' });
    valueRows(L.about, about).forEach((r) => {
      const dd = linkified('dd', null, r.value);
      const media = mediaNode(r);
      if (media) dd.append(media);
      dl.append(h('div', { class: 'kv__row' }, h('dt', { text: r.label }), dd));
    });
    aboutCard.append(dl);
    wrap.append(aboutCard);

    const itemCard = h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('div', {}, h('h2', { text: 'Revision items' }))));
    (sub.revisions || []).forEach((rev, i) => {
      const item = h('div', { class: 'view-item' });
      item.append(h('div', { class: 'view-item__head' },
        h('span', { class: 'item__badge', text: '#' + (i + 1) }),
        h('strong', { text: rev.category || rev.location || ('Revision ' + (i + 1)) })));
      valueRows(L.revision, rev).forEach((r) => {
        if (r.value === '—') return;
        if (r.label === (L.revision || {}).category && r.value === (rev.category || '')) return;
        const value = linkified('p', 'view-item__value', r.value);
        const media = mediaNode(r);
        if (media) value.append(media);
        item.append(h('div', { class: 'view-item__field' },
          h('span', { class: 'view-item__label', text: r.label }),
          value));
      });
      itemCard.append(item);
    });
    wrap.append(itemCard);

    const ackRows = valueRows(L.ack, sub.acknowledgment || {});
    if (ackRows.length) {
      const ackCard = h('section', { class: 'card' },
        h('div', { class: 'card__head' }, h('div', {}, h('h2', { text: 'Acknowledgment' }))));
      ackRows.forEach((r) => {
        const isAck = r.checked !== null;
        const inner = h('div', {}, h('p', { class: 'ack-row__label', text: r.label }));
        if (!isAck) {
          const value = linkified('p', 'ack-row__value', r.value);
          const media = mediaNode(r);
          if (media) value.append(media);
          inner.append(value);
        }
        ackCard.append(h('div', { class: 'ack-row' + (isAck && r.checked ? ' ack-row--ok' : '') },
          isAck ? h('span', { class: 'ack-row__mark', text: r.checked ? '✓' : '✕' }) : null,
          inner
        ));
      });
      wrap.append(ackCard);
    }
    return wrap;
  }

  let detailRecord = null;

  function openDetail(rec) {
    detailRecord = rec;
    const body = document.querySelector('#detailBody');
    body.innerHTML = '';
    body.append(buildDetail(rec));
    document.querySelector('#detailOverlay').hidden = false;
    document.body.classList.add('detail-open');
  }

  function closeDetail() {
    document.querySelector('#detailOverlay').hidden = true;
    document.body.classList.remove('detail-open');
    detailRecord = null;
  }

  function recordName(rec) {
    const sub = rec.submission || {};
    const L = (sub._labels && sub._labels.about) || {};
    const id = Object.keys(L).find((k) => /client name/i.test(L[k]));
    return String((id && sub.about[id]) || 'revision-request').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  }

  function exportRecordJson(rec) {
    download(recordName(rec) + '.json', JSON.stringify(rec.submission || {}, null, 2), 'application/json');
  }

  function exportRecordCsv(rec) {
    download(recordName(rec) + '.csv', buildCsv([rec]), 'text/csv;charset=utf-8');
  }

  // ── Office settings (Google Sheet work-queue URL) ────────────────────────
  function applySettings(settings) {
    workQueueSheetUrl = (settings && settings.sheetUrl) || '';
    const input = document.querySelector('#sheetUrlInput');
    if (input) input.value = workQueueSheetUrl;
    ['openSheetBtn', 'sheetBtn'].forEach((id) => {
      const el = document.querySelector('#' + id);
      if (!el) return;
      if (workQueueSheetUrl) { el.href = workQueueSheetUrl; el.hidden = false; }
      else { el.hidden = true; }
    });
  }

  async function saveSheetUrl() {
    const input = document.querySelector('#sheetUrlInput');
    const url = input ? input.value.trim() : '';
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': getKey() },
        body: JSON.stringify({ settings: { sheetUrl: url } })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error('save failed');
      applySettings(data.settings || {});
      renderRecords(lastRecords);
      toast('Sheet link saved');
    } catch (e) { toast('Could not save the sheet link'); }
  }

  // ── Office-issued request links (rounds) ────────────────────────────────
  function roundLink(id) { return location.origin + '/form.html?r=' + id; }

  async function loadRounds(key) {
    try {
      const res = await fetch('/api/rounds', { headers: { 'x-admin-key': key }, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) renderRounds(data.rounds || []);
    } catch (e) { /* ignore */ }
  }

  function renderRounds(rounds) {
    const list = document.querySelector('#roundsList');
    if (!list) return;
    list.innerHTML = '';
    if (!rounds.length) {
      list.append(h('p', { class: 'admin-empty', text: 'No request links yet — create one above.' }));
      return;
    }
    rounds.forEach((r) => {
      const status = r.status === 'submitted' ? 'Submitted' : (r.status === 'closed' ? 'Closed' : 'Open');
      const link = roundLink(r.id);
      const actions = h('div', { class: 'round-card__actions' },
        h('button', { type: 'button', class: 'btn btn--ghost', text: 'Copy link', onclick: (e) => copyText(link, e.currentTarget) }),
        r.status !== 'open' ? h('button', { type: 'button', class: 'btn btn--ghost', text: 'Reopen', onclick: () => reopenRound(r.id) }) : null,
        h('a', { class: 'btn btn--ghost', href: link, target: '_blank', rel: 'noopener', text: 'Open' }),
        h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete', onclick: () => deleteRound(r.id, r.clientName) })
      );
      list.append(h('div', { class: 'round-card' },
        h('div', { class: 'round-card__head' },
          h('strong', { text: (r.clientName ? r.clientName + ' · ' : '') + r.projectName }),
          h('span', { class: 'badge badge--' + (r.status || 'open'), text: status })
        ),
        h('div', { class: 'round-card__meta' },
          r.designPhase ? h('span', { text: r.designPhase }) : null,
          h('span', { text: 'Created ' + fmtDate(r.createdAt) }),
          r.submittedAt ? h('span', { text: '· ' + (r.itemCount || 0) + ' items submitted ' + fmtDate(r.submittedAt) }) : null,
          h('code', { class: 'code-chip', text: r.id })
        ),
        h('div', { class: 'round-card__link' }, h('input', { type: 'text', readonly: true, value: link })),
        actions
      ));
    });
  }

  async function createRound() {
    const projectName = document.querySelector('#nrProject').value.trim();
    const err = document.querySelector('#newRoundError');
    if (!projectName) { err.textContent = 'Project name is required.'; err.hidden = false; return; }
    err.hidden = true;
    try {
      const res = await fetch('/api/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': getKey() },
        body: JSON.stringify({
          clientName: document.querySelector('#nrClient').value.trim(),
          projectName: projectName,
          designPhase: document.querySelector('#nrPhase').value.trim(),
          note: document.querySelector('#nrNote').value.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error('create failed');
      document.querySelector('#newRoundLink').value = roundLink(data.round.id);
      document.querySelector('#newRoundResult').hidden = false;
      ['nrClient', 'nrProject', 'nrPhase', 'nrNote'].forEach((id) => { document.querySelector('#' + id).value = ''; });
      toast('Request link created');
      loadRounds(getKey());
    } catch (e) {
      err.textContent = 'Could not create the link. Please try again.';
      err.hidden = false;
    }
  }

  async function reopenRound(id) {
    try {
      const res = await fetch('/api/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': getKey() },
        body: JSON.stringify({ action: 'reopen', id: id })
      });
      if (!res.ok) throw new Error('reopen failed');
      toast('Request reopened — send the same link again');
      loadRounds(getKey());
    } catch (e) { toast('Could not reopen the request'); }
  }

  async function deleteRound(id, name) {
    if (!window.confirm('Delete the request link for ' + (name || 'this client') + '?')) return;
    try {
      const res = await fetch('/api/rounds?id=' + encodeURIComponent(id), { method: 'DELETE', headers: { 'x-admin-key': getKey() } });
      if (!res.ok) throw new Error('delete failed');
      toast('Request link deleted');
      loadRounds(getKey());
    } catch (e) { toast('Could not delete the link'); }
  }

  function renderRecords(records) {
    const active = records.filter((r) => !r.archived);
    const archived = records.filter((r) => r.archived);
    $('#adminSummary').textContent =
      active.length + (active.length === 1 ? ' active request' : ' active requests') +
      (archived.length ? ' · ' + archived.length + ' archived' : '');
    const ac = document.querySelector('#archivedCount');
    if (ac) ac.textContent = archived.length ? '(' + archived.length + ')' : '';
    renderRecordList('#adminList', active, false);
    renderRecordList('#archivedList', archived, true);
  }

  function renderRecordList(selector, records, isArchived) {
    const list = document.querySelector(selector);
    if (!list) return;
    list.innerHTML = '';

    if (!records.length) {
      list.append(h('p', { class: 'admin-empty', text: isArchived ? 'Nothing archived.' : 'No revision requests yet.' }));
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

      list.append(h('div', { class: 'sub' + (isArchived ? ' sub--archived' : '') },
        h('div', { class: 'sub__head' },
          h('strong', { text: name + (project ? ' · ' + project : '') }),
          h('span', { text: fmtDate(rec.submittedAt) }),
          h('span', { class: 'badge', text: (sub.revisions || []).length + (sub.revisions.length === 1 ? ' item' : ' items') })
        ),
        items,
        h('div', { class: 'sub__actions' },
          h('button', { type: 'button', class: 'btn btn--ghost', text: 'View', onclick: () => openDetail(rec) }),
          h('button', { type: 'button', class: 'btn btn--ghost', text: 'JSON', onclick: () => exportRecordJson(rec) }),
          h('button', { type: 'button', class: 'btn btn--ghost', text: 'CSV', onclick: () => exportRecordCsv(rec) }),
          workQueueSheetUrl ? h('a', { class: 'btn btn--ghost', href: workQueueSheetUrl, target: '_blank', rel: 'noopener', text: 'Sheet' }) : null,
          isArchived
            ? h('button', { type: 'button', class: 'btn btn--ghost', text: 'Unarchive', onclick: () => archiveSubmission(rec.id, false) })
            : h('button', { type: 'button', class: 'btn btn--ghost', text: 'Archive', onclick: () => archiveSubmission(rec.id, true) }),
          h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete', onclick: () => deleteSubmission(rec.id, name) })
        )
      ));
    });
  }

  async function archiveSubmission(id, archive) {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': getKey() },
        body: JSON.stringify({ action: archive ? 'archive' : 'unarchive', id: id })
      });
      if (!res.ok) throw new Error('archive failed');
      toast(archive ? 'Request archived' : 'Request restored');
      load(getKey(), false);
    } catch (e) {
      toast('Could not update the request');
    }
  }

  async function deleteSubmission(id, name) {
    if (!window.confirm('Permanently delete the revision request for ' + (name || 'this client') + '? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin?submission=' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'x-admin-key': getKey() }
      });
      if (!res.ok) throw new Error('delete failed');
      toast('Revision request deleted');
      load(getKey(), false);
    } catch (e) {
      toast('Could not delete the request');
    }
  }

  async function load(key, showErrorOnFail) {
    try {
      const data = await fetchRecords(key);
      if (data.unauthorized) { setKey(''); showGate(!!showErrorOnFail); return false; }
      setKey(key);
      showList();
      applySettings(data.settings || {});
      lastRecords = data.records || [];
      renderRecords(lastRecords);
      renderDrafts(data.drafts || []);
      loadRounds(key);
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

    // Submission detail overlay
    $('#detailCloseBtn').addEventListener('click', closeDetail);
    $('#detailOverlay').addEventListener('click', (e) => { if (e.target && e.target.id === 'detailOverlay') closeDetail(); });
    $('#detailPrintBtn').addEventListener('click', () => window.print());
    $('#detailJsonBtn').addEventListener('click', () => { if (detailRecord) exportRecordJson(detailRecord); });
    $('#detailCsvBtn').addEventListener('click', () => { if (detailRecord) exportRecordCsv(detailRecord); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#detailOverlay').hidden) closeDetail();
    });

    // Office-issued request links
    $('#createRoundBtn').addEventListener('click', createRound);
    $('#copyNewRoundBtn').addEventListener('click', (e) => copyText($('#newRoundLink').value, e.currentTarget));
    $('#saveSheetUrlBtn').addEventListener('click', saveSheetUrl);
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
