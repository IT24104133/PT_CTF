(async function () {
  'use strict';
  const me = await PeopleHubShell.init({ active: 'leave.html', title: 'Leave & Attendance' });
  if (!me) return;

  const table = PHTable.create({
    root: document.getElementById('ph-leave-table'),
    id: 'ph-leave',
    endpoint: '/leave',
    pageSizes: [10, 25, 50],
    emptyText: 'No leave records found.',
    columns: [
      { label: 'Employee', render: (r) => PH.esc(r.first_name + ' ' + r.last_name) },
      { key: 'leave_type', label: 'Type' },
      { label: 'Start', render: (r) => PH.fmtDate(r.start_date) },
      { label: 'End', render: (r) => PH.fmtDate(r.end_date) },
      { key: 'days', label: 'Days' },
      { label: 'Status', render: (r) => PHTable.badge(r.status) },
      { label: 'Reason', render: (r) => PH.esc(r.reason || '—') },
    ],
  });
  table.load();
  document.getElementById('ph-f-status').addEventListener('change', (e) => table.setFilter('status', e.target.value));

  const modal = document.getElementById('ph-leave-modal');
  document.getElementById('ph-new-leave').addEventListener('click', () => { modal.hidden = false; });
  document.getElementById('ph-leave-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  document.getElementById('ph-leave-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await PH.post('/leave', {
      leaveType: document.getElementById('ph-leave-type').value,
      startDate: document.getElementById('ph-leave-start').value,
      endDate: document.getElementById('ph-leave-end').value,
      reason: document.getElementById('ph-leave-reason').value,
    });
    if (r.ok) { PH.toast('Leave request submitted.', 'success'); modal.hidden = true; table.load(); }
    else PH.toast((r.data && r.data.error) || 'Unable to submit your request.', 'error');
  });

  if (new URLSearchParams(location.search).get('new') === '1') modal.hidden = false;
})();
