/* Client Design Homework — private read-only view (?token=…) */
(function () {
  'use strict';
  const el = document.getElementById('view-content');
  const token = (new URLSearchParams(location.search)).get('token') || '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(sub) {
    const c = sub.client || {};
    let html =
      '<div class="section-head">' +
      '<p class="kicker">Client Design Homework</p>' +
      '<h1 class="section-title">' + esc(c.project || 'Your selections') + '</h1>' +
      '<p class="section-intro">' + esc(c.name || '') + (c.email ? ' · ' + esc(c.email) : '') +
      (sub.submittedAt ? '<br>Submitted ' + esc(new Date(sub.submittedAt).toLocaleDateString()) : '') + '</p>' +
      '</div>';

    (sub.sections || []).forEach((s) => {
      if (s.skipped) {
        html += '<div class="sum-section"><h3><span class="sum-num">' + esc(s.number) + '</span> ' + esc(s.title) +
          '</h3><div class="sum-skipped">Skipped — not applicable</div></div>';
        return;
      }
      const items = (s.items || []).filter((it) => (it.options && it.options.length) || it.note);
      if (!items.length) return;
      html += '<div class="sum-section"><h3><span class="sum-num">' + esc(s.number) + '</span> ' + esc(s.title) + '</h3>';
      items.forEach((it) => {
        const chosen = it.options && it.options.length ? it.options.join(', ') : '';
        html += '<div class="sum-item"><span><strong>' + esc(it.category) + ':</strong> ' + esc(chosen || '—') + '</span></div>';
        if (it.note) html += '<div class="sum-note">' + esc(it.note) + '</div>';
      });
      html += '</div>';
    });

    const budget = (sub.budget || []).filter((b) => b.tier || b.note);
    if (budget.length) {
      html += '<div class="sum-section"><h3><span class="sum-num">★</span> Budget Definition</h3>';
      budget.forEach((b) => {
        html += '<div class="sum-item"><span>' + esc(b.label) + ': <strong>' + esc(b.tier || '—') + '</strong>' +
          (b.note ? ' — ' + esc(b.note) : '') + '</span></div>';
      });
      html += '</div>';
    }
    return html;
  }

  document.getElementById('view-print').addEventListener('click', () => window.print());

  if (!token) {
    el.innerHTML = '<p style="color:#a4442f">This link is missing its access token.</p>';
    return;
  }
  fetch('/homework/api/get?token=' + encodeURIComponent(token))
    .then((r) => r.json())
    .then((d) => {
      if (!d.ok) throw new Error(d.error || 'Not found');
      el.innerHTML = render(d.submission);
    })
    .catch((e) => {
      el.innerHTML = '<p style="color:#a4442f">Could not load this homework. ' + esc(e.message || '') + '</p>';
    });
})();
