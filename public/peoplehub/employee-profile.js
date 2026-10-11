(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'employees.html', title: 'Employee Profile' });
  if (!me) return;

  const id = new URLSearchParams(location.search).get('id') || (me.employee && me.employee.employee_id);
  if (!id) { document.getElementById('ph-content').innerHTML = '<div class="ph-card"><div class="ph-empty">No employee specified.</div></div>'; return; }

  const r = await PH.get('/employees/' + encodeURIComponent(id));
  if (!r.ok) {
    document.getElementById('ph-profile-head').innerHTML = '<div class="ph-empty">' + esc(r.data && r.data.error || 'Unable to load this profile.') + '</div>';
    document.getElementById('ph-profile-tabs').hidden = true;
    return;
  }
  const d = r.data;
  const e = d.employee;
  document.getElementById('ph-crumb-name').textContent = e.first_name + ' ' + e.last_name;

  document.getElementById('ph-profile-head').innerHTML =
    '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">' +
    '<span class="ph-avatar" style="width:56px;height:56px;font-size:19px;">' + esc(PH.initials(e.first_name, e.last_name)) + '</span>' +
    '<div style="flex:1;min-width:200px;">' +
      '<h2 style="margin:0 0 2px;">' + esc((e.preferred_name || e.first_name) + ' ' + e.last_name) + '</h2>' +
      '<div style="color:var(--ph-muted);">' + esc(e.job_title) + ' &middot; ' + esc(e.department) + '</div>' +
    '</div>' +
    PHBadge(e.employment_status) +
    '</div>';

  function PHBadge(status) {
    const map = { Active: 'green', 'On Leave': 'amber', Probation: 'amber', 'Notice Period': 'amber', Contract: 'blue', Suspended: 'red', Inactive: 'gray' };
    return '<span class="ph-badge-pill ' + (map[status] || 'gray') + '">' + esc(status) + '</span>';
  }
  function row(label, value) { return '<div class="ph-list-row"><span>' + esc(label) + '</span><span>' + (value || '—') + '</span></div>'; }

  document.getElementById('tab-overview').innerHTML = '<div class="ph-card">' +
    row('Employee ID', esc(e.employee_id)) + row('Full Name', esc(e.first_name + ' ' + e.last_name)) +
    row('Job Title', esc(e.job_title)) + row('Department', esc(e.department)) +
    row('Manager', d.manager ? esc(d.manager.first_name + ' ' + d.manager.last_name) : '—') +
    row('Location', esc(e.location)) + row('Status', PHBadge(e.employment_status)) +
    row('Join Date', PH.fmtDate(e.join_date)) + row('Employment Type', esc(e.employment_type)) + row('Grade', esc(e.job_grade)) +
    '</div>';

  document.getElementById('tab-contact').innerHTML = '<div class="ph-card">' +
    row('Work Email', esc(e.email)) + row('Phone Extension', esc(e.phone_extension)) +
    row('Office', esc(e.office)) + row('Location', esc(e.location)) + row('Work Mode', esc(e.work_mode)) +
    '</div>';

  document.getElementById('tab-employment').innerHTML = '<div class="ph-card">' +
    row('Employment Type', esc(e.employment_type)) + row('Join Date', PH.fmtDate(e.join_date)) +
    row('Grade', esc(e.job_grade)) + row('Manager', d.manager ? esc(d.manager.first_name + ' ' + d.manager.last_name) : '—') +
    row('Work Mode', esc(e.work_mode)) +
    '</div>';

  document.getElementById('tab-organization').innerHTML = '<div class="ph-card">' +
    '<h3>Manager</h3>' + (d.manager ? '<a href="employee-profile.html?id=' + esc(d.manager.employee_id) + '">' + esc(d.manager.first_name + ' ' + d.manager.last_name) + '</a>' : '<div class="ph-empty">No manager on file.</div>') +
    '<h3 style="margin-top:16px;">Direct Reports (' + d.directReports.length + ')</h3>' +
    (d.directReports.length ? d.directReports.map((r2) => '<div class="ph-list-row"><a href="employee-profile.html?id=' + esc(r2.employee_id) + '">' + esc(r2.first_name + ' ' + r2.last_name) + '</a><small>' + esc(r2.job_title) + '</small></div>').join('') : '<div class="ph-empty">No direct reports.</div>') +
    '</div>';

  document.getElementById('tab-leave').innerHTML = '<div class="ph-card"><h3>Leave History</h3>' +
    (d.leave.length ? d.leave.map((l) => '<div class="ph-list-row"><span>' + esc(l.leave_type) + '<small>' + PH.fmtDate(l.start_date) + ' – ' + PH.fmtDate(l.end_date) + ' (' + l.days + 'd)</small></span>' + PHBadge(l.status) + '</div>').join('') : '<div class="ph-empty">No leave records.</div>') +
    '</div>';

  document.getElementById('tab-performance').innerHTML = '<div class="ph-card"><h3>Performance Reviews</h3>' +
    (d.reviews.length ? d.reviews.map((p) => '<div class="ph-list-row" style="flex-direction:column;align-items:flex-start;"><b>' + esc(p.review_period) + ' — ' + esc(p.rating) + '</b><small>' + esc(p.summary) + '</small></div>').join('') : '<div class="ph-empty">No performance reviews visible to you.</div>') +
    '</div>';

  document.getElementById('tab-documents').innerHTML = '<div class="ph-card"><h3>Documents</h3>' +
    (d.documents.length ? d.documents.map((doc) => '<div class="ph-list-row"><span>' + esc(doc.document_name) + '<small>' + esc(doc.document_type) + ' &middot; ' + esc(doc.classification) + '</small></span><a href="documents.html?id=' + doc.document_id + '">View</a></div>').join('') : '<div class="ph-empty">No documents on file.</div>') +
    '</div>';

  document.getElementById('tab-access').innerHTML = '<div class="ph-card">' +
    row('Application Access', 'PeopleHub') + row('Last Login', 'Not available') +
    row('Security Status', d.access.canViewPayroll ? '<span class="ph-badge-pill blue">Elevated</span>' : '<span class="ph-badge-pill gray">Standard</span>') +
    '</div>';

  document.querySelectorAll('.ph-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ph-tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.ph-tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    });
  });
})();
