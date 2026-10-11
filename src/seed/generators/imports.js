// Import job history (the "Import History" panel on Administration -> Employee Data Import) and
// a handful of realistic-looking emergency access requests. The actual import upload/validation
// endpoint and its vulnerable XML parsing path are wired up in Phase 5 -- this just seeds the
// history log so the page doesn't look brand new on first load.
'use strict';

function daysAgoIso(rng, min, max) { return new Date(Date.now() - rng.int(min, max) * 86400000).toISOString(); }

const IMPORT_FILES = [
  'employee_batch_2024Q4.xml', 'directory_sync_weekly.xml', 'new_hires_january.xml',
  'contractor_import.xml', 'benefits_eligibility_update.xml', 'department_realignment.xml',
];
const ACCESS_TYPES = ['Temporary System Access', 'Elevated Document Access', 'Off-Hours Building Access', 'Emergency Payroll Override'];
const EA_STATUSES = ['Draft', 'Submitted', 'Manager Approved', 'Security Review', 'HR Approved', 'Expired', 'Rejected'];

function run(db, rng, ctx, config) {
  const insImport = db.prepare(`INSERT INTO import_jobs
    (import_id, filename, status, records_processed, records_success, records_rejected, warnings, created_at) VALUES (?,?,?,?,?,?,?,?)`);
  const insEmergency = db.prepare(`INSERT INTO emergency_access_requests
    (request_id, employee_id, requested_by, reason, access_type, duration_hours, status,
     manager_approved_by, security_approved_by, hr_approved_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  db.exec('BEGIN');
  for (let i = 1; i <= 14; i++) {
    const processed = rng.int(20, 400);
    const rejected = rng.int(0, Math.floor(processed * 0.08));
    insImport.run(i, rng.pick(IMPORT_FILES), rng.pickWeighted([['Completed', 80], ['Completed with Warnings', 15], ['Failed', 5]]),
      processed, processed - rejected, rejected, rejected > 0 ? `${rejected} record(s) rejected: missing required field.` : null,
      daysAgoIso(rng, 5, 400));
  }

  for (let i = 1; i <= 40; i++) {
    const status = rng.pick(EA_STATUSES);
    const emp = rng.pick(ctx.empRows);
    const requestedBy = rng.pick(ctx.allEmployeeIds);
    const created = daysAgoIso(rng, 5, 300);
    insEmergency.run(i, emp.employee_id, requestedBy, rng.pick([
      'Departing employee equipment retrieval outside business hours.',
      'Payroll correction required before off-cycle pay run.',
      'Temporary access needed to cover an absent team member.',
      'Security incident response requires elevated access.',
    ]), rng.pick(ACCESS_TYPES), rng.pick([4, 8, 24, 48]), status,
      ['Manager Approved', 'Security Review', 'HR Approved', 'Expired'].includes(status) ? rng.pick(ctx.allEmployeeIds) : null,
      ['Security Review', 'HR Approved', 'Expired'].includes(status) ? rng.pick(ctx.allEmployeeIds) : null,
      ['HR Approved', 'Expired'].includes(status) ? rng.pick(ctx.allEmployeeIds) : null,
      created, daysAgoIso(rng, 0, 5));
  }
  db.exec('COMMIT');
}

module.exports = { run };
