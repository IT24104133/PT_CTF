(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'policies.html', title: 'Company Policies' });
  if (!me) return;
  const r = await PH.get('/policies');
  const el = document.getElementById('ph-policies');
  if (!r.ok || !r.data.results.length) { el.innerHTML = '<div class="ph-card"><div class="ph-empty">No policies available.</div></div>'; return; }
  el.innerHTML = r.data.results.map((p) => (
    '<div class="ph-card"><h3 style="margin:0 0 6px;">' + esc(p.document_name) + '</h3>' +
    '<p style="margin:0;color:var(--ph-muted);">' + esc(p.body_excerpt) + '</p></div>'
  )).join('');
})();
