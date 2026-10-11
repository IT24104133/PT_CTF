(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'recruitment.html', title: 'Recruitment' });
  if (!me) return;
  if (!me.caps.recruitment) {
    document.getElementById('ph-content').innerHTML = '<div class="ph-card"><div class="ph-empty">You do not have access to recruitment.</div></div>';
    return;
  }

  document.querySelectorAll('.ph-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ph-tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.ph-tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    });
  });

  PHTable.create({
    root: document.getElementById('ph-jobs-table'), id: 'ph-jobs', endpoint: '/job-openings', pageSizes: [10, 25, 50],
    emptyText: 'No job openings.',
    columns: [
      { key: 'title', label: 'Title' }, { key: 'department', label: 'Department' }, { key: 'location', label: 'Location' },
      { label: 'Status', render: (r) => PHTable.badge(r.status) }, { label: 'Opened', render: (r) => PH.fmtDate(r.opened_at) },
    ],
  }).load();

  const candTable = PHTable.create({
    root: document.getElementById('ph-candidates-table'), id: 'ph-cand', endpoint: '/candidates', pageSizes: [10, 25, 50],
    emptyText: 'No candidates found.',
    columns: [
      { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'source', label: 'Source' },
      { key: 'applicationCount', label: 'Applications' }, { label: 'Added', render: (r) => PH.fmtDate(r.created_at) },
    ],
  });
  candTable.load();
  let t = null;
  document.getElementById('ph-cand-search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => candTable.setSearch(e.target.value), 300); });

  PHTable.create({
    root: document.getElementById('ph-applications-table'), id: 'ph-app', endpoint: '/applications', pageSizes: [10, 25, 50],
    emptyText: 'No applications found.',
    columns: [
      { key: 'candidate', label: 'Candidate' }, { key: 'job', label: 'Job' },
      { label: 'Stage', render: (r) => PHTable.badge(r.stage) }, { label: 'Applied', render: (r) => PH.fmtDate(r.applied_at) },
    ],
  }).load();
})();
