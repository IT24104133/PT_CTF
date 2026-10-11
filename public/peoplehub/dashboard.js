(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'dashboard.html', title: 'Dashboard' });
  if (!me) return;

  document.getElementById('ph-welcome').textContent = 'Welcome back, ' + (me.employee ? me.employee.first_name : me.username) + '.';

  const r = await PH.get('/dashboard');
  if (!r.ok) { PH.toast('Unable to load dashboard data.', 'error'); return; }
  const d = r.data;

  document.getElementById('ph-kpis').innerHTML = [
    ['Total Employees', d.stats.totalEmployees],
    ['Open HR Requests', d.stats.openHrRequests],
    ['Pending Approvals', d.stats.pendingApprovals],
    ['Employees On Leave', d.stats.employeesOnLeave],
  ].map(([label, n]) => '<div class="ph-kpi"><div class="n">' + n.toLocaleString() + '</div><div class="l">' + esc(label) + '</div></div>').join('');

  const maxN = Math.max(1, ...d.headcountByDept.map((r) => r.n));
  document.getElementById('ph-headcount-chart').innerHTML = d.headcountByDept.map((r) => (
    '<div style="display:flex;align-items:center;gap:10px;margin:7px 0;">' +
    '<div style="width:150px;font-size:12.5px;color:var(--ph-muted);">' + esc(r.department) + '</div>' +
    '<div style="flex:1;background:#eef1f5;border-radius:4px;overflow:hidden;height:16px;">' +
    '<div style="width:' + Math.round((r.n / maxN) * 100) + '%;background:var(--ph-secondary);height:100%;"></div></div>' +
    '<div style="width:34px;text-align:right;font-size:12.5px;font-weight:600;">' + r.n + '</div></div>'
  )).join('');

  document.getElementById('ph-activity').innerHTML = d.recentActivity.length
    ? d.recentActivity.map((a) => '<div class="ph-list-row"><span>' + esc(actionLabel(a.action)) + (a.username ? ' — ' + esc(a.username) : '') + '</span><small>' + PH.fmtDate(a.timestamp) + '</small></div>').join('')
    : '<div class="ph-empty">No recent activity.</div>';

  document.getElementById('ph-upcoming-leave').innerHTML = d.upcomingLeave.length
    ? d.upcomingLeave.map((l) => '<div class="ph-list-row"><span>' + esc(l.first_name + ' ' + l.last_name) + '<small>' + esc(l.leave_type) + '</small></span><small>' + PH.fmtDate(l.start_date) + '</small></div>').join('')
    : '<div class="ph-empty">No upcoming leave.</div>';

  document.getElementById('ph-announcements').innerHTML = d.announcements.length
    ? d.announcements.map((a) => '<div class="ph-list-row"><span>' + (a.is_pinned ? '📌 ' : '') + esc(a.title) + '</span><small>' + PH.fmtDate(a.published_at) + '</small></div>').join('')
    : '<div class="ph-empty">No announcements.</div>';

  document.getElementById('ph-recent-docs').innerHTML = d.recentDocs.length
    ? d.recentDocs.map((doc) => '<div class="ph-list-row"><span>' + esc(doc.document_name) + '<small>' + esc(doc.document_type) + '</small></span></div>').join('')
    : '<div class="ph-empty">No documents yet.</div>';

  if (d.pendingRequests && d.pendingRequests.length) {
    document.getElementById('ph-pending-card').hidden = false;
    document.getElementById('ph-pending').innerHTML = d.pendingRequests.map((p) => (
      '<div class="ph-list-row"><span>' + esc(p.subject) + '<small>' + esc(p.category) + '</small></span>' + PHTable_badge(p.status) + '</div>'
    )).join('');
  }

  function actionLabel(a) {
    return a.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
  function PHTable_badge(status) {
    const map = { Open: 'blue', 'In Progress': 'amber' };
    return '<span class="ph-badge-pill ' + (map[status] || 'gray') + '">' + esc(status) + '</span>';
  }
})();
