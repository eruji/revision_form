/* ═══════════════════════════════════════════════════════════════════════════
   Read-only view of a submitted revision request.
   Loaded by clients/view.html with either:
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

      // Attachments: an array of { name, type, url } references.
      if (Array.isArray(v)) {
        const files = v.filter((f) => f && f.url);
        if (opts.skipEmpty && !files.length) return;
        rows.push({
          label: labels[id],
          value: files.length ? files.map((f) => f.name || 'attachment').join(', ') : '—',
          files: files, image: null,
          checked: isCheckbox ? (v === true || v === 'true') : null
        });
        return;
      }

      // Drawn signature: stored as a data URL image.
      if (typeof v === 'string' && v.indexOf('data:image/') === 0) {
        rows.push({ label: labels[id], value: 'Signed', files: null, image: v, checked: null });
        return;
      }

      if (opts.skipEmpty && (v == null || v === '')) return;
      let display;
      if (isCheckbox) display = (v === true || v === 'true') ? 'Agreed' : 'Not agreed';
      else display = v == null || v === '' ? '—' : String(v);
      rows.push({ label: labels[id], value: display, files: null, image: null, checked: isCheckbox ? (v === true || v === 'true') : null });
    });
    return rows;
  }

  // Renders attachment thumbnails / a drawn signature. Uses only phrasing
  // content (span/img/a) so it can sit inside a <p> or <dd>.
  function mediaNode(row) {
    if (row.image) {
      return h('span', { class: 'media-inline' },
        h('img', { class: 'sig-image', src: row.image, alt: 'Drawn signature' })
      );
    }
    if (row.files && row.files.length) {
      const wrap = h('span', { class: 'media-inline' });
      row.files.forEach((f) => {
        const isImage = f.type && /^image\//.test(f.type);
        wrap.append(h('a', {
          class: 'attach-view__item', href: f.url, target: '_blank', rel: 'noopener noreferrer'
        }, isImage
          ? h('img', { src: f.url, alt: f.name || 'attachment', loading: 'lazy' })
          : h('span', { class: 'attach-view__doc', text: '📄 ' + (f.name || 'document') })
        ));
      });
      return wrap;
    }
    return null;
  }

  // Turn http(s) URLs inside a value into real, clickable links. Chrome's
  // "Save as PDF" carries these anchors through as clickable PDF links.
  const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

  function appendTextWithLinks(parent, text) {
    const s = text == null ? '' : String(text);
    let last = 0;
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(s)) !== null) {
      if (m.index > last) parent.append(document.createTextNode(s.slice(last, m.index)));
      const url = m[0].replace(/[.,;:)\]]+$/, '');
      const trailing = m[0].slice(url.length);
      parent.append(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
      if (trailing) parent.append(document.createTextNode(trailing));
      last = m.index + m[0].length;
    }
    if (last < s.length) parent.append(document.createTextNode(s.slice(last)));
  }

  function linkified(tag, cls, text) {
    const el = h(tag, cls ? { class: cls } : {});
    appendTextWithLinks(el, text);
    return el;
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
      const dd = linkified('dd', null, row.value);
      const media = mediaNode(row);
      if (media) dd.append(media);
      wrap.append(h('div', { class: 'kv__row' },
        h('dt', { text: row.label }),
        dd
      ));
    });
  }

  function revisionCard(rev, i, labels) {
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
      const value = linkified('p', 'view-item__value', row.value);
      const media = mediaNode(row);
      if (media) value.append(media);
      card.append(h('div', { class: 'view-item__field' },
        h('span', { class: 'view-item__label', text: row.label }),
        value
      ));
    });
    return card;
  }

  function renderItems(sub) {
    const wrap = $('#viewItems');
    wrap.innerHTML = '';
    const labels = (sub._labels && sub._labels.revision) || {};
    const items = sub.revisions || [];
    const rooms = Array.isArray(sub.rooms) ? sub.rooms : [];
    $('#viewItemCount').textContent =
      items.length + (items.length === 1 ? ' item' : ' items') + ' submitted';

    // Room-based submission: show each area with its approve/revise outcome.
    if (rooms.length) {
      rooms.forEach((room) => {
        const block = h('div', { class: 'view-room' });
        const approved = room.decision === 'approve';
        block.append(h('div', { class: 'view-room__head' },
          h('h3', { class: 'view-room__name', text: room.name }),
          h('span', { class: 'view-room__badge ' + (approved ? 'is-ok' : 'is-revise'),
            text: approved ? '✓ Approved' : '✎ Revisions requested' })
        ));
        if (approved) {
          block.append(h('p', { class: 'view-room__note', text: 'Approved as designed — no revisions for this area.' }));
        } else {
          (room.revisions || []).forEach((rev, i) => block.append(revisionCard(rev, i, labels)));
        }
        wrap.append(block);
      });
      return;
    }

    items.forEach((rev, i) => wrap.append(revisionCard(rev, i, labels)));
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
      const inner = h('div', {}, h('p', { class: 'ack-row__label', text: row.label }));
      if (!isAck) {
        const value = linkified('p', 'ack-row__value', row.value);
        const media = mediaNode(row);
        if (media) value.append(media);
        inner.append(value);
      }
      wrap.append(h('div', { class: 'ack-row' + (isAck && row.checked ? ' ack-row--ok' : '') },
        isAck ? h('span', { class: 'ack-row__mark', text: row.checked ? '✓' : '✕' }) : null,
        inner
      ));
    });
  }

  function render(sub, submittedAt, opts) {
    opts = opts || {};
    const isDraft = !!opts.draft;
    const brandName = $('#brandName');
    if (brandName) brandName.textContent = sub.business || CFG.business || 'Revision Request';
    $('#viewBusiness').textContent = sub.business || CFG.business || '';
    $('#viewTitle').textContent = (isDraft ? 'Draft ' : '') + (CFG.formTitle || 'Design Revision Request');
    $('#footBusiness').textContent = sub.business || CFG.business || '';
    document.title = (isDraft ? 'Draft — ' : 'Revision Request — ') + (sub.business || 'Read-only copy');

    // Draft banner
    if (isDraft) {
      $('#draftBanner').hidden = false;
      $('#draftBannerText').textContent =
        'This is a saved draft' + (opts.code ? ' (code ' + opts.code + ')' : '') +
        '. Nothing has been submitted yet — the client can continue editing with the resume link. ' +
        'Drafts are kept for 30 days.';
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
        const res = await fetch('/clients/api/draft?code=' + encodeURIComponent(draftCode), { cache: 'no-store' });
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
        const res = await fetch('/clients/api/get?token=' + encodeURIComponent(token), { cache: 'no-store' });
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
