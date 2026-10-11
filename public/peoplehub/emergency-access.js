(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'emergency-access.html', title: 'Emergency Access' });
  if (!me) return;

  const table = PHTable.create({
    root: document.getElementById('ph-ea-table'), id: 'ph-ea', endpoint: '/emergency-access', pageSizes: [10, 25],
    emptyText: 'No emergency access requests.',
    columns: [
      { label: 'Requested By', render: (r) => esc(r.first_name + ' ' + r.last_name) },
      { key: 'access_type', label: 'Access Type' }, { key: 'reason', label: 'Reason' },
      { label: 'Duration', render: (r) => r.duration_hours + 'h' },
      { label: 'Status', render: (r) => statusBadge(r.status) },
      { label: 'Updated', render: (r) => PH.fmtDate(r.updated_at) },
    ],
  });
  table.load();

  function statusBadge(status) {
    const map = { Draft: 'gray', Submitted: 'blue', 'Manager Approved': 'blue', 'Security Review': 'amber', 'HR Approved': 'green', Expired: 'gray', Rejected: 'red' };
    return '<span class="ph-badge-pill ' + (map[status] || 'gray') + '">' + esc(status) + '</span>';
  }

  document.getElementById('ph-ea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('ph-ea-msg');
    const r = await PH.post('/emergency-access', {
      accessType: document.getElementById('ph-ea-type').value,
      duration: document.getElementById('ph-ea-duration').value,
      reason: document.getElementById('ph-ea-reason').value,
      code: document.getElementById('ph-ea-code').value,
    });
    if (r.ok) {
      msg.innerHTML = '<div class="ph-login-msg" style="background:#e8f5ee;color:var(--ph-success);border:1px solid #8fd6ab;">' + esc(r.data.message) + '</div>';
      document.getElementById('ph-ea-form').reset();
      table.load();
    } else {
      msg.innerHTML = '<div class="ph-login-msg error">' + esc((r.data && r.data.error) || 'Unable to submit request.') + '</div>';
    }
  });
})();
