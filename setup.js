/* ═══════════════════════════════════════════════════════════════════════════
   Team setup — the configurable wording panel.
   Self-contained: it reads the shipped defaults from config.js
   (window.REVISION_FORM_CONFIG), persists edits to localStorage, and manages
   the setup drawer markup. It can be opened from any page that includes the
   drawer markup, with no client form present.

   Markup it expects (same IDs on every page):
     #setupDrawer, #setupScrim, #setupBody, #toast
     #closeSetupBtn, #saveConfigBtn, #exportConfigBtn, #importConfigBtn,
     #importConfigFile, #resetConfigBtn

   Usage:
     TeamSetup.init({ onApply: (cfg) => { ... } });
     TeamSetup.open();
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const KEY_CONFIG = 'po_revision_config_v1';
  const DEFAULTS = JSON.parse(JSON.stringify(window.REVISION_FORM_CONFIG || {}));

  let CFG = loadConfig();       // effective, persisted configuration
  let setupDraft = null;        // working copy while the panel is open
  let onApply = null;           // optional callback after Save & apply
  let bound = false;

  function $(sel) { return document.querySelector(sel); }

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

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2400);
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

  // ── Configuration load / save ────────────────────────────────────────────
  function loadConfig() {
    try {
      const raw = localStorage.getItem(KEY_CONFIG);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.schemaVersion === DEFAULTS.schemaVersion) return mergeDefaultFields(saved);
      }
    } catch (e) { /* fall through to defaults */ }
    return deepClone(DEFAULTS);
  }

  // A browser that saved its config before a release would otherwise never see
  // newly-shipped default fields (like attachments or the drawn signature).
  // Append any missing default field without discarding team customizations.
  function mergeDefaultFields(saved) {
    const merge = (list, defaults) => {
      const out = Array.isArray(list) ? list : [];
      (defaults || []).forEach((df) => {
        if (!out.some((f) => f && f.id === df.id)) out.push(deepClone(df));
      });
      return out;
    };
    saved.aboutFields = merge(saved.aboutFields, DEFAULTS.aboutFields);
    saved.revisionFields = merge(saved.revisionFields, DEFAULTS.revisionFields);
    saved.ackFields = merge(saved.ackFields, DEFAULTS.ackFields);
    return saved;
  }

  function persistConfig() {
    try { localStorage.setItem(KEY_CONFIG, JSON.stringify(CFG)); } catch (e) {}
  }

  // ── Panel ────────────────────────────────────────────────────────────────
  function open() {
    setupDraft = deepClone(CFG);
    render();
    $('#setupDrawer').hidden = false;
    $('#setupScrim').hidden = false;
  }

  function close() {
    $('#setupDrawer').hidden = true;
    $('#setupScrim').hidden = true;
    setupDraft = null;
  }

  function apply() {
    if (!setupDraft) return;
    CFG = setupDraft;
    persistConfig();
    if (onApply) onApply(CFG);
    close();
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
          render();
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
          render();
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

  function render() {
    const body = $('#setupBody');
    if (!body) return;
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
          render();
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
            render();
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
        render();
        toast('Config loaded — review, then Save & apply');
      } catch (e) {
        toast('That file could not be read as a config');
      }
    };
    reader.readAsText(file);
  }

  function resetToDefaults() {
    setupDraft = deepClone(DEFAULTS);
    render();
    toast('Defaults restored — click Save & apply');
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    const closeBtn = $('#closeSetupBtn');
    const scrim = $('#setupScrim');
    const saveBtn = $('#saveConfigBtn');
    const exportBtn = $('#exportConfigBtn');
    const importBtn = $('#importConfigBtn');
    const importFile = $('#importConfigFile');
    const resetBtn = $('#resetConfigBtn');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (scrim) scrim.addEventListener('click', close);
    if (saveBtn) saveBtn.addEventListener('click', apply);
    if (exportBtn) exportBtn.addEventListener('click', exportConfig);
    if (importBtn && importFile) importBtn.addEventListener('click', () => importFile.click());
    if (importFile) importFile.addEventListener('change', (e) => {
      if (e.target.files[0]) importConfig(e.target.files[0]);
      e.target.value = '';
    });
    if (resetBtn) resetBtn.addEventListener('click', resetToDefaults);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#setupDrawer') && !$('#setupDrawer').hidden) close();
    });
  }

  window.TeamSetup = {
    init(options) {
      if (options && typeof options.onApply === 'function') onApply = options.onApply;
      bindOnce();
      return this;
    },
    open: open,
    close: close,
    getConfig() { return CFG; }
  };
})();
