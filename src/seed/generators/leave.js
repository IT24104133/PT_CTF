'use strict';
const { LEAVE_TYPES, LEAVE_STATUSES_WEIGHTED } = require('../data/catalog');

const REASONS = {
  'Annual Leave': ['Family trip', 'Personal time off', 'Vacation', 'Long weekend', null],
  'Sick Leave': ['Not feeling well', 'Medical appointment', 'Recovery', null],
  'Personal Leave': ['Personal matters', 'Family commitment', null],
  'Parental Leave': ['Welcoming a new child'],
  'Emergency Leave': ['Family emergency', 'Urgent personal matter'],
  'Unpaid Leave': ['Extended personal time', 'Approved unpaid absence'],
};

function run(db, rng, ctx, config) {
  const ins = db.prepare(`INSERT INTO leave_records
    (leave_id, employee_id, leave_type, start_date, end_date, days, status, approved_by, reason, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const managerIds = ctx.empRows.map((e) => e.employee_id);
  db.exec('BEGIN');
  for (let i = 1; i <= config.LEAVE_COUNT; i++) {
    const emp = rng.pick(ctx.empRows);
    const type = rng.pick(LEAVE_TYPES);
    const status = rng.pickWeighted(LEAVE_STATUSES_WEIGHTED);
    const start = new Date(2024, rng.int(0, 11), rng.int(1, 28));
    const days = type === 'Parental Leave' ? rng.int(10, 60) : rng.int(1, 10);
    const end = new Date(start.getTime() + days * 86400000);
    const reasonOptions = REASONS[type] || [null];
    ins.run(i, emp.employee_id, type, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10),
      days, status, status === 'Approved' ? rng.pick(managerIds) : null, rng.pick(reasonOptions),
      new Date(start.getTime() - 86400000 * rng.int(1, 14)).toISOString());
  }
  db.exec('COMMIT');
}

module.exports = { run };
