(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'administration.html', title: 'Administration' });
  if (!me) return;
  if (!me.caps.admin) {
    document.getElementById('ph-content').innerHTML = '<div class="ph-card"><div class="ph-empty">You do not have access to Administration.</div></div>';
    return;
  }

  document.querySelectorAll('.ph-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ph-tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.ph-tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    });
  });

  PHTable.create({
    root: document.getElementById('ph-admin-users'), id: 'ph-au', endpoint: '/admin/users', pageSizes: [25, 50, 100],
    emptyText: 'No users found.',
    columns: [
      { key: 'user_id', label: 'ID' }, { key: 'username', label: 'Username' }, { key: 'role', label: 'Role' },
      { label: 'Employee', render: (r) => r.first_name ? esc(r.first_name + ' ' + r.last_name) : '—' },
      { label: 'Active', render: (r) => r.is_active ? '<span class="ph-badge-pill green">Yes</span>' : '<span class="ph-badge-pill gray">No</span>' },
      { label: 'Last Login', render: (r) => PH.fmtDate(r.last_login_at) },
    ],
  }).load();

  const rr = await PH.get('/admin/roles');
  document.getElementById('ph-admin-roles').innerHTML = rr.ok ? rr.data.results.map((r) => (
    '<div class="ph-card"><div class="ph-card-head"><h3 style="margin:0;">' + esc(r.name) + '</h3><span class="ph-badge-pill blue">' + r.userCount + ' users</span></div>' +
    '<p style="color:var(--ph-muted);margin:0;">' + esc(r.description) + '</p></div>'
  )).join('') : '<div class="ph-empty">Unable to load roles.</div>';

  const dr = await PH.get('/admin/departments');
  document.getElementById('ph-admin-departments').innerHTML = dr.ok
    ? '<div class="ph-table-wrap"><table class="ph-table"><thead><tr><th>Department</th><th>Headcount</th></tr></thead><tbody>' +
      dr.data.results.map((d) => '<tr><td>' + esc(d.name) + '</td><td>' + d.headcount + '</td></tr>').join('') + '</tbody></table></div>'
    : '<div class="ph-empty">Unable to load departments.</div>';

  PHTable.create({
    root: document.getElementById('ph-admin-import'), id: 'ph-imp', endpoint: '/admin/import-jobs', pageSizes: [10, 25],
    emptyText: 'No import jobs.',
    columns: [
      { key: 'filename', label: 'File' }, { label: 'Status', render: (r) => PHTable.badge(r.status.split(' ')[0]) },
      { key: 'records_processed', label: 'Processed' }, { key: 'records_success', label: 'Success' },
      { key: 'records_rejected', label: 'Rejected' }, { label: 'Date', render: (r) => PH.fmtDate(r.created_at) },
    ],
  }).load();

  if (me.caps.audit) {
    PHTable.create({
      root: document.getElementById('ph-admin-audit'), id: 'ph-audit', endpoint: '/audit-logs', pageSizes: [25, 50, 100],
      emptyText: 'No audit records.',
      columns: [
        { label: 'Time', render: (r) => PH.fmtDate(r.timestamp) }, { label: 'User', render: (r) => esc(r.username || 'system') },
        { key: 'action', label: 'Action' }, { key: 'resource_type', label: 'Resource' }, { key: 'ip_address', label: 'IP' },
        { label: 'Result', render: (r) => PHTable.badge(r.result === 'SUCCESS' ? 'Approved' : 'Rejected') },
      ],
    }).load();
  } else { document.getElementById('ph-admin-audit').innerHTML = '<div class="ph-empty">You do not have access to the audit log.</div>'; }

  if (me.caps.security) {
    PHTable.create({
      root: document.getElementById('ph-admin-security'), id: 'ph-sec', endpoint: '/security-events', pageSizes: [25, 50, 100],
      emptyText: 'No security events.',
      columns: [
        { label: 'Time', render: (r) => PH.fmtDate(r.timestamp) },
        { label: 'Employee', render: (r) => r.first_name ? esc(r.first_name + ' ' + r.last_name) : '—' },
        { key: 'event_type', label: 'Event' }, { key: 'detail', label: 'Detail' }, { key: 'ip_address', label: 'IP' },
        { label: 'Severity', render: (r) => PHTable.badge(r.severity === 'High' ? 'Urgent' : r.severity) },
      ],
    }).load();
  } else { document.getElementById('ph-admin-security').innerHTML = '<div class="ph-empty">You do not have access to security events.</div>'; }
})();
