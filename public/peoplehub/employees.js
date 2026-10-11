(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'employees.html', title: 'Employee Directory' });
  if (!me) return;
  if (!me.caps.directory) {
    document.getElementById('ph-content').innerHTML = '<div class="ph-card"><div class="ph-empty">You do not have access to the employee directory.</div></div>';
    return;
  }

  const meta = await PH.get('/meta');
  function fillSelect(id, options, labelFn) {
    const el = document.getElementById(id);
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = typeof o === 'string' ? o : o.employee_id;
      opt.textContent = labelFn ? labelFn(o) : o;
      el.appendChild(opt);
    }
  }
  if (meta.ok) {
    fillSelect('ph-f-department', meta.data.departments);
    fillSelect('ph-f-status', meta.data.statuses);
    fillSelect('ph-f-type', meta.data.employmentTypes);
    fillSelect('ph-f-location', meta.data.locations);
    fillSelect('ph-f-grade', meta.data.grades);
    fillSelect('ph-f-manager', meta.data.managers, (m) => m.first_name + ' ' + m.last_name);
  }

  const table = PHTable.create({
    root: document.getElementById('ph-dir-table'),
    id: 'ph-dir',
    endpoint: '/employees',
    pageSizes: [25, 50, 100],
    defaultSort: 'name',
    emptyText: 'No employees match your filters.',
    rowHref: (row) => 'employee-profile.html?id=' + encodeURIComponent(row.employee_id),
    columns: [
      { key: 'employee_id', label: 'Employee ID', sortKey: 'name' },
      { label: 'Name', render: (r) => '<b>' + esc((r.preferred_name || r.first_name) + ' ' + r.last_name) + '</b>' },
      { key: 'job_title', label: 'Job Title' },
      { key: 'department', label: 'Department', sortKey: 'department' },
      { label: 'Manager', render: (r) => r.managerFirst ? esc(r.managerFirst + ' ' + r.managerLast) : '—' },
      { key: 'location', label: 'Location' },
      { key: 'employment_type', label: 'Employment Type' },
      { label: 'Status', render: (r) => PHTable.badge(r.employment_status) },
      { label: 'Join Date', render: (r) => PH.fmtDate(r.join_date), sortKey: 'joinDate' },
      { key: 'job_grade', label: 'Grade', sortKey: 'grade' },
    ],
  });
  table.load();

  let t = null;
  document.getElementById('ph-dir-search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => table.setSearch(e.target.value), 300);
  });
  ['department', 'status', 'type', 'location', 'grade', 'manager'].forEach((key) => {
    document.getElementById('ph-f-' + key).addEventListener('change', (e) => table.setFilter(key, e.target.value));
  });
  document.getElementById('ph-export').addEventListener('click', () => PH.toast('Export queued. You will receive a notification when it is ready.'));
})();
