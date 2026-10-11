(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'it-requests.html', title: 'IT Requests' });
  if (!me) return;

  const table = PHTable.create({
    root: document.getElementById('ph-it-table'),
    id: 'ph-it',
    endpoint: '/it-tickets',
    pageSizes: [10, 25, 50],
    emptyText: 'No tickets match your filters.',
    columns: [
      { key: 'ticket_id', label: 'ID' },
      { label: 'Employee', render: (r) => esc(r.first_name + ' ' + r.last_name) },
      { key: 'category', label: 'Category' },
      { key: 'subject', label: 'Subject' },
      { label: 'Priority', render: (r) => PHTable.badge(r.priority) },
      { label: 'Status', render: (r) => PHTable.badge(r.status) },
      { label: 'Created', render: (r) => PH.fmtDate(r.created_at) },
    ],
  });
  table.load();
  document.getElementById('ph-f-category').addEventListener('change', (e) => table.setFilter('category', e.target.value));
  document.getElementById('ph-f-status').addEventListener('change', (e) => table.setFilter('status', e.target.value));

  const modal = document.getElementById('ph-it-modal');
  document.getElementById('ph-new-ticket').addEventListener('click', () => { modal.hidden = false; });
  document.getElementById('ph-it-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  document.getElementById('ph-it-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await PH.post('/it-tickets', {
      category: document.getElementById('ph-it-category').value,
      subject: document.getElementById('ph-it-subject').value,
      description: document.getElementById('ph-it-desc').value,
    });
    if (r.ok) { PH.toast('Your IT ticket has been submitted.', 'success'); modal.hidden = true; table.load(); }
    else PH.toast((r.data && r.data.error) || 'Unable to submit your ticket.', 'error');
  });
})();
