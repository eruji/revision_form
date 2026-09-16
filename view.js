/* ═══════════════════════════════════════════════════════════════════════════
   Read-only view of a submitted revision request.
   Loaded by view.html with either:
     ?token=...  -> fetched from the server (private link)
     ?local=...  -> read from this browser's localStorage (same-device fallback)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CFG = window.REVISION_FORM_CONFIG || {};
  const SUBMISSIONS_KEY = 'po_revision_submissions_v1';

  function $(sel) { return document.querySelector(sel); }

  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
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

  function params() {
    try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); }
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showError(message) {
    const status = $('#status');
    status.className = 'view-status view-status--error';
    status.textContent = message;
  }

  function labelValueRows(labels, values, opts) {    opts = opts || {};
    const rows = [];
    Object.keys(labels || {}).forEach((id) => {
      const v = values ? values[id] : '';
      const isCheckbox = typeof v === 'boolean' || v === 'true' || v === 'false';
      if (opts.skipEmpty && (v == null || v === '')) return;
      let display;
      if (isCheckbox) display = (v === true || v === 'true') ? 'Agreed' : 'Not agreed';
      else display = v == null || v === '' ? '—' : String(v);
      rows.push({ label: labels[id], value: display, checked: isCheckbox ? (v === true || v === 'true') : null });
    });
    return rows;
  }

  function cfgLabels() {
    const map = (fields) => {
      const m = {};
      (fields || []).forEach((f) => { if (f.enabled !== false) m[f.id] = f.label; });
      return m;
    };
    return {
      about: map(CFG.aboutFields),
      revision: map(CFG.revisionFields),
      ack: map(CFG.ackFields)
    };
  }

  function renderAbout(sub) {
    const wrap = $('#viewAbout');
    wrap.innerHTML = '';
    const labels = (sub._labels && sub._labels.about) || {};
    labelValueRows(labels, sub.about).forEach((row) => {
      wrap.append(h('div', { class: 'kv__row' },
        h('dt', { text: row.label }),
        h('dd', { text: row.value })
      ));
    });
  }

  function renderItems(sub) {
    const wrap = $('#viewItems');
    wrap.innerHTML = '';
    const labels = (sub._labels && sub._labels.revision) || {};
    const items = sub.revisions || [];
    $('#viewItemCount').textContent =
      items.length + (items.length === 1 ? ' item' : ' items') + ' submitted';

    items.forEach((rev, i) => {
      const card = h('div', { class: 'view-item' });
      const heading = rev.category || rev.location || ('Revision ' + (i + 1));
      card.append(h('div', { class: 'view-item__head' },
        h('span', { class: 'item__badge', text: '#' + (i + 1) }),
        h('strong', { text: heading })
      ));
      labelValueRows(labels, rev).forEach((row) => {
        // Skip the category/location we already surfaced in the heading.
        if (row.value === '—') return;
        if (row.label === labels.category && row.value === heading) return;
        card.append(h('div', { class: 'view-item__field' },
          h('span', { class: 'view-item__label', text: row.label }),
          h('p', { class: 'view-item__value', text: row.value })
        ));
      });
      wrap.append(card);
    });
  }

  function renderAck(sub) {
    const wrap = $('#viewAck');
    wrap.innerHTML = '';
    const labels = (sub._labels && sub._labels.ack) || {};
    const values = sub.acknowledgment || {};
    // Hide the section entirely for an untouched draft.
    const anyValue = Object.keys(values).some((k) => values[k] === true || values[k] === 'true' || (values[k] != null && values[k] !== ''));
    if (!anyValue) { $('#viewAckCard').hidden = true; return; }
    const rows = labelValueRows(labels, values);
    if (!rows.length) {
      $('#viewAckCard').hidden = true;
      return;
    }
    rows.forEach((row) => {
      const isAck = row.checked !== null;
      wrap.append(h('div', { class: 'ack-row' + (isAck && row.checked ? ' ack-row--ok' : '') },
        isAck ? h('span', { class: 'ack-row__mark', text: row.checked ? '✓' : '✕' }) : null,
        h('div', {},
          h('p', { class: 'ack-row__label', text: row.label }),
          isAck ? null : h('p', { class: 'ack-row__value', text: row.value })
        )
      ));
    });
  }

  function render(sub, submittedAt, opts) {
    opts = opts || {};
    const isDraft = !!opts.draft;
    $('#brandName').textContent = sub.business || CFG.business || 'Revision Request';
    $('#viewBusiness').textContent = sub.business || CFG.business || '';
    $('#viewTitle').textContent = (isDraft ? 'Draft ' : '') + (CFG.formTitle || 'Design Revision Request');
    $('#footBusiness').textContent = sub.business || CFG.business || '';
    document.title = (isDraft ? 'Draft — ' : 'Revision Request — ') + (sub.business || 'Read-only copy');

    // Draft banner
    if (isDraft) {
      $('#draftBanner').hidden = false;
      $('#draftBannerText').textContent =
        'This is a saved draft' + (opts.code ? ' (code ' + opts.code + ')' : '') +
        '. Nothing has been submitted yet — the client can continue editing with the resume link.';
    }

    const aboutLabels = (sub._labels && sub._labels.about) || {};
    const nameId = Object.keys(aboutLabels).find((id) => /client name/i.test(aboutLabels[id]));
    const projId = Object.keys(aboutLabels).find((id) => /project/i.test(aboutLabels[id]));
    const name = nameId ? sub.about[nameId] : '';
    const project = projId ? sub.about[projId] : '';
    const metaParts = [];
    if (name) metaParts.push(name);
    if (project) metaParts.push(project);
    metaParts.push((isDraft ? 'Saved ' : 'Submitted ') + fmtDate(submittedAt || sub.submittedAt));
    $('#viewMeta').textContent = metaParts.join(' · ');

    renderAbout(sub);
    renderItems(sub);
    renderAck(sub);

    $('#status').hidden = true;
    $('#view').hidden = false;

    const safeName = ((name || 'revision-request') + (isDraft ? '-draft' : '')).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    $('#downloadBtn').addEventListener('click', () =>
      download(safeName + '.json', JSON.stringify(sub, null, 2))
    );
  }

  async function load() {
    if (load._done) return;
    load._done = true;
    const p = params();
    const token = p.get('token');
    const localId = p.get('local');
    const draftCode = p.get('draft');

    if (draftCode) {
      try {
        const res = await fetch('/api/draft?code=' + encodeURIComponent(draftCode), { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && data.ok && data.data) {
          const d = data.data;
          render({
            business: CFG.business,
            about: d.about || {},
            revisions: (d.items || []).map((i) => i.values || {}),
            acknowledgment: d.acknowledgment || {},
            _labels: cfgLabels()
          }, data.savedAt, { draft: true, code: data.code });
          return;
        }
        showError('We could not find this draft. Please check that the full link was copied.');
        return;
      } catch (e) {
        showError('We could not load this draft right now. Please try again later.');
        return;
      }
    }

    if (token) {
      try {
        const res = await fetch('/api/get?token=' + encodeURIComponent(token), { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && data.ok) {
          render(data.submission, data.submittedAt);
          return;
        }
        showError('We could not find this revision request. Please check that the full link was copied.');
        return;
      } catch (e) {
        showError('We could not load this revision request right now. Please try again later.');
        return;
      }
    }

    if (localId) {
      try {
        const all = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY) || '[]');
        const found = all.find((s) => s.id === localId || s._localId === localId);
        if (found) { render(found, found.submittedAt); return; }
      } catch (e) { /* ignore */ }
      showError('This saved copy is only available in the browser it was created in.');
      return;
    }

    showError('No revision request was specified.');
  }

  $('#printBtn').addEventListener('click', () => window.print());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
