/* ═══════════════════════════════════════════════════════════════════════════
   Pepper & Olive Interiors — Revision Request (proof of concept)
   Vanilla JS. No build step, no server. Open index.html directly.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Storage keys ─────────────────────────────────────────────────────────
  const KEY_CONFIG = 'po_revision_config_v1';
  const KEY_DRAFT = 'po_revision_draft_v1';
  const KEY_SUBMISSIONS = 'po_revision_submissions_v1';

  const DEFAULTS = deepClone(window.REVISION_FORM_CONFIG);

  // ── Runtime state ────────────────────────────────────────────────────────
  let CFG = loadConfig();              // effective configuration
  let setupDraft = null;               // working copy while Team Setup is open
  const state = {
    about: {},
    acknowledgment: {},
    items: []                          // [{ uid, values: { fieldId: value } }]
  };
  let lastSubmission = null;

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

  // ── Configuration load / save ────────────────────────────────────────────
  function loadConfig() {
    try {
      const raw = localStorage.getItem(KEY_CONFIG);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.schemaVersion === DEFAULTS.schemaVersion) return saved;
      }
    } catch (e) { /* fall through to defaults */ }
    return deepClone(DEFAULTS);
  }

  function persistConfig() {
    try { localStorage.setItem(KEY_CONFIG, JSON.stringify(CFG)); } catch (e) {}
  }

  // ── Field rendering ──────────────────────────────────────────────────────
  function enabled(list) { return (list || []).filter((f) => f.enabled !== false); }

  /**
   * Builds one labeled form field bound to `onChange`.
   * Returns a wrapper element carrying .field (and data-half for layout).
   */
  function buildField(field, value, onChange) {
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

  // ── Hero + sections ──────────────────────────────────────────────────────
  function renderHero() {
    $('#brandName').textContent = CFG.business;
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
  function initReviewBanner() {
    let wanted = false;
    try { wanted = new URLSearchParams(location.search).has('review'); } catch (e) {}
    if (!wanted) return;
    try {
      if (sessionStorage.getItem('po_review_dismissed') === '1') return;
    } catch (e) {}
    $('#reviewBanner').hidden = false;
    document.body.classList.add('is-review');
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

  function validate() {
    clearErrors();
    const problems = [];

    // About fields
    enabled(CFG.aboutFields).forEach((f) => {
      if (f.required && isBlank(state.about[f.id])) {
        const wrap = $('.field[data-field-id="' + f.id + '"]');
        flagError(wrap);
        problems.push(wrap);
      }
    });

    // Revision items
    state.items.forEach((item, idx) => {
      enabled(CFG.revisionFields).forEach((f) => {
        if (!f.required) return;
        if (isBlank(item.values[f.id])) {
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
    try {
      localStorage.setItem(KEY_DRAFT, JSON.stringify({
        about: state.about,
        acknowledgment: state.acknowledgment,
        items: state.items,
        savedAt: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(KEY_DRAFT);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.about = d.about || {};
      state.acknowledgment = d.acknowledgment || {};
      state.items = (d.items && d.items.length) ? d.items : [newItem({})];
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

  // ── CSV ──────────────────────────────────────────────────────────────────
  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  function submissionRows(sub) {
    const aboutIds = Object.keys(sub._labels.about);
    const revIds = Object.keys(sub._labels.revision);
    const ackIds = Object.keys(sub._labels.ack);

    const header = [
      'Submitted At',
      ...aboutIds.map((id) => sub._labels.about[id]),
      ...revIds.map((id) => sub._labels.revision[id]),
      ...ackIds.map((id) => sub._labels.ack[id])
    ];
    const aboutVals = aboutIds.map((id) => sub.about[id]);
    const ackVals = ackIds.map((id) => sub.acknowledgment[id]);

    const rows = (sub.revisions || []).map((rev) => [
      sub.submittedAt,
      ...aboutVals,
      ...revIds.map((id) => rev[id]),
      ...ackVals
    ]);
    return { header: header, rows: rows.length ? rows : [header.map(() => '')] };
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const sub = collectSubmission();
    addSubmission(sub);
    lastSubmission = sub;
    clearDraft();
    showSuccess(sub);
  }

  function showSuccess(sub) {
    const about = sub._labels.about;
    const nameId = Object.keys(about).find((id) => /client name/i.test(about[id]));
    const name = nameId ? sub.about[nameId] : '';
    $('#successBody').textContent =
      (name ? 'Thank you, ' + name + '! ' : 'Thank you! ') +
      'We received ' + sub.revisions.length +
      (sub.revisions.length === 1 ? ' revision item' : ' revision items') +
      ' for this design phase. Our team will review and follow up shortly.';
    $('#payloadPreview').textContent = JSON.stringify(sub, null, 2);
    $('#successOverlay').hidden = false;
  }

  function hideSuccess() {
    $('#successOverlay').hidden = true;
  }

  function resetForm() {
    state.about = {};
    state.acknowledgment = {};
    state.items = [newItem({})];
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

  // ── Team setup ───────────────────────────────────────────────────────────
  function openSetup() {
    setupDraft = deepClone(CFG);
    renderSetup();
    $('#setupDrawer').hidden = false;
    $('#setupScrim').hidden = false;
  }

  function closeSetup() {
    $('#setupDrawer').hidden = true;
    $('#setupScrim').hidden = true;
    setupDraft = null;
  }

  function applySetupDraft() {
    if (!setupDraft) return;
    // Preserve any values the client already typed for fields that still exist.
    CFG = setupDraft;
    persistConfig();

    // Re-render the form against the new schema.
    renderHero();
    renderAbout();
    renderItems();
    renderAck();
    closeSetup();
    toast('Setup applied');
  }

  function fieldRow(field, list, opts) {
    opts = opts || {};
    const editableLabel = h('input', {
      class: 'fieldrow__name', value: field.label, 'aria-label': 'Field label',
      oninput: (e) => { field.label = e.target.value; }
    });

    const enabledToggle = h('label', { class: 'switch', title: 'Show this field' },
      h('input', {
        type: 'checkbox', checked: field.enabled !== false,
        disabled: !!field.locked,
        onchange: (e) => {
          field.enabled = e.target.checked;
          renderSetup();
        }
      }),
      'Show'
    );

    const requiredToggle = h('label', { class: 'switch', title: 'Make this field required' },
      h('input', {
        type: 'checkbox', checked: !!field.required,
        onchange: (e) => { field.required = e.target.checked; }
      }),
      'Required'
    );

    const tools = h('div', { class: 'fieldrow__tools' });
    if (opts.onMove) {
      tools.append(
        h('button', { type: 'button', class: 'iconbtn', title: 'Move up', onclick: () => opts.onMove(-1) }, '↑'),
        h('button', { type: 'button', class: 'iconbtn', title: 'Move down', onclick: () => opts.onMove(1) }, '↓')
      );
    }
    if (field.custom) {
      tools.append(h('button', {
        type: 'button', class: 'iconbtn iconbtn--danger', title: 'Delete custom field',
        onclick: () => {
          const i = list.indexOf(field);
          if (i > -1) list.splice(i, 1);
          renderSetup();
        }
      }, '✕'));
    }

    const meta = h('div', { class: 'fieldrow__meta' },
      h('span', { class: 'fieldrow__type', text: field.type }),
      enabledToggle,
      requiredToggle,
      field.locked ? h('span', { class: 'locked-tag', text: '🔒 core' }) : null
    );

    const row = h('div', { class: 'fieldrow' + (field.enabled === false ? ' is-off' : '') },
      h('div', { class: 'fieldrow__top' }, editableLabel, tools),
      meta
    );

    // Options editor for select fields.
    if (field.type === 'select') {
      const optsInput = h('input', {
        type: 'text', value: (field.options || []).join(' | '),
        oninput: (e) => {
          field.options = e.target.value.split('|').map((s) => s.trim()).filter(Boolean);
        }
      });
      row.append(h('div', { class: 'fieldrow__opts' },
        h('label', { text: 'Options (separate with |)' }),
        optsInput
      ));
    }
    return row;
  }

  function renderSetup() {
    const body = $('#setupBody');
    body.innerHTML = '';
    const cfg = setupDraft;

    // ── General ──
    const general = h('div', { class: 'setup-group' },
      h('h3', { text: 'General & policy copy' }),
      h('p', { text: 'Business name, rate, and the intro text clients read first.' }),
      h('div', { class: 'setup-inline' },
        h('div', { class: 'field' }, h('label', { text: 'Business name' }),
          h('input', { type: 'text', value: cfg.business, oninput: (e) => { cfg.business = e.target.value; } })),
        h('div', { class: 'field' }, h('label', { text: 'Hourly rate ($)' }),
          h('input', { type: 'number', value: cfg.hourlyRate, oninput: (e) => { cfg.hourlyRate = Number(e.target.value) || 0; } }))
      ),
      h('div', { class: 'field' }, h('label', { text: 'Form title' }),
        h('input', { type: 'text', value: cfg.formTitle, oninput: (e) => { cfg.formTitle = e.target.value; } })),
      h('div', { class: 'field' }, h('label', { text: 'Subtitle' }),
        h('input', { type: 'text', value: cfg.subtitle, oninput: (e) => { cfg.subtitle = e.target.value; } })),
      h('div', { class: 'field' }, h('label', { text: 'Policy / intro text' }),
        h('textarea', { class: 'setup-textarea', oninput: (e) => { cfg.intro = e.target.value; } }, cfg.intro))
    );
    body.append(general);

    // ── About fields ──
    const aboutGroup = h('div', { class: 'setup-group' },
      h('h3', { text: 'About-the-round questions' }),
      h('p', { text: 'Asked once per submission. Toggle visibility or require.' })
    );
    cfg.aboutFields.forEach((f) => aboutGroup.append(fieldRow(f, cfg.aboutFields, {})));
    body.append(aboutGroup);

    // ── Revision item fields ──
    const revGroup = h('div', { class: 'setup-group' },
      h('h3', { text: 'Revision item fields' }),
      h('p', { text: 'These repeat for every revision the client adds — this is the unlimited part.' })
    );
    cfg.revisionFields.forEach((f) => {
      const i = cfg.revisionFields.indexOf(f);
      revGroup.append(fieldRow(f, cfg.revisionFields, {
        onMove: (dir) => {
          const t = i + dir;
          if (t < 0 || t >= cfg.revisionFields.length) return;
          cfg.revisionFields.splice(i, 1);
          cfg.revisionFields.splice(t, 0, f);
          renderSetup();
        }
      }));
    });

    // Add custom field
    const newLabel = h('input', { type: 'text', placeholder: 'New question, e.g. “Budget impact”' });
    const newType = h('select', {},
      h('option', { value: 'text', text: 'Short text' }),
      h('option', { value: 'textarea', text: 'Long text' }),
      h('option', { value: 'select', text: 'Dropdown' }),
      h('option', { value: 'url', text: 'Link' })
    );
    const newOpts = h('input', { type: 'text', placeholder: 'Dropdown options separated by |' });
    newOpts.style.display = 'none';
    newType.addEventListener('change', () => { newOpts.style.display = newType.value === 'select' ? '' : 'none'; });

    revGroup.append(h('div', { class: 'fieldrow' },
      h('div', { class: 'fieldrow__meta' },
        h('strong', { text: 'Add a custom question' })
      ),
      h('div', { class: 'field' }, h('label', { text: 'Question label' }), newLabel),
      h('div', { class: 'setup-inline' },
        h('div', { class: 'field' }, h('label', { text: 'Type' }), newType),
        h('div', { class: 'field' }, h('label', { text: 'Options (if dropdown)' }), newOpts)
      ),
      h('div', { class: 'fieldrow__tools', style: 'margin-top:8px' },
        h('button', {
          type: 'button', class: 'btn btn--ghost', text: '＋ Add question',
          onclick: () => {
            const label = newLabel.value.trim();
            if (!label) { toast('Give the question a label first'); return; }
            const f = {
              id: 'custom_' + uid().slice(0, 8),
              label: label,
              type: newType.value,
              required: false,
              enabled: true,
              custom: true
            };
            if (newType.value === 'select') {
              f.options = newOpts.value.split('|').map((s) => s.trim()).filter(Boolean);
            }
            cfg.revisionFields.push(f);
            renderSetup();
          }
        })
      )
    ));
    body.append(revGroup);

    // ── Acknowledgment fields ──
    const ackGroup = h('div', { class: 'setup-group' },
      h('h3', { text: 'Acknowledgment & signature' }),
      h('p', { text: 'Confirmation statements and the typed electronic signature.' })
    );
    cfg.ackFields.forEach((f) => ackGroup.append(fieldRow(f, cfg.ackFields, {})));
    body.append(ackGroup);
  }

  function exportConfig() {
    const cfg = setupDraft || CFG;
    download('revision-form-config.json', JSON.stringify(cfg, null, 2), 'application/json');
    toast('Config exported');
  }

  function importConfig(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.revisionFields)) throw new Error('bad shape');
        parsed.schemaVersion = parsed.schemaVersion || DEFAULTS.schemaVersion;
        setupDraft = parsed;
        renderSetup();
        toast('Config loaded — review, then Save & apply');
      } catch (e) {
        toast('That file could not be read as a config');
      }
    };
    reader.readAsText(file);
  }

  // ── Office view ──────────────────────────────────────────────────────────
  function openOffice() {
    renderOffice();
    $('#officeDrawer').hidden = false;
    $('#officeScrim').hidden = false;
  }

  function closeOffice() {
    $('#officeDrawer').hidden = true;
    $('#officeScrim').hidden = true;
  }

  function renderOffice() {
    const body = $('#officeBody');
    body.innerHTML = '';
    const subs = getSubmissions();

    if (!subs.length) {
      body.append(h('div', { class: 'empty-state' },
        h('div', { text: '🗂' }),
        h('p', { text: 'No submissions yet.' }),
        h('p', { text: 'Submit the form to see how the office would receive and export the data.' })
      ));
      return;
    }

    subs.forEach((sub) => {
      const aboutId = Object.keys(sub._labels.about).find((id) => /client name/i.test(sub._labels.about[id]));
      const projId = Object.keys(sub._labels.about).find((id) => /project/i.test(sub._labels.about[id]));
      const author = aboutId ? sub.about[aboutId] : 'Client';
      const project = projId ? sub.about[projId] : '';
      const when = new Date(sub.submittedAt).toLocaleString();

      const itemsWrap = h('div', { class: 'sub__body' });
      sub.revisions.forEach((rev, i) => {
        const cat = rev.category || 'Revision';
        const loc = rev.location ? ' — ' + rev.location : '';
        const desc = rev.description || rev.reason || '';
        itemsWrap.append(h('div', { class: 'sub__item' },
          h('b', { text: '#' + (i + 1) + ' ' + cat + loc }),
          desc ? h('small', { text: desc }) : null
        ));
      });

      body.append(h('div', { class: 'sub' },
        h('div', { class: 'sub__head' },
          h('strong', { text: author + (project ? ' · ' + project : '') }),
          h('span', { text: when }),
          h('span', { class: 'badge', text: sub.revisions.length + (sub.revisions.length === 1 ? ' item' : ' items') }),
          h('button', {
            type: 'button', class: 'linkbtn', text: 'JSON',
            onclick: () => download('revision-' + author.replace(/\W+/g, '-').toLowerCase() + '.json', JSON.stringify(sub, null, 2), 'application/json')
          })
        ),
        itemsWrap
      ));
    });
  }

  function exportAllCsv() {
    const subs = getSubmissions();
    if (!subs.length) { toast('No submissions to export'); return; }
    let header = null;
    const rows = [];
    subs.forEach((sub) => {
      const r = submissionRows(sub);
      if (!header) header = r.header;
      r.rows.forEach((row) => rows.push(row));
    });
    download('revision-requests.csv', toCsv([header, ...rows]), 'text/csv');
    toast('CSV exported');
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

    $('#clearDraftBtn').addEventListener('click', () => {
      clearDraft();
      resetForm();
      toast('Draft cleared');
    });

    // Success modal
    $('#downloadJsonBtn').addEventListener('click', () => {
      if (lastSubmission) download('revision-request.json', JSON.stringify(lastSubmission, null, 2), 'application/json');
    });
    $('#downloadCsvBtn').addEventListener('click', () => {
      if (!lastSubmission) return;
      const r = submissionRows(lastSubmission);
      download('revision-request.csv', toCsv([r.header, ...r.rows]), 'text/csv');
    });
    $('#startOverBtn').addEventListener('click', resetForm);

    // Drawers
    $('#setupBtn').addEventListener('click', openSetup);
    $('#closeSetupBtn').addEventListener('click', closeSetup);
    $('#setupScrim').addEventListener('click', closeSetup);
    $('#saveConfigBtn').addEventListener('click', applySetupDraft);
    $('#exportConfigBtn').addEventListener('click', exportConfig);
    $('#importConfigBtn').addEventListener('click', () => $('#importConfigFile').click());
    $('#importConfigFile').addEventListener('change', (e) => {
      if (e.target.files[0]) importConfig(e.target.files[0]);
      e.target.value = '';
    });
    $('#resetConfigBtn').addEventListener('click', () => {
      setupDraft = deepClone(DEFAULTS);
      renderSetup();
      toast('Defaults restored — click Save & apply');
    });

    $('#officeBtn').addEventListener('click', openOffice);
    $('#closeOfficeBtn').addEventListener('click', closeOffice);
    $('#officeScrim').addEventListener('click', closeOffice);
    $('#exportAllCsvBtn').addEventListener('click', exportAllCsv);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#setupDrawer').hidden) closeSetup();
      if (!$('#officeDrawer').hidden) closeOffice();
      if (!$('#successOverlay').hidden) hideSuccess();
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    hydrateState();
    renderHero();
    renderAbout();
    renderItems();
    renderAck();
    bind();
    initReviewBanner();
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
