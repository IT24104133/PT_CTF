// People Analytics -> Reports. Listing and running a report are both normal; the "narrow to one
// segment" filter on a report's result view is the intentionally vulnerable one (section 32) --
// a normal-looking dropdown/text filter concatenated straight into the results query.
'use strict';
const { getDb } = require('../db');
const { requirePhAuth, fail } = require('../helpers');
const { can } = require('../rbac');
const CS = require('../challengeState');

function handleList(req, res, { send }) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'reports')) return fail(send, res, 403, 'You do not have access to reports.');
  const db = getDb();
  const rows = db.prepare('SELECT report_id, name, description, category FROM reports ORDER BY name').all();
  return send(res, 200, { ok: true, results: rows });
}

function handleRun(req, res, { send }, reportIdRaw, searchParams, outerSession) {
  const s = requirePhAuth(req);
  if (!s) return fail(send, res, 401, 'Not signed in.');
  if (!can(s.roleName, 'reports')) return fail(send, res, 403, 'You do not have access to reports.');
  const db = getDb();
  const reportId = parseInt(reportIdRaw, 10);
  const report = db.prepare('SELECT * FROM reports WHERE report_id = ?').get(reportId);
  if (!report) return fail(send, res, 404, 'Report not found.');

  // `segment` narrows the result set to one dimension value (e.g. one department). It's a plain
  // text filter field next to the report, built the unsafe way.
  const segment = (searchParams.get('segment') || '').slice(0, 200);
  let sql = `SELECT dimension, metric_name, metric_value FROM report_results WHERE report_id = ${reportId}`;
  if (segment) sql += ` AND dimension = '${segment}'`;

  let rows, queryError = null;
  try { rows = db.prepare(sql).all(); } catch (e) { queryError = e; }
  if (queryError) return fail(send, res, 500, 'Report generation failed.');

  // A UNION-injected row keeps this query's own column *names* (dimension/metric_name/
  // metric_value) no matter what the attacker's SELECT actually returns -- SQLite takes column
  // names from the first SELECT in a UNION. So the discovery check can't look for odd-shaped
  // keys; it has to look at whether the *content* could really have come from report_results:
  // every legitimate row's metric_value is a real number, and its dimension is one this report
  // actually has.
  const knownDimensions = new Set(db.prepare('SELECT DISTINCT dimension FROM report_results WHERE report_id = ?').all(reportId).map((r) => r.dimension));
  const looksLikeDiscovery = rows.some((r) => typeof r.metric_value !== 'number' || !knownDimensions.has(r.dimension));
  if (looksLikeDiscovery) CS.setFlag(db, outerSession.token, 'stage3_report');

  return send(res, 200, { ok: true, report: { report_id: report.report_id, name: report.name, description: report.description }, results: rows });
}

module.exports = { handleList, handleRun };
