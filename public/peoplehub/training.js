(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'training.html', title: 'Training' });
  if (!me) return;

  const cr = await PH.get('/training-courses');
  if (cr.ok) {
    document.getElementById('ph-courses').innerHTML = cr.data.results.slice(0, 9).map((c) => (
      '<div class="ph-card" style="margin-bottom:0;"><b>' + esc(c.name) + '</b>' + (c.is_mandatory ? ' <span class="ph-badge-pill amber">Mandatory</span>' : '') +
      '<p style="color:var(--ph-muted);font-size:12.5px;margin:6px 0 0;">' + esc(c.description) + '</p></div>'
    )).join('');
  }

  const table = PHTable.create({
    root: document.getElementById('ph-enroll-table'), id: 'ph-enroll', endpoint: '/training-enrollments', pageSizes: [10, 25, 50],
    emptyText: 'No training enrollments found.',
    columns: [
      { label: 'Employee', render: (r) => esc(r.first_name + ' ' + r.last_name) }, { key: 'course', label: 'Course' },
      { label: 'Status', render: (r) => PHTable.badge(r.status) }, { label: 'Enrolled', render: (r) => PH.fmtDate(r.enrolled_at) },
      { label: 'Completed', render: (r) => r.completed_at ? PH.fmtDate(r.completed_at) : '—' },
    ],
  });
  table.load();
  document.getElementById('ph-f-status').addEventListener('change', (e) => table.setFilter('status', e.target.value));
})();
