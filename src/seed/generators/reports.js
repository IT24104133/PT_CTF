// The 15+ standard reports and their pre-computed result rows (People Analytics -> Reports pulls
// these; the live, filterable version -- and its intentionally vulnerable filter path -- is
// wired up in Phase 5).
'use strict';

const REPORT_DEFS = [
  ['Headcount by Department', 'Current active headcount broken down by department.', 'Headcount'],
  ['Employee Turnover', 'Voluntary and involuntary turnover rate by quarter.', 'Turnover'],
  ['New Hires', 'New hires by month for the current year.', 'Hiring'],
  ['Leave Utilization', 'Leave days taken by type across the organization.', 'Leave'],
  ['Salary Bands', 'Distribution of employees across salary bands.', 'Compensation'],
  ['Department Distribution', 'Headcount share by department.', 'Headcount'],
  ['Employee Tenure', 'Average tenure in years by department.', 'Headcount'],
  ['Location Distribution', 'Headcount by office location.', 'Headcount'],
  ['Hiring Pipeline', 'Open roles by stage across active job openings.', 'Hiring'],
  ['Performance Distribution', 'Share of employees by performance rating.', 'Performance'],
  ['Employment Type Mix', 'Headcount by employment type.', 'Headcount'],
  ['Grade Distribution', 'Headcount by job grade.', 'Compensation'],
  ['Training Completion', 'Completion rate by training course.', 'Training'],
  ['Open HR Requests by Category', 'Volume of open HR requests by category.', 'Operations'],
  ['IT Ticket Volume', 'IT ticket volume by category.', 'Operations'],
  ['Work Mode Distribution', 'Headcount by onsite/hybrid/remote.', 'Headcount'],
];

function run(db, rng, ctx, config) {
  const insReport = db.prepare('INSERT INTO reports (report_id, name, description, category) VALUES (?,?,?,?)');
  const insResult = db.prepare('INSERT INTO report_results (result_id, report_id, dimension, metric_name, metric_value) VALUES (?,?,?,?,?)');

  db.exec('BEGIN');
  let resultId = 1;
  REPORT_DEFS.slice(0, config.REPORT_COUNT).forEach(([name, desc, category], idx) => {
    const reportId = idx + 1;
    insReport.run(reportId, name, desc, category);
    // Real, derived numbers -- not placeholders -- computed from the actual seeded employee table.
    if (name === 'Headcount by Department' || name === 'Department Distribution') {
      const rows = db.prepare(`SELECT d.name as dept, COUNT(*) as n FROM employees e JOIN departments d ON d.department_id=e.department_id WHERE e.employment_status='Active' GROUP BY d.name`).all();
      for (const r of rows) insResult.run(resultId++, reportId, r.dept, 'Headcount', r.n);
    } else if (name === 'Location Distribution') {
      const rows = db.prepare(`SELECT location, COUNT(*) as n FROM employees GROUP BY location`).all();
      for (const r of rows) insResult.run(resultId++, reportId, r.location, 'Headcount', r.n);
    } else if (name === 'Grade Distribution') {
      const rows = db.prepare(`SELECT job_grade, COUNT(*) as n FROM employees GROUP BY job_grade`).all();
      for (const r of rows) insResult.run(resultId++, reportId, r.job_grade, 'Headcount', r.n);
    } else if (name === 'Employment Type Mix') {
      const rows = db.prepare(`SELECT employment_type, COUNT(*) as n FROM employees GROUP BY employment_type`).all();
      for (const r of rows) insResult.run(resultId++, reportId, r.employment_type, 'Headcount', r.n);
    } else {
      // Synthetic-but-plausible rows for reports without a direct 1:1 seeded aggregate.
      for (let i = 0; i < rng.int(4, 8); i++) insResult.run(resultId++, reportId, 'Segment ' + (i + 1), 'Value', rng.int(5, 400));
    }
  });
  db.exec('COMMIT');
}

module.exports = { run };
