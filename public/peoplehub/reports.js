(async function () {
  'use strict';
  const esc = PH.esc;
  const me = await PeopleHubShell.init({ active: 'reports.html', title: 'Reports' });
  if (!me) return;
  if (!me.caps.reports) {
    document.getElementById('ph-content').innerHTML = '<div class="ph-card"><div class="ph-empty">You do not have access to reports.</div></div>';
    return;
  }

  const reportId = new URLSearchParams(location.search).get('id');
  if (reportId) { showReport(reportId); return; }

  const r = await PH.get('/reports');
  const listEl = document.getElementById('ph-report-list');
  if (!r.ok) { listEl.innerHTML = '<div class="ph-empty">Unable to load reports.</div>'; return; }
  listEl.innerHTML = r.data.results.map((rep) => (
    '<a class="ph-card" style="display:block;color:inherit;" href="reports.html?id=' + rep.report_id + '">' +
    '<span class="ph-badge-pill blue" style="margin-bottom:8px;display:inline-block;">' + esc(rep.category) + '</span>' +
    '<h3 style="margin:4px 0 6px;">' + esc(rep.name) + '</h3>' +
    '<p style="color:var(--ph-muted);font-size:12.5px;margin:0;">' + esc(rep.description) + '</p></a>'
  )).join('');

  async function showReport(id) {
    document.getElementById('ph-report-list').hidden = true;
    document.getElementById('ph-report-detail').hidden = false;
    async function run(segment) {
      const resultsEl = document.getElementById('ph-report-results');
      resultsEl.innerHTML = '<div class="ph-skeleton" style="height:120px;"></div>';
      const params = segment ? '?segment=' + encodeURIComponent(segment) : '';
      const rr = await PH.get('/reports/' + id + '/run' + params);
      if (!rr.ok) { resultsEl.innerHTML = '<div class="ph-empty">' + esc((rr.data && rr.data.error) || 'Report generation failed.') + '</div>'; return; }
      document.getElementById('ph-report-title').textContent = rr.data.report.name;
      document.getElementById('ph-report-desc').textContent = rr.data.report.description;
      const rows = rr.data.results;
      if (!rows.length) { resultsEl.innerHTML = '<div class="ph-empty">No data for this filter.</div>'; return; }
      const max = Math.max(1, ...rows.map((row) => Number(row.metric_value) || 0));
      resultsEl.innerHTML = rows.map((row) => (
        '<div style="display:flex;align-items:center;gap:10px;margin:8px 0;">' +
        '<div style="width:160px;font-size:12.5px;">' + esc(row.dimension) + '</div>' +
        '<div style="flex:1;background:#eef1f5;border-radius:4px;overflow:hidden;height:16px;">' +
        '<div style="width:' + Math.max(2, Math.round((Number(row.metric_value) / max) * 100)) + '%;background:var(--ph-secondary);height:100%;"></div></div>' +
        '<div style="width:60px;text-align:right;font-size:12.5px;font-weight:600;">' + esc(row.metric_value) + '</div></div>'
      )).join('');
    }
    document.getElementById('ph-report-run').addEventListener('click', () => run(document.getElementById('ph-report-segment').value));
    document.getElementById('ph-report-segment').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(e.target.value); });
    run('');
  }
})();
