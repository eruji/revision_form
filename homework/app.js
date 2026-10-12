/* Pepper & Olive Interiors — Client Design Homework (interactive app) */
(function () {
  'use strict';

  let CFG = (window.TeamSetup && typeof window.TeamSetup.getHomeworkConfig === 'function')
    ? window.TeamSetup.getHomeworkConfig()
    : (window.DESIGN_HOMEWORK_CONFIG || {});
  const STORAGE_KEY = 'pno-design-homework-v2';
  const IMG = (id) => `assets/img/${id}.jpg`;

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    client: { name: '', project: '', email: '' },
    selections: {},   // categoryId -> optionId (single) | optionIds[] (multi)
    notes: {},        // categoryId -> string
    omitted: {},      // sectionId -> bool
    budget: {},       // budgetCatId -> { tier: index|null, note: '' }
    focusOn: {},      // categoryId -> bool (default true)
    step: 'welcome',
    expanded: [],     // sidebar expanded keys ('s:ID' / 'g:SECTION:GROUP')
    _roundId: null    // office-issued homework link id, if opened via ?r= or resume
  };

  let activeRound = null;  // full round context (banner + client prefill), not persisted

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const tag = document.getElementById('save-state');
      if (tag) { tag.textContent = '✓ Saved'; clearTimeout(save._t); save._t = setTimeout(() => (tag.textContent = ''), 1800); }
    } catch (e) { /* ignore */ }
  }

  // ── Steps ────────────────────────────────────────────────────────────────
  function steps() {
    const list = [
      { id: 'welcome', num: '01', title: 'Welcome' },
      ...CFG.sections.map((s) => ({ id: s.id, num: s.index, title: s.title })),
      { id: 'budget', num: CFG.budget.index, title: CFG.budget.title },
      { id: 'review', num: '17', title: 'Next Steps' }
    ];
    return list;
  }
  const allSteps = steps();
  const stepById = (id) => allSteps.find((s) => s.id === id);
  const stepIndex = (id) => allSteps.findIndex((s) => s.id === id);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function getSelection(catId) {
    const v = state.selections[catId];
    return v == null ? [] : (Array.isArray(v) ? v : [v]);
  }
  function isSelected(catId, optId) { return getSelection(catId).includes(optId); }
  function categoryHasChoice(catId) { return getSelection(catId).length > 0; }
  function focusOn(catId) { return state.focusOn[catId] !== false; } // default true
  function scrollTop() {
    const main = document.querySelector('.main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    renderSidebar();
    closeMoodOverlay();
    const content = document.getElementById('content');
    const st = stepById(state.step);
    if (st.id === 'welcome') content.innerHTML = renderWelcome();
    else if (st.id === 'budget') content.innerHTML = renderBudget();
    else if (st.id === 'review') content.innerHTML = renderReview();
    else content.innerHTML = renderSection(CFG.sections.find((s) => s.id === st.id));
    bindStepUI();
    updateNav();
    scrollTop();
  }

  function categoryDone(c) {
    if (c.selectionMode === 'note') return !!(state.notes[c.id] && state.notes[c.id].trim());
    return categoryHasChoice(c.id);
  }

  function groupDone(section, gid) {
    const cats = section.categories.filter((c) => c.group === gid);
    if (!cats.length) return false;
    return cats.every(categoryDone);
  }

  function sectionDone(sectionId) {
    const section = CFG.sections.find((s) => s.id === sectionId);
    if (!section) return false;
    if (state.omitted[sectionId]) return false;
    if (section.groups) {
      return section.groups.every((g) => groupDone(section, g.id));
    }
    const cats = section.categories.filter((c) => c.selectionMode !== 'note');
    if (!cats.length) return false;
    return cats.every((c) => categoryHasChoice(c.id));
  }

  function sectionProgress(section) {
    const cats = (section.categories || []).filter((c) => c.selectionMode !== 'note');
    const total = cats.length;
    const done = cats.filter((c) => categoryHasChoice(c.id)).length;
    return { total, done };
  }

  function stepProgress(stepId) {
    if (stepId === 'budget') {
      const total = CFG.budget.categories.length;
      const done = CFG.budget.categories.filter((c) => state.budget[c.id] && state.budget[c.id].tier != null).length;
      return { total, done };
    }
    if (stepId === 'welcome' || stepId === 'review') return { total: 0, done: 0 };
    const section = CFG.sections.find((s) => s.id === stepId);
    if (!section) return { total: 0, done: 0 };
    return sectionProgress(section);
  }

  function renderSidebar() {
    const side = document.getElementById('sidebar');
    if (!side) return;
    const html = allSteps.map((st) => {
      const section = CFG.sections.find((s) => s.id === st.id);
      const isCurrent = st.id === state.step;
      const prog = stepProgress(st.id);
      const done = prog.total > 0 && prog.done === prog.total;
      const checkText = prog.total > 0
        ? (prog.done === prog.total ? '✓' : (prog.done > 0 ? `${prog.done}/${prog.total}` : ''))
        : '';
      const skipped = !!state.omitted[st.id];
      const expKey = 's:' + st.id;
      const expanded = state.expanded.includes(expKey);
      let sub = '';
      if (section) {
        if (section.groups) {
          sub = section.groups.map((g) => {
            const gd = groupDone(section, g.id);
            return `
              <div class="sb-item ${gd ? 'done' : ''}">
                <a class="sb-sub" href="#group-${g.id}" data-jump-group="${section.id}:${g.id}">
                  <span class="sb-check">${gd ? '✓' : ''}</span><span>${esc(g.title)}</span>
                </a>
              </div>`;
          }).join('');
        } else {
          sub = section.categories.map((c) => {
            const cd = categoryDone(c);
            return `
              <div class="sb-item ${cd ? 'done' : ''}">
                <a class="sb-sub" href="#cat-${c.id}" data-jump-cat="${section.id}:${c.id}">
                  <span class="sb-check">${cd ? '✓' : ''}</span><span>${esc(c.title)}</span>
                </a>
              </div>`;
          }).join('');
        }
      }
      return `
        <div class="sb-section ${isCurrent ? 'current' : ''} ${done ? 'done' : ''} ${skipped ? 'skipped' : ''}">
          <div class="sb-row">
            <button class="sb-toggle" type="button" data-toggle-section="${st.id}" aria-label="Toggle">${expanded ? '▾' : '▸'}</button>
            <a class="sb-link" href="#" data-step="${st.id}">
              <span class="sb-num">${st.num}</span>
              <span class="sb-check sb-progress">${checkText}</span>
              <span>${esc(st.title)}</span>
            </a>
          </div>
          ${expanded ? `<div class="sb-children">${sub}</div>` : ''}
        </div>`;
    }).join('');
    side.innerHTML = html;
  }

  function renderWelcome() {
    return `
      <div class="hero-block">
        <p class="kicker">${esc(CFG.formTitle)}</p>
        <h1 class="section-title">${esc(CFG.welcome.title)}</h1>
        <p class="section-intro">${esc(CFG.welcome.body)}</p>
      </div>`;
  }

  function moodImage(optionId) { return `assets/img/mood/${optionId}.jpg`; }

  function openPreview(src, label) {
    document.getElementById('mood-sheet-title').textContent = label || 'Selected image';
    const img = document.getElementById('mood-sheet-img');
    img.src = src;
    img.alt = 'Preview — ' + (label || 'selected option');
    const ov = document.getElementById('mood-overlay');
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
  }

  function closeMoodOverlay() {
    const ov = document.getElementById('mood-overlay');
    if (ov) { ov.classList.remove('show'); ov.setAttribute('aria-hidden', 'true'); }
  }

  function renderSection(section) {
    const omitted = !!state.omitted[section.id];
    let catsHtml;
    if (section.groups) {
      catsHtml = section.groups.map((g) => {
        const gd = groupDone(section, g.id);
        const cats = section.categories.filter((c) => c.group === g.id).map((c) => renderCategory(c)).join('');
        return `
          <div class="group" id="group-${g.id}">
            <div class="group-head">
              <h2 class="group-title">${esc(g.title)}</h2>
              <span class="group-check ${gd ? 'done' : ''}">${gd ? '✓' : ''}</span>
            </div>
            <div class="cats">${cats}</div>
          </div>`;
      }).join('');
    } else {
      catsHtml = `<div class="cats">${section.categories.map((c) => renderCategory(c)).join('')}</div>`;
    }
    return `
      <div class="section ${omitted ? 'omitted' : ''}" data-section="${section.id}">
        <div class="section-head">
          <p class="kicker">${esc(section.index)} · ${esc(section.title)}</p>
          <h1 class="section-title">${esc(section.title)}</h1>
          ${section.intro ? `<p class="section-intro">${esc(section.intro)}</p>` : ''}
        </div>
        ${section.allowOmit ? `
          <label class="omit-wrap">
            <input type="checkbox" data-omit="${section.id}" ${omitted ? 'checked' : ''} />
            <span>This section doesn’t apply to our project</span>
          </label>` : ''}
        ${catsHtml}
      </div>`;
  }

  function renderCategory(c) {
    if (c.selectionMode === 'note') {
      const note = state.notes[c.id] || '';
      return `
        <div class="cat-card note-only" id="cat-${c.id}" data-cat="${c.id}">
          <h2 class="cat-title">${esc(c.title)}</h2>
          ${c.help ? `<p class="cat-help">${esc(c.help)}</p>` : ''}
          <label class="note-label" for="note-${c.id}">Notes</label>
          <textarea class="note-field" id="note-${c.id}" data-note="${c.id}" placeholder="Share your thoughts…">${esc(note)}</textarea>
        </div>`;
    }

    const opts = c.options.map((o) => {
      const sel = isSelected(c.id, o.id);
      return `
        <button type="button" class="opt ${sel ? 'selected' : ''}" data-opt="${o.id}" data-cat="${c.id}">
          <img class="opt-img" src="${IMG(o.id)}" alt="${esc(o.label)}" loading="lazy" />
          <span class="opt-label">${esc(o.label)}</span>
          ${o.note ? `<span class="opt-note">${esc(o.note)}</span>` : ''}
        </button>`;
    }).join('');

    const note = state.notes[c.id] || '';
    const focus = focusOn(c.id);
    const has = categoryHasChoice(c.id);
    const focusing = focus && has;

    return `
      <div class="cat-card ${focusing ? 'focusing' : ''}" id="cat-${c.id}" data-cat="${c.id}">
        <div class="cat-meta">
          <span>${c.selectionMode === 'multi' ? 'Select all that apply' : 'Select one'}</span>
        </div>
        <h2 class="cat-title">${esc(c.title)}</h2>
        ${c.help ? `<p class="cat-help">${esc(c.help)}</p>` : ''}
        <div class="opt-grid">${opts}</div>
        <label class="note-label" for="note-${c.id}">Notes <span style="font-weight:400;opacity:.7">(optional)</span></label>
        <textarea class="note-field" id="note-${c.id}" data-note="${c.id}" placeholder="Anything else about this?">${esc(note)}</textarea>
      </div>`;
  }

  function renderBudget() {
    const b = CFG.budget;
    const cards = b.categories.map((c) => {
      const cur = state.budget[c.id] || { tier: null, note: '' };
      const tiers = c.tiers.map((t, i) =>
        `<button type="button" class="tier ${cur.tier === i ? 'selected' : ''}" data-budget="${c.id}" data-tier="${i}">${esc(t)}</button>`
      ).join('');
      return `
        <div class="budget-card" data-budget-card="${c.id}">
          <h3>${esc(c.label)}</h3>
          <div class="tier-row">${tiers}</div>
          <label class="note-label" for="bnote-${c.id}">Notes</label>
          <textarea class="note-field" id="bnote-${c.id}" data-bnote="${c.id}" placeholder="Optional">${esc(cur.note)}</textarea>
        </div>`;
    }).join('');
    return `
      <div class="section-head">
        <p class="kicker">${esc(b.index)} · ${esc(b.title)}</p>
        <h1 class="section-title">${esc(b.title)}</h1>
        ${b.intro ? `<p class="section-intro">${esc(b.intro)}</p>` : ''}
      </div>
      <div class="budget-list">${cards}</div>`;
  }

  function clientDetailsCard() {
    if (activeRound) {
      return `
      <div class="cat-card">
        <h2 class="cat-title">Your details</h2>
        <p class="cat-help">Prepared by our team — no need to fill anything in.</p>
        <div class="sum-item"><strong>${esc(state.client.name || '—')}</strong> · ${esc(state.client.project || '')}</div>
        ${state.client.email ? `<div class="sum-item" style="color:var(--stone-600)">${esc(state.client.email)}</div>` : ''}
      </div>`;
    }
    return `
      <div class="cat-card">
        <h2 class="cat-title">Your details</h2>
        <p class="cat-help">So we know whose homework this is.</p>
        <div class="client-fields">
          <div class="field"><label for="c-name">Client name</label><input id="c-name" data-client="name" value="${esc(state.client.name)}" /></div>
          <div class="field"><label for="c-project">Project / address</label><input id="c-project" data-client="project" value="${esc(state.client.project)}" /></div>
          <div class="field full"><label for="c-email">Email</label><input id="c-email" type="email" data-client="email" value="${esc(state.client.email)}" /></div>
        </div>
      </div>`;
  }

  function renderReview() {
    return `
      <div class="section-head">
        <p class="kicker">17 · ${esc(CFG.closing.title)}</p>
        <h1 class="section-title">${esc(CFG.closing.title)}</h1>
        <p class="section-intro">${esc(CFG.closing.body)}</p>
      </div>
      ${clientDetailsCard()}
      <div class="cat-card" style="text-align:center;padding:28px;">
        <p style="margin:0 0 16px;color:var(--stone-600)">Review everything you’ve selected, then send it to our team — or save and finish later.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-outline" id="review-open-summary" type="button">View my summary</button>
          <button class="btn btn-outline" id="save-draft-btn" type="button">Save &amp; continue later</button>
          <button class="btn btn-solid" id="submit-btn" type="button">Submit my homework</button>
        </div>
        <div id="submit-status" style="margin-top:16px;font-size:13px;color:var(--stone-600);line-height:1.5;" aria-live="polite"></div>
      </div>`;
  }

  // ── Submission / drafts ───────────────────────────────────────────────────
  function draftData() {
    return {
      client: state.client, selections: state.selections, notes: state.notes,
      omitted: state.omitted, budget: state.budget, focusOn: state.focusOn, step: state.step,
      _roundId: state._roundId || undefined
    };
  }

  function buildSubmissionPayload() {
    const sections = CFG.sections.map((s) => {
      const skipped = !!state.omitted[s.id];
      const items = s.categories.map((c) => {
        if (c.selectionMode === 'note') return { category: c.title, options: [], note: state.notes[c.id] || '' };
        const sel = getSelection(c.id).map((oid) => {
          const o = (c.options || []).find((x) => x.id === oid);
          return o ? o.label : oid;
        });
        return { category: c.title, options: sel, note: state.notes[c.id] || '' };
      });
      return { id: s.id, number: s.index, title: s.title, skipped: skipped, items: items };
    });
    const budget = CFG.budget.categories.map((c) => {
      const cur = state.budget[c.id] || {};
      return { label: c.label, tier: (cur.tier != null ? c.tiers[cur.tier] : ''), note: cur.note || '' };
    });
    return {
      business: CFG.business,
      formTitle: CFG.formTitle,
      submittedAt: new Date().toISOString(),
      client: { name: state.client.name || '', project: state.client.project || '', email: state.client.email || '' },
      _roundId: state._roundId || undefined,
      sections: sections,
      budget: budget
    };
  }

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    return { ok: res.ok && data.ok !== false, status: res.status, data: data };
  }

  function setStatus(msg) {
    const el = document.getElementById('submit-status');
    if (el) el.innerHTML = msg;
  }

  async function saveDraft() {
    setStatus('Saving…');
    try {
      const r = await api('/homework/api/draft', {
        method: 'POST',
        body: JSON.stringify({ code: state._draftCode || null, data: draftData() })
      });
      if (!r.ok) throw new Error(r.data.error || 'Save failed');
      state._draftCode = r.data.code;
      save();
      setStatus('Saved. Your resume code is <strong>' + esc(r.data.code) + '</strong> — keep it to finish later on any device. ' +
        '<a href="?resume=' + encodeURIComponent(r.data.code) + '">Resume link</a>');
    } catch (e) {
      setStatus('Could not save right now — your work is still saved in this browser. (' + esc(e.message || String(e)) + ')');
    }
  }

  async function submitHomework() {
    if (!state.client.name || !state.client.project) {
      setStatus('Please add your <strong>name</strong> and <strong>project</strong> above before submitting.');
      scrollTop();
      return;
    }
    setStatus('Submitting…');
    try {
      const r = await api('/homework/api/submit', {
        method: 'POST',
        body: JSON.stringify({ submission: buildSubmissionPayload() })
      });
      if (!r.ok) throw new Error(r.data.error || 'Submit failed');
      setStatus('<strong style="color:var(--olive-dark)">Thank you — your Design Homework is on its way to our team.</strong><br>' +
        'Your private read-only copy: <a href="' + r.data.viewUrl + '">' + r.data.viewUrl + '</a>');
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    } catch (e) {
      setStatus('Could not submit right now. You can still print your summary and email it to us. (' + esc(e.message || String(e)) + ')');
    }
  }

  async function loadRoundContext(idOverride) {
    let id = idOverride || '';
    if (!id) { try { id = new URLSearchParams(location.search).get('r') || ''; } catch (e) {} }
    if (!id) return;
    try {
      const r = await api('/homework/api/round?id=' + encodeURIComponent(id));
      if (r.ok && r.data && r.data.round) applyRound(r.data.round);
    } catch (e) { /* offline: keep the bare form */ }
  }

  function applyRound(round) {
    activeRound = round;
    state._roundId = round.id;
    state.client = state.client || {};
    if (round.clientName) state.client.name = round.clientName;
    if (round.projectName) state.client.project = round.projectName;
    if (round.clientEmail && !state.client.email) state.client.email = round.clientEmail;

    const banner = document.getElementById('context-banner');
    if (banner) {
      const title = document.getElementById('context-title');
      const meta = document.getElementById('context-meta');
      const note = document.getElementById('context-note');
      const expiry = document.getElementById('context-expiry');
      const drive = document.getElementById('context-drive');
      if (title) title.textContent = round.projectName || 'Design Homework';
      if (meta) {
        const bits = [];
        if (round.clientName) bits.push('Prepared for ' + round.clientName);
        if (round.reopenedAt) bits.push('Reopened ' + new Date(round.reopenedAt).toLocaleDateString());
        if (round.previousSubmittedAt) bits.push('Previously submitted ' + new Date(round.previousSubmittedAt).toLocaleDateString());
        meta.textContent = bits.join(' · ');
      }
      if (note) { note.textContent = round.note || ''; note.hidden = !round.note; }
      if (expiry) {
        if (round.expiresAt) {
          expiry.textContent = 'Please submit by ' + new Date(round.expiresAt).toLocaleDateString() + '.';
          expiry.hidden = false;
        } else expiry.hidden = true;
      }
      if (drive) {
        if (round.driveUrl) { drive.href = round.driveUrl; drive.hidden = false; }
        else drive.hidden = true;
      }
      banner.hidden = false;
    }
    save();
    render();
  }

  async function checkResume() {
    let code = '';
    try { code = new URLSearchParams(location.search).get('resume') || ''; } catch (e) { code = ''; }
    if (!code) return;
    try {
      const r = await api('/homework/api/draft?code=' + encodeURIComponent(code));
      if (r.ok && r.data.data) {
        Object.assign(state, r.data.data);
        state._draftCode = code;
        if (state._roundId && !activeRound) loadRoundContext(state._roundId);
        save();
        render();
        setStatus('Resumed your saved homework (' + esc(code) + ').');
      }
    } catch (e) { /* ignore */ }
  }

  // ── Bind events ──────────────────────────────────────────────────────────
  function bindStepUI() {
    const content = document.getElementById('content');

    // Option selection (single or multi based on category)
    content.querySelectorAll('.opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.cat;
        const optId = btn.dataset.opt;
        const cat = findCategory(catId);
        const mode = cat ? cat.selectionMode : 'single';
        let cur = state.selections[catId];
        if (mode === 'multi') {
          const arr = Array.isArray(cur) ? cur : (cur ? [cur] : []);
          state.selections[catId] = arr.includes(optId) ? arr.filter((x) => x !== optId) : [...arr, optId];
        } else {
          state.selections[catId] = (cur === optId) ? null : optId;
        }
        save();
        // Update DOM directly (no re-bind) to avoid double-firing handlers
        content.querySelectorAll(`[data-cat="${catId}"].opt`).forEach((b) => {
          b.classList.toggle('selected', isSelected(catId, b.dataset.opt));
        });
        const card = content.querySelector(`.cat-card[data-cat="${catId}"]`);
        if (card) card.classList.toggle('focusing', focusOn(catId) && categoryHasChoice(catId));
        const sel = getSelection(catId);
        if (sel.length) {
          const opt = (cat.options || []).find((o) => o.id === sel[0]);
          const label = opt ? opt.label : sel[0];
          openPreview(cat && cat.mood ? moodImage(sel[0]) : IMG(sel[0]), label);
        } else {
          closeMoodOverlay();
        }
        renderSidebar();
        updateNav();
      });
    });

    // Notes (options categories)
    content.querySelectorAll('[data-note]').forEach((ta) => {
      ta.addEventListener('input', () => { state.notes[ta.dataset.note] = ta.value; save(); });
    });

    // Note-only categories share the same handler above via data-note.
    // Budget notes
    content.querySelectorAll('[data-bnote]').forEach((ta) => {
      ta.addEventListener('input', () => {
        const id = ta.dataset.bnote;
        state.budget[id] = state.budget[id] || { tier: null, note: '' };
        state.budget[id].note = ta.value;
        save();
      });
    });

    // Budget tier pick
    content.querySelectorAll('[data-budget]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.budget;
        const tier = parseInt(btn.dataset.tier, 10);
        state.budget[id] = state.budget[id] || { tier: null, note: '' };
        state.budget[id].tier = (state.budget[id].tier === tier) ? null : tier;
        save();
        renderBudgetInPlace(id);
        renderSidebar();
        updateNav();
      });
    });

    // Omit toggle
    content.querySelectorAll('[data-omit]').forEach((cb) => {
      cb.addEventListener('change', () => {
        state.omitted[cb.dataset.omit] = cb.checked;
        save();
        render();
      });
    });

    // Client fields
    content.querySelectorAll('[data-client]').forEach((inp) => {
      inp.addEventListener('input', () => { state.client[inp.dataset.client] = inp.value; save(); });
    });

    const openSummary = content.querySelector('#review-open-summary');
    if (openSummary) openSummary.addEventListener('click', openDrawer);
    const submitBtn = content.querySelector('#submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', submitHomework);
    const saveDraftBtn = content.querySelector('#save-draft-btn');
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', saveDraft);
  }

  function renderBudgetInPlace(id) {
    const card = document.querySelector(`[data-budget-card="${id}"]`);
    if (!card) return;
    const b = CFG.budget.categories.find((c) => c.id === id);
    const cur = state.budget[id] || { tier: null, note: '' };
    const tiers = card.querySelectorAll('.tier');
    tiers.forEach((t, i) => t.classList.toggle('selected', cur.tier === i));
    save();
  }

  function findCategory(catId) {
    for (const s of CFG.sections) {
      const c = s.categories.find((x) => x.id === catId);
      if (c) return c;
    }
    return null;
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function updateNav() {
    const i = stepIndex(state.step);
    document.getElementById('prev-btn').disabled = i === 0;
    const next = document.getElementById('next-btn');
    const last = i === allSteps.length - 1;
    next.textContent = last ? 'Finish →' : 'Next →';
    document.getElementById('steps-hint').textContent = `Step ${i + 1} of ${allSteps.length}`;
  }

  function go(stepId) {
    state.step = stepId;
    const key = 's:' + stepId;
    if (!state.expanded.includes(key)) state.expanded.push(key);
    save();
    render();
  }
  function goDelta(d) {
    const i = stepIndex(state.step);
    const ni = Math.min(allSteps.length - 1, Math.max(0, i + d));
    go(allSteps[ni].id);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  function buildSummary() {
    const parts = [];

    if (state.client.name || state.client.project || state.client.email) {
      parts.push(`
        <div class="sum-section">
          <h3><span class="sum-num">—</span> Client</h3>
          <div class="sum-item"><strong>${esc(state.client.name || '—')}</strong> · ${esc(state.client.project || '')}</div>
          ${state.client.email ? `<div class="sum-item" style="color:var(--stone-600)">${esc(state.client.email)}</div>` : ''}
        </div>`);
    }

    let pickCount = 0;

    CFG.sections.forEach((s) => {
      if (state.omitted[s.id]) {
        parts.push(`<div class="sum-section"><h3><span class="sum-num">${s.index}</span> ${esc(s.title)}</h3><div class="sum-skipped">Skipped — not applicable</div></div>`);
        return;
      }
      const items = [];
      s.categories.forEach((c) => {
        if (c.selectionMode === 'note') {
          if (state.notes[c.id]) items.push(`<div class="sum-note"><strong>${esc(c.title)}:</strong><br>${esc(state.notes[c.id])}</div>`);
          return;
        }
        const sel = getSelection(c.id);
        sel.forEach((oid) => {
          const opt = c.options.find((o) => o.id === oid);
          if (opt) { items.push(`<div class="sum-item"><img src="${IMG(oid)}" alt="" /><span>${esc(opt.label)}</span></div>`); pickCount++; }
        });
        if (state.notes[c.id]) items.push(`<div class="sum-note"><strong>${esc(c.title)}:</strong><br>${esc(state.notes[c.id])}</div>`);
      });
      if (items.length) {
        parts.push(`<div class="sum-section"><h3><span class="sum-num">${s.index}</span> ${esc(s.title)}</h3>${items.join('')}</div>`);
      }
    });

    // Budget
    const bParts = [];
    CFG.budget.categories.forEach((c) => {
      const cur = state.budget[c.id];
      if (!cur) return;
      const tier = cur.tier != null ? c.tiers[cur.tier] : null;
      if (tier) bParts.push(`<div class="sum-item"><span>${esc(c.label)}: <strong>${esc(tier)}</strong></span></div>`);
      if (cur.note) bParts.push(`<div class="sum-note"><strong>${esc(c.label)} note:</strong><br>${esc(cur.note)}</div>`);
    });
    if (bParts.length) parts.push(`<div class="sum-section"><h3><span class="sum-num">${CFG.budget.index}</span> ${esc(CFG.budget.title)}</h3>${bParts.join('')}</div>`);

    const head = `
      <div class="sum-section">
        <h3><span class="sum-num">✓</span> ${esc(CFG.business)}</h3>
        <div style="font-size:13px;color:var(--stone-600)">${esc(CFG.formTitle)} — ${pickCount} selection${pickCount === 1 ? '' : 's'} made</div>
      </div>`;

    return head + (parts.join('') || '<div class="sum-empty">Nothing selected yet — go explore the sections!</div>');
  }

  function openDrawer() {
    document.getElementById('summary-body').innerHTML = buildSummary();
    document.getElementById('summary-drawer').classList.add('open');
    document.getElementById('summary-drawer').setAttribute('aria-hidden', 'false');
    const scrim = document.getElementById('summary-scrim');
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('show'));
  }
  function closeDrawer() {
    document.getElementById('summary-drawer').classList.remove('open');
    document.getElementById('summary-drawer').setAttribute('aria-hidden', 'true');
    const scrim = document.getElementById('summary-scrim');
    scrim.classList.remove('show');
    setTimeout(() => (scrim.hidden = true), 220);
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function bindGlobal() {
    document.getElementById('prev-btn').addEventListener('click', () => goDelta(-1));
    document.getElementById('next-btn').addEventListener('click', () => {
      const i = stepIndex(state.step);
      if (i === allSteps.length - 1) { openDrawer(); return; }
      goDelta(1);
    });
    document.getElementById('summary-btn').addEventListener('click', openDrawer);
    document.getElementById('summary-close').addEventListener('click', closeDrawer);
    document.getElementById('summary-scrim').addEventListener('click', closeDrawer);
    document.getElementById('print-btn').addEventListener('click', () => window.print());
    document.getElementById('mood-sheet-close').addEventListener('click', closeMoodOverlay);
    document.getElementById('mood-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeMoodOverlay();
    });
    document.getElementById('sidebar').addEventListener('click', (e) => {
      const stepBtn = e.target.closest('[data-step]');
      if (stepBtn) { go(stepBtn.dataset.step); return; }
      const toggle = e.target.closest('[data-toggle-section]');
      if (toggle) {
        const key = 's:' + toggle.dataset.toggleSection;
        state.expanded = state.expanded.includes(key)
          ? state.expanded.filter((x) => x !== key)
          : [...state.expanded, key];
        save(); renderSidebar(); return;
      }
      const jumpGroup = e.target.closest('[data-jump-group]');
      if (jumpGroup) {
        const [sid, gid] = jumpGroup.dataset.jumpGroup.split(':');
        go(sid);
        requestAnimationFrame(() => {
          const el = document.getElementById('group-' + gid);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }
      const jumpCat = e.target.closest('[data-jump-cat]');
      if (jumpCat) {
        const [sid, cid] = jumpCat.dataset.jumpCat.split(':');
        go(sid);
        requestAnimationFrame(() => {
          const el = document.getElementById('cat-' + cid);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }
    });
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar-aside').classList.toggle('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeDrawer(); closeMoodOverlay(); }
    });
  }

  function deepMerge(base, over) {
    if (Array.isArray(over)) return over;
    if (over && typeof over === 'object') {
      const out = (base && typeof base === 'object' && !Array.isArray(base)) ? Object.assign({}, base) : {};
      Object.keys(over).forEach((k) => { out[k] = deepMerge(out[k], over[k]); });
      return out;
    }
    return over === undefined ? base : over;
  }

  async function loadServerConfig() {
    try {
      const res = await fetch('/homework/api/config', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok && data.config) {
        CFG = deepMerge(window.DESIGN_HOMEWORK_CONFIG || {}, data.config);
      }
    } catch (e) { /* keep defaults + local */ }
  }

  async function boot() {
    await loadServerConfig();
    load();
    bindGlobal();
    render();
    loadRoundContext();
    checkResume();
  }

  boot();

  // Public API (used by the future submit/backend + for testing)
  window.DesignHomework = {
    getState: () => JSON.parse(JSON.stringify(state)),
    go,
    openSummary: openDrawer
  };
})();
