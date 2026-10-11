(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'hr-requests.html', title: 'HR Requests' });
  if (!me) return;

  const table = PHTable.create({
    root: document.getElementById('ph-req-table'),
    id: 'ph-req',
    endpoint: '/hr-requests',
    pageSizes: [10, 25, 50],
    emptyText: 'No requests match your filters.',
    columns: [
      { key: 'request_id', label: 'ID' },
      { label: 'Employee', render: (r) => esc(r.first_name + ' ' + r.last_name) },
      { key: 'category', label: 'Category' },
      { key: 'subject', label: 'Subject' },
      { label: 'Priority', render: (r) => PHTable.badge(r.priority) },
      { label: 'Status', render: (r) => PHTable.badge(r.status) },
      { label: 'Created', render: (r) => PH.fmtDate(r.created_at) },
    ],
  });
  table.load();

  let t = null;
  document.getElementById('ph-req-search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => table.setSearch(e.target.value), 300); });
  document.getElementById('ph-f-category').addEventListener('change', (e) => table.setFilter('category', e.target.value));
  document.getElementById('ph-f-status').addEventListener('change', (e) => table.setFilter('status', e.target.value));

  const modal = document.getElementById('ph-req-modal');
  document.getElementById('ph-new-req').addEventListener('click', () => { modal.hidden = false; });
  document.getElementById('ph-req-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  document.getElementById('ph-req-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await PH.post('/hr-requests', {
      category: document.getElementById('ph-req-category').value,
      subject: document.getElementById('ph-req-subject').value,
      description: document.getElementById('ph-req-desc').value,
    });
    if (r.ok) { PH.toast('Your request has been submitted.', 'success'); modal.hidden = true; table.load(); }
    else PH.toast((r.data && r.data.error) || 'Unable to submit your request.', 'error');
  });

  if (new URLSearchParams(location.search).get('new') === '1') modal.hidden = false;
})();
