/* ═══════════════════════════════════════════════════════════════════════════
   Pepper & Olive Interiors — Revision Request (proof of concept)
   Vanilla JS. No build step, no server. Open clients/form.html directly.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Storage keys ─────────────────────────────────────────────────────────
  const KEY_DRAFT = 'po_revision_draft_v1';
  const KEY_SUBMISSIONS = 'po_revision_submissions_v1';

  // ── Runtime state ────────────────────────────────────────────────────────
  // The configuration and its Team setup persistence live in setup.js.
  let CFG = window.TeamSetup.getConfig();   // effective configuration
  const state = {
    about: {},
    acknowledgment: {},
    items: [],                          // [{ uid, values: { fieldId: value } }]
    round: null                         // office-issued request context, if any
  };
  let activeResumeCode = '';   // set when the client resumed a server-side draft
  let booted = false;

  // ── Tiny DOM helper ──────────────────────────────────────────────────────
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── Utilities ────────────────────────────────────────────────────────────
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function fmtDateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Make URLs clickable in read-only lists.
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

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // ── Backend API (Netlify Functions) ──────────────────────────────────────
  const API = {
    submit: '/clients/api/submit',
    get: '/clients/api/get',
    draft: '/clients/api/draft',
    upload: '/clients/api/upload'
  };

  // Attachments
  const MAX_ATTACHMENTS = 5;                 // per revision item
  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;  // matches netlify/functions/upload.js
  const ATTACH_TYPES = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';
  const IMAGE_MAX_DIM = 1600;

  async function apiFetch(url, options) {
    const res = await fetch(url, Object.assign({ cache: 'no-store' }, options || {}));
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { res: res, data: data };
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

  // ── Attachment helpers (photos / PDFs) ───────────────────────────────────
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = src;
    });
  }

  /**
   * Re-encodes large photos to a sensible print size before upload, so a 12 MP
   * phone photo does not blow the 4 MB cap or slow the form down. Small images
   * and PDFs/GIFs are uploaded untouched.
   */
  async function prepareAttachment(file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(file.name + ' is larger than 4 MB');
    }
    const isImage = /^image\//.test(file.type || '');
    const dataUrl = await readAsDataUrl(file);
    if (!isImage || file.type === 'image/gif') {
      return { dataUrl: dataUrl, type: file.type || 'application/pdf' };
    }
    try {
      const img = await loadImage(dataUrl);
      const longest = Math.max(img.width, img.height);
      const needsResize = longest > IMAGE_MAX_DIM || file.size > 1.5 * 1024 * 1024;
      if (!needsResize) return { dataUrl: dataUrl, type: file.type };
      const scale = Math.min(1, IMAGE_MAX_DIM / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), type: 'image/jpeg' };
    } catch (e) {
      return { dataUrl: dataUrl, type: file.type || 'image/png' };
    }
  }

  async function uploadAttachment(file) {
    const prepared = await prepareAttachment(file);
    const out = await apiFetch(API.upload, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: prepared.type, dataUrl: prepared.dataUrl })
    });
    if (!out.res.ok || !out.data || !out.data.ok || !out.data.file) {
      throw new Error((out.data && out.data.error) || 'Could not upload that file');
    }
    return out.data.file;
  }

  // ── Configuration lives in setup.js (TeamSetup.getConfig) ────────────────

  // ── Field rendering ──────────────────────────────────────────────────────
  function enabled(list) { return (list || []).filter((f) => f.enabled !== false); }

  /**
   * Builds one labeled form field bound to `onChange`.
   * Returns a wrapper element carrying .field (and data-half for layout).
   */
  function buildField(field, value, onChange) {
    if (field.type === 'file') return buildFileField(field, value, onChange);
    if (field.type === 'signature') return buildSignatureField(field, value, onChange);

    const wrap = h('div', {
      class: 'field' + (field.half ? '' : ' field--full'),
      'data-half': field.half ? 'true' : 'false',
      'data-field-id': field.id
    });

    if (field.type === 'checkbox') {
      const box = h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) }),
        h('span', { text: field.label + (field.required ? ' *' : '') })
      );
      wrap.className = 'field field--full';
      wrap.append(box);
      return wrap;
    }

    const label = h('label', { for: 'f-' + field.id + '-' + Math.random().toString(36).slice(2, 6) },
      field.label, field.required ? h('span', { class: 'req', text: '*' }) : null);
    wrap.append(label);

    if (field.help) wrap.append(h('p', { class: 'field__help', text: field.help }));

    let input;
    if (field.type === 'textarea') {
      input = h('textarea', { placeholder: field.placeholder || '', rows: 3 });
      input.value = value || '';
      input.addEventListener('input', () => onChange(input.value));
    } else if (field.type === 'select') {
      input = h('select', {});
      input.append(h('option', { value: '', text: 'Please choose…' }));
      (field.options || []).forEach((opt) => input.append(h('option', { value: opt, text: opt })));
      input.value = value || '';
      input.addEventListener('change', () => onChange(input.value));
    } else {
      const type = field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : 'text';
      input = h('input', { type: type, placeholder: field.placeholder || '' });
      input.value = value || '';
      input.addEventListener('input', () => onChange(input.value));
    }

    // Link the label to the input for accessibility.
    label.htmlFor = input.id = 'f-' + field.id + '-' + uid().slice(0, 5);

    wrap.append(input);
    return wrap;
  }

  // ── Attachments: a repeatable list of uploaded photos / PDFs ─────────────
  function buildFileField(field, value, onChange) {
    const wrap = h('div', {
      class: 'field field--full',
      'data-half': 'false',
      'data-field-id': field.id
    });
    const label = h('label', {}, field.label, field.required ? h('span', { class: 'req', text: '*' }) : null);
    wrap.append(label);
    if (field.help) wrap.append(h('p', { class: 'field__help', text: field.help }));

    let files = Array.isArray(value) ? value.slice() : [];
    const list = h('div', { class: 'attach-list' });
    const status = h('p', { class: 'attach-status' });
    const inputId = 'f-' + field.id + '-' + uid().slice(0, 6);
    const fileInput = h('input', {
      id: inputId, type: 'file', multiple: true, accept: ATTACH_TYPES, class: 'attach-input'
    });
    const pick = h('label', { class: 'attach-pick', for: inputId },
      h('span', { class: 'attach-pick__plus', 'aria-hidden': 'true', text: '＋' }),
      h('span', { class: 'attach-pick__text' },
        h('strong', { text: 'Add photos or PDFs' }),
        h('small', { text: 'Up to ' + MAX_ATTACHMENTS + ' files, 4 MB each' })
      )
    );

    function renderList() {
      list.innerHTML = '';
      files.forEach((f) => {
        const thumb = f.type && /^image\//.test(f.type)
          ? h('img', { src: f.url, alt: f.name || 'attachment', loading: 'lazy' })
          : h('span', { class: 'attach-chip__ext', text: (String(f.name || 'file').split('.').pop() || 'file').toUpperCase() });
        list.append(h('div', { class: 'attach-chip' },
          h('a', { class: 'attach-chip__thumb', href: f.url, target: '_blank', rel: 'noopener noreferrer' }, thumb),
          h('span', { class: 'attach-chip__name', text: f.name || 'attachment' }),
          h('button', {
            type: 'button', class: 'iconbtn iconbtn--danger', title: 'Remove',
            'aria-label': 'Remove ' + (f.name || 'attachment'),
            onclick: () => { files = files.filter((x) => x !== f); commit(); }
          }, '✕')
        ));
      });
      fileInput.disabled = files.length >= MAX_ATTACHMENTS;
      pick.classList.toggle('is-disabled', files.length >= MAX_ATTACHMENTS);
    }

    function commit() {
      onChange(files.slice());
      renderList();
    }

    fileInput.addEventListener('change', async () => {
      const picked = Array.from(fileInput.files || []);
      fileInput.value = '';
      const room = MAX_ATTACHMENTS - files.length;
      if (room <= 0) { toast('You can attach up to ' + MAX_ATTACHMENTS + ' files per item'); return; }
      const batch = picked.slice(0, room);
      if (picked.length > room) toast('Only the first ' + room + ' file' + (room === 1 ? '' : 's') + ' were added');
      for (let i = 0; i < batch.length; i++) {
        status.textContent = 'Uploading ' + (i + 1) + ' of ' + batch.length + '…';
        try {
          const uploaded = await uploadAttachment(batch[i]);
          files.push(uploaded);
          commit();
        } catch (err) {
          toast(err && err.message ? err.message : 'Could not upload that file');
        }
      }
      status.textContent = '';
    });

    wrap.append(pick, fileInput, list, status);
    renderList();
    return wrap;
  }

  // ── Drawn signature (canvas) ─────────────────────────────────────────────
  function buildSignatureField(field, value, onChange) {
    const wrap = h('div', {
      class: 'field field--full',
      'data-half': 'false',
      'data-field-id': field.id
    });
    wrap.append(h('label', {}, field.label, field.required ? h('span', { class: 'req', text: '*' }) : null));
    if (field.help) wrap.append(h('p', { class: 'field__help', text: field.help }));

    const canvas = document.createElement('canvas');
    canvas.className = 'sig-canvas';
    canvas.width = 600;
    canvas.height = 180;
    const clearBtn = h('button', { type: 'button', class: 'btn btn--ghost sig-clear', text: 'Clear' });
    wrap.append(h('div', { class: 'sig-wrap' }, canvas, clearBtn));

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let dirty = false;
    let last = null;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (r.width || 1);
      const scaleY = canvas.height / (r.height || 1);
      return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
    }
    function down(e) {
      drawing = true;
      last = pos(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.strokeStyle = '#2a2a24';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      dirty = true;
    }
    function up() {
      if (!drawing) return;
      drawing = false;
      if (dirty) onChange(canvas.toDataURL('image/png'));
    }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);

    clearBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      onChange('');
    });

    // Restore a signature saved in a draft / resumed on another device.
    if (typeof value === 'string' && value.indexOf('data:image/') === 0) {
      loadImage(value).then((img) => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); dirty = true; }).catch(() => {});
    }
    return wrap;
  }

  // ── Hero + sections ──────────────────────────────────────────────────────
  function renderHero() {
    const brandName = $('#brandName');
    if (brandName) brandName.textContent = CFG.business;
    $('#heroEyebrow').textContent = CFG.business;
    $('#heroTitle').textContent = CFG.formTitle;
    $('#heroSub').textContent = CFG.subtitle;
    $('#policyBody').textContent = CFG.intro;
    document.title = CFG.formTitle + ' — ' + CFG.business;
  }

  function renderAbout() {
    const wrap = $('#aboutFields');
    wrap.innerHTML = '';
    enabled(CFG.aboutFields).forEach((field) => {
      if (field.type === 'date' && !state.about[field.id]) state.about[field.id] = todayISO();
      wrap.append(buildField(field, state.about[field.id], (v) => {
        state.about[field.id] = v;
        scheduleDraftSave();
      }));
    });
  }

  function renderAck() {
    const wrap = $('#ackFields');
    wrap.innerHTML = '';
    enabled(CFG.ackFields).forEach((field) => {
      if (field.type === 'date' && !state.acknowledgment[field.id]) {
        state.acknowledgment[field.id] = todayISO();
      }
      wrap.append(buildField(field, state.acknowledgment[field.id], (v) => {
        state.acknowledgment[field.id] = v;
        scheduleDraftSave();
      }));
    });
  }

  // ── Review banner (only relevant when the page is opened with ?review) ────
  function initReviewBanner() {    let wanted = false;
    try { wanted = new URLSearchParams(location.search).has('review'); } catch (e) {}
    if (!wanted) return;
    try {
      if (sessionStorage.getItem('po_review_dismissed') === '1') return;
    } catch (e) {}
    $('#reviewBanner').hidden = false;
    document.body.classList.add('is-review');
  }

  // Team Setup is an internal tool, hidden from clients and revealed for the
  // team via ?manage=1. ?setup=1 opens the panel straight away.
  function initManageTools() {
    let manage = false;
    let openPanel = false;
    try {
      const p = new URLSearchParams(location.search);
      manage = p.has('manage') || p.has('setup');
      openPanel = p.has('setup');
    } catch (e) {}
    if (manage) {
      const el = $('#topbarActions');
      if (el) el.hidden = false;
    }
    if (openPanel) window.TeamSetup.open();
  }

  // ── Revision items (unlimited) ───────────────────────────────────────────
  function newItem(values) {
    return { uid: uid(), values: values || {} };
  }

  function renderItems() {
    const wrap = $('#items');
    wrap.innerHTML = '';
    state.items.forEach((item, idx) => wrap.append(buildItemCard(item, idx)));
    updateItemMeta();
  }

  function buildItemCard(item, idx) {
    const fields = enabled(CFG.revisionFields);

    const chip = h('span', { class: 'item__cat', text: categoryLabel(item) });
    const title = h('span', { class: 'item__title', text: 'Revision ' + (idx + 1) });
    const badge = h('span', { class: 'item__badge', text: '#' + (idx + 1) });

    const tools = h('div', { class: 'item__tools' },
      h('button', {
        type: 'button', class: 'iconbtn', title: 'Move up', 'aria-label': 'Move revision up',
        disabled: idx === 0, onclick: () => moveItem(idx, -1)
      }, '↑'),
      h('button', {
        type: 'button', class: 'iconbtn', title: 'Move down', 'aria-label': 'Move revision down',
        disabled: idx === state.items.length - 1, onclick: () => moveItem(idx, 1)
      }, '↓'),
      h('button', {
        type: 'button', class: 'iconbtn', title: 'Duplicate', 'aria-label': 'Duplicate revision',
        onclick: () => duplicateItem(idx)
      }, '⧉'),
      h('button', {
        type: 'button', class: 'iconbtn iconbtn--danger', title: 'Remove',
        'aria-label': 'Remove revision', disabled: state.items.length === 1,
        onclick: () => removeItem(idx)
      }, '🗑')
    );

    const head = h('div', { class: 'item__head' }, badge, title, chip, tools);

    const grid = h('div', { class: 'item__grid' });
    fields.forEach((field) => {
      grid.append(buildField(field, item.values[field.id], (v) => {
        item.values[field.id] = v;
        if (field.id === 'category') chip.textContent = categoryLabel(item);
        scheduleDraftSave();
      }));
    });

    return h('article', { class: 'item', 'data-uid': item.uid }, head, grid);
  }

  function categoryLabel(item) {
    const catField = enabled(CFG.revisionFields).find((f) => f.id === 'category');
    const v = catField ? item.values[catField.id] : '';
    return v || 'New revision';
  }

  function addItem() {
    state.items.push(newItem({}));
    renderItems();
    const cards = $$('#items .item');
    const last = cards[cards.length - 1];
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const firstInput = last.querySelector('input, select, textarea');
      if (firstInput) firstInput.focus({ preventScroll: true });
    }
    scheduleDraftSave();
  }

  function removeItem(idx) {
    if (state.items.length === 1) return;
    state.items.splice(idx, 1);
    renderItems();
    scheduleDraftSave();
  }

  function duplicateItem(idx) {
    const copy = newItem(deepClone(state.items[idx].values));
    state.items.splice(idx + 1, 0, copy);
    renderItems();
    toast('Revision duplicated');
    scheduleDraftSave();
  }

  function moveItem(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= state.items.length) return;
    const [it] = state.items.splice(idx, 1);
    state.items.splice(target, 0, it);
    renderItems();
    scheduleDraftSave();
  }

  function updateItemMeta() {
    const n = state.items.length;
    $('#itemCounter').textContent = n + (n === 1 ? ' item' : ' items');
    $('#itemsHint').textContent =
      n === 1
        ? 'Need to request more changes? Use “Add another revision”.'
        : 'That’s ' + n + ' revision items — add as many as you need.';
    // Renumber visible badges/titles and fix tool disabled states after mutations.
    $$('#items .item').forEach((card, i) => {
      const badge = card.querySelector('.item__badge');
      const title = card.querySelector('.item__title');
      if (badge) badge.textContent = '#' + (i + 1);
      if (title) title.textContent = 'Revision ' + (i + 1);
      const btns = card.querySelectorAll('.item__tools .iconbtn');
      if (btns[0]) btns[0].disabled = i === 0;
      if (btns[1]) btns[1].disabled = i === n - 1;
      if (btns[3]) btns[3].disabled = n === 1;
    });
  }

  // ── Validation + collection ──────────────────────────────────────────────
  function clearErrors() {
    $$('.has-error').forEach((n) => n.classList.remove('has-error'));
    $$('.field__error').forEach((n) => n.remove());
  }

  function flagError(fieldWrap, message) {
    if (!fieldWrap) return;
    fieldWrap.classList.add('has-error');
    const check = fieldWrap.querySelector('.check');
    if (check) check.classList.add('has-error');
    if (!fieldWrap.querySelector('.field__error')) {
      fieldWrap.append(h('p', { class: 'field__error', text: message || 'This field is required.' }));
    }
  }

  function isBlank(v) { return v == null || String(v).trim() === ''; }

  // Required-value check that understands attachments (a non-empty array) and
  // the drawn signature (a data URL string).
  function missingRequired(field, value) {
    if (field.type === 'file') return !Array.isArray(value) || value.length === 0;
    return isBlank(value);
  }

  function validate() {
    clearErrors();
    const problems = [];

    // About fields — skip when section 01 is hidden because the office-issued
    // link already supplied the project/phase/client context.
    const aboutHidden = $('#aboutCard') && $('#aboutCard').hidden;
    if (!aboutHidden) {
      enabled(CFG.aboutFields).forEach((f) => {
        if (f.required && missingRequired(f, state.about[f.id])) {
          const wrap = $('.field[data-field-id="' + f.id + '"]');
          flagError(wrap);
          problems.push(wrap);
        }
      });
    }

    // Revision items
    state.items.forEach((item, idx) => {
      enabled(CFG.revisionFields).forEach((f) => {
        if (!f.required) return;
        if (missingRequired(f, item.values[f.id])) {
          const card = $('.item[data-uid="' + item.uid + '"]');
          const wrap = card && card.querySelector('.field[data-field-id="' + f.id + '"]');
          flagError(wrap, 'Revision #' + (idx + 1) + ': ' + f.label + ' is required.');
          problems.push(wrap);
        }
      });
    });

    // Acknowledgment
    enabled(CFG.ackFields).forEach((f) => {
      const v = state.acknowledgment[f.id];
      const missing = f.type === 'checkbox' ? !v : (f.required && isBlank(v));
      if (f.required && missing) {
        const wrap = $('.field[data-field-id="' + f.id + '"]');
        flagError(wrap, f.type === 'checkbox' ? 'Please confirm this statement.' : undefined);
        problems.push(wrap);
      }
    });

    if (problems.length) {
      const first = problems[0];
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = first.querySelector('input, select, textarea');
        if (input) input.focus({ preventScroll: true });
      }
      toast(problems.length + ' item' + (problems.length === 1 ? '' : 's') + ' need attention');
      return false;
    }
    return true;
  }

  function labelMap(fields) {
    const map = {};
    enabled(fields).forEach((f) => { map[f.id] = f.label; });
    return map;
  }

  function collectSubmission() {
    // Snapshot only enabled fields, using labels at time of submission.
    const about = {};
    enabled(CFG.aboutFields).forEach((f) => { about[f.id] = state.about[f.id] || ''; });
    const ack = {};
    enabled(CFG.ackFields).forEach((f) => { ack[f.id] = state.acknowledgment[f.id] || ''; });
    const revisions = state.items.map((item) => {
      const row = {};
      enabled(CFG.revisionFields).forEach((f) => { row[f.id] = item.values[f.id] || ''; });
      return row;
    });

    return {
      id: uid(),
      submittedAt: new Date().toISOString(),
      business: CFG.business,
      hourlyRate: CFG.hourlyRate,
      about: about,
      revisions: revisions,
      acknowledgment: ack,
      _roundId: state.round ? state.round.id : undefined,
      _labels: {
        about: labelMap(CFG.aboutFields),
        revision: labelMap(CFG.revisionFields),
        ack: labelMap(CFG.ackFields)
      }
    };
  }

  // ── Draft persistence ────────────────────────────────────────────────────
  let draftTimer = null;
  function scheduleDraftSave() {
    $('#draftStatus').textContent = 'Saving…';
    $('#draftStatus').classList.remove('is-saved');
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      saveDraft();
      $('#draftStatus').textContent = 'Draft saved locally ✓';
      $('#draftStatus').classList.add('is-saved');
    }, 400);
  }

  function saveDraft() {
    saveDraftLocally();
  }

  function draftSnapshot() {
    return {
      about: state.about,
      acknowledgment: state.acknowledgment,
      items: state.items,
      roundId: state.round ? state.round.id : undefined,
      savedAt: new Date().toISOString()
    };
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(KEY_DRAFT);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.about = d.about || {};
      state.acknowledgment = d.acknowledgment || {};
      state.items = (d.items && d.items.length) ? d.items : [newItem({})];
      if (d.roundId && !state.round) state.round = { id: d.roundId };
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearDraft() {
    localStorage.removeItem(KEY_DRAFT);
  }

  // ── Submissions store ────────────────────────────────────────────────────
  function getSubmissions() {
    try { return JSON.parse(localStorage.getItem(KEY_SUBMISSIONS) || '[]'); }
    catch (e) { return []; }
  }

  function addSubmission(sub) {
    const all = getSubmissions();
    all.unshift(sub);
    try { localStorage.setItem(KEY_SUBMISSIONS, JSON.stringify(all)); } catch (e) {}
  }

  // Flatten a stored value for display: attachment arrays become their URLs,
  // and a drawn signature becomes a short label instead of a huge data URL.
  function cellText(v) {
    if (Array.isArray(v)) {
      return v.map((f) => (f && f.url) ? f.url : String(f)).filter(Boolean).join(' | ');
    }
    if (typeof v === 'string' && v.indexOf('data:image/') === 0) return 'Signed (drawn signature)';
    return v == null ? '' : String(v);
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function saveDraftToServer() {
    const data = {
      about: state.about,
      items: state.items,
      acknowledgment: state.acknowledgment,
      roundId: state.round ? state.round.id : undefined
    };
    const btn = $('#saveDraftBtn');
    btn.disabled = true;
    try {
      const out = await apiFetch(API.draft, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeResumeCode || undefined, data: data })
      });
      if (!out.res.ok || !out.data || !out.data.ok) throw new Error('save failed');
      activeResumeCode = out.data.code;
      $('#draftCode').value = out.data.code;
      $('#draftUrl').value = new URL(out.data.resumeUrl, location.href).href;
      $('#draftBody').textContent =
        'Your progress is saved. Keep this code (or link) to pick up where you left off — ' +
        'even on another device. Drafts are kept for 30 days, or until you submit.';
      $('#draftOverlay').hidden = false;
    } catch (e) {
      download('revision-draft.json', JSON.stringify({
        savedAt: new Date().toISOString(),
        about: state.about,
        items: state.items,
        acknowledgment: state.acknowledgment
      }, null, 2), 'application/json');
      toast('Server unavailable — downloaded a draft file instead');
    } finally {
      btn.disabled = false;
    }
  }

  function applyDraft(data) {
    state.about = data.about || {};
    state.acknowledgment = data.acknowledgment || {};
    state.items = (data.items && data.items.length) ? data.items : [newItem({})];
    if (data.roundId && !state.round) state.round = { id: data.roundId };
    renderAbout();
    renderItems();
    renderAck();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function resumeDraft(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    try {
      const out = await apiFetch(API.draft + '?code=' + encodeURIComponent(code));
      if (out.res.ok && out.data && out.data.ok && out.data.data) {
        applyDraft(out.data.data);
        activeResumeCode = code;
        saveDraftLocally();
        toast('Draft restored');
      } else {
        toast('No draft found for that code');
      }
    } catch (e) {
      toast('Could not reach the server to load that draft');
    }
  }

  function saveDraftLocally() {
    try { localStorage.setItem(KEY_DRAFT, JSON.stringify(draftSnapshot())); } catch (e) {}
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const sub = collectSubmission();
    const btn = $('#submitBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    let viewUrl = '';
    let offline = false;
    try {
      const out = await apiFetch(API.submit, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission: sub })
      });
      if (out.res.ok && out.data && out.data.ok && out.data.token) {
        sub._token = out.data.token;
        sub._viewUrl = out.data.viewUrl;
        viewUrl = out.data.viewUrl;
      } else {
        offline = true;
      }
    } catch (err) {
      offline = true;
    }

    btn.disabled = false;
    btn.textContent = original;

    sub._localId = sub.id;
    addSubmission(sub);

    // The round is now submitted, so its server-side draft is no longer needed.
    if (activeResumeCode) {
      try { await apiFetch(API.draft + '?code=' + encodeURIComponent(activeResumeCode), { method: 'DELETE' }); } catch (err) {}
      activeResumeCode = '';
    }

    clearDraft();
    showSuccess(sub, viewUrl, offline);
  }

  function showSuccess(sub, viewUrl, offline) {
    const about = sub._labels.about;
    const nameId = Object.keys(about).find((id) => /client name/i.test(about[id]));
    const name = nameId ? sub.about[nameId] : '';
    $('#successBody').textContent =
      (name ? 'Thank you, ' + name + '! ' : 'Thank you! ') +
      'We received ' + sub.revisions.length +
      (sub.revisions.length === 1 ? ' revision item' : ' revision items') +
      ' for this design phase. Our team will review and follow up shortly.';

    const link = viewUrl
      ? new URL(viewUrl, location.href).href
      : new URL('view.html?local=' + encodeURIComponent(sub.id), location.href).href;
    $('#readonlyUrl').value = link;
    $('#readonlyHint').textContent = offline
      ? 'The shared server was unavailable, so this copy is stored in this browser only — keep this link to view it.'
      : 'Anyone with this link can view a read-only copy — keep it private.';

    $('#successOverlay').hidden = false;
  }

  function hideSuccess() {
    $('#successOverlay').hidden = true;
  }

  function resetForm() {
    state.about = {};
    state.acknowledgment = {};
    state.items = [newItem({})];
    activeResumeCode = '';
    clearDraft();
    hydrateState();
    renderHero();
    renderAbout();
    renderItems();
    renderAck();
    hideSuccess();
    $('#draftStatus').textContent = 'Draft saved locally';
    $('#draftStatus').classList.remove('is-saved');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Office-issued request context (replaces section 01) ──────────────────
  async function loadRoundContext() {
    let id = '';
    try { id = new URLSearchParams(location.search).get('r') || ''; } catch (e) {}
    if (!id) return;
    try {
      const out = await apiFetch('/clients/api/round?id=' + encodeURIComponent(id));
      if (out.res.ok && out.data && out.data.ok && out.data.round) applyRound(out.data.round);
    } catch (e) { /* offline: fall back to section 01 */ }
  }

  function applyRound(round) {
    state.round = round;
    state.about = state.about || {};
    const set = (id, v) => { if (v != null && v !== '') state.about[id] = v; };
    set('clientName', round.clientName);
    set('projectName', round.projectName);
    set('designPhase', round.designPhase);
    if (!state.about.dateSubmitted) state.about.dateSubmitted = todayISO();

    const banner = $('#contextBanner');
    if (banner) {
      $('#contextTitle').textContent = round.projectName + (round.designPhase ? ' — ' + round.designPhase : '');
      const meta = [];
      if (round.clientName) meta.push('Prepared for ' + round.clientName);
      if (round.reopenedAt) meta.push('Reopened ' + fmtDateShort(round.reopenedAt));
      $('#contextMeta').textContent = meta.join(' · ');
      const note = $('#contextNote');
      note.textContent = round.note || '';
      note.hidden = !round.note;
      banner.hidden = false;
    }

    const aboutCard = $('#aboutCard');
    if (aboutCard) aboutCard.hidden = true;

    if (round.previousItems && round.previousItems.length) renderPreviousItems(round.previousItems);
    renumberSteps();
  }

  function renderPreviousItems(items) {
    const panel = $('#previousPanel');
    const wrap = $('#previousItems');
    if (!panel || !wrap) return;
    wrap.innerHTML = '';
    const labels = labelMap(CFG.revisionFields);
    items.forEach((rev, i) => {
      const card = h('div', { class: 'prev-item' });
      card.append(h('div', { class: 'prev-item__head' },
        h('span', { class: 'item__badge', text: '#' + (i + 1) }),
        h('strong', { text: rev.category || rev.location || ('Item ' + (i + 1)) })));
      Object.keys(labels).forEach((id) => {
        const v = rev[id];
        if (v == null || v === '') return;
        if (id === 'category' && v === rev.category) return;
        card.append(h('div', { class: 'prev-item__field' },
          h('span', { class: 'view-item__label', text: labels[id] }),
          linkified('p', 'prev-item__value', cellText(v))));
      });
      wrap.append(card);
    });
    panel.hidden = false;
  }

  function renumberSteps() {
    const pairs = [['aboutCard', 'stepAbout'], ['itemsCard', 'stepItems'], ['ackCard', 'stepAck']];
    let n = 1;
    pairs.forEach(([cardId, stepId]) => {
      const card = document.getElementById(cardId);
      const step = document.getElementById(stepId);
      if (!card || !step) return;
      if (!card.hidden) { step.textContent = String(n).padStart(2, '0'); n++; }
    });
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  function hydrateState() {
    const restored = loadDraft();
    if (!restored) state.items = [newItem({})];
    if (!state.items.length) state.items = [newItem({})];
  }

  function bind() {
    $('#addItemBtn').addEventListener('click', addItem);
    $('#revisionForm').addEventListener('submit', handleSubmit);

    $('#dismissReview').addEventListener('click', () => {
      $('#reviewBanner').hidden = true;
      try { sessionStorage.setItem('po_review_dismissed', '1'); } catch (e) {}
    });

    // Save / resume long-form progress
    $('#saveDraftBtn').addEventListener('click', saveDraftToServer);
    $('#resumeDraftBtn').addEventListener('click', () => {
      const code = window.prompt('Enter your resume code (for example ABCD-2345):', activeResumeCode || '');
      if (code) resumeDraft(code);
    });
    $('#closeDraftBtn').addEventListener('click', () => { $('#draftOverlay').hidden = true; });
    $('#copyLinkBtn').addEventListener('click', (e) => copyText($('#readonlyUrl').value, e.currentTarget));
    $('#copyDraftCodeBtn').addEventListener('click', (e) => copyText($('#draftCode').value, e.currentTarget));
    $('#copyDraftUrlBtn').addEventListener('click', (e) => copyText($('#draftUrl').value, e.currentTarget));

    $('#clearDraftBtn').addEventListener('click', () => {
      clearDraft();
      resetForm();
      toast('Draft cleared');
    });

    // Success modal — dismiss by clicking the backdrop (or pressing Escape).
    $('#successOverlay').addEventListener('click', (e) => {
      if (e.target && e.target.id === 'successOverlay') hideSuccess();
    });

    // Team setup drawer (the panel logic lives in setup.js)
    $('#setupBtn').addEventListener('click', () => window.TeamSetup.open());

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#successOverlay').hidden) hideSuccess();
      if (!$('#draftOverlay').hidden) $('#draftOverlay').hidden = true;
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    if (booted) return;
    booted = true;
    hydrateState();
    renderHero();
    renderAbout();
    renderItems();
    renderAck();
    window.TeamSetup.init({
      onApply: (cfg) => {
        CFG = cfg;
        renderHero();
        renderAbout();
        renderItems();
        renderAck();
      }
    });
    bind();
    initReviewBanner();
    initManageTools();
    loadRoundContext();   // async: applies office-issued context and hides section 01
    try {
      const resume = new URLSearchParams(location.search).get('resume');
      if (resume) resumeDraft(resume);
    } catch (e) {}
    renumberSteps();
    if (localStorage.getItem(KEY_DRAFT)) {
      $('#draftStatus').textContent = 'Draft restored ✓';
      $('#draftStatus').classList.add('is-saved');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
