(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'people-analytics.html', title: 'People Analytics' });
  if (!me) return;
  const r = await PH.get('/dashboard');
  if (!r.ok) return;
  document.getElementById('ph-kpis').innerHTML = [
    ['Total Employees', r.data.stats.totalEmployees], ['Open HR Requests', r.data.stats.openHrRequests],
    ['Pending Approvals', r.data.stats.pendingApprovals], ['Employees On Leave', r.data.stats.employeesOnLeave],
  ].map(([l, n]) => '<div class="ph-kpi"><div class="n">' + n.toLocaleString() + '</div><div class="l">' + esc(l) + '</div></div>').join('');
  const max = Math.max(1, ...r.data.headcountByDept.map((x) => x.n));
  document.getElementById('ph-chart').innerHTML = r.data.headcountByDept.map((x) => (
    '<div style="display:flex;align-items:center;gap:10px;margin:7px 0;"><div style="width:160px;font-size:12.5px;">' + esc(x.department) + '</div>' +
    '<div style="flex:1;background:#eef1f5;border-radius:4px;height:16px;overflow:hidden;"><div style="width:' + Math.round((x.n / max) * 100) + '%;background:var(--ph-secondary);height:100%;"></div></div>' +
    '<div style="width:34px;text-align:right;font-weight:600;font-size:12.5px;">' + x.n + '</div></div>'
  )).join('');
})();
