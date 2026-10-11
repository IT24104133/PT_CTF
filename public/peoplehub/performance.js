(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'performance.html', title: 'Performance' });
  if (!me) return;
  const card = document.getElementById('ph-perf-card');

  if (!me.employee) { card.innerHTML = '<div class="ph-empty">No employee record linked to this account.</div>'; return; }
  const r = await PH.get('/employees/' + encodeURIComponent(me.employee.employee_id));
  if (!r.ok) { card.innerHTML = '<div class="ph-empty">Unable to load your performance history.</div>'; return; }
  const reviews = r.data.reviews || [];
  card.innerHTML = '<h3>My Reviews</h3>' + (reviews.length
    ? reviews.map((p) => '<div class="ph-list-row" style="flex-direction:column;align-items:flex-start;"><b>' + esc(p.review_period) + ' — ' + esc(p.rating) + '</b><small>' + esc(p.summary) + '</small>' + (p.goals ? '<small style="margin-top:4px;">Goals: ' + esc(p.goals) + '</small>' : '') + '</div>').join('')
    : '<div class="ph-empty">No performance reviews on file yet.</div>');

  if (me.caps.reports) document.getElementById('ph-perf-reports-card').hidden = false;
})();
