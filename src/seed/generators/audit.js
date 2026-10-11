// Audit trail + security events. IPs are always drawn from private ranges (10.24.x.x, 10.31.x.x,
// 172.20.x.x) -- never anything resembling a real public address.
'use strict';
const { AUDIT_ACTIONS, IP_PREFIXES, USER_AGENTS, SECURITY_EVENT_TYPES } = require('../data/catalog');

function privateIp(rng) {
  const prefix = rng.pick(IP_PREFIXES);
  return prefix + rng.int(0, 255) + '.' + rng.int(1, 254);
}
function daysAgoIso(rng, min, max) {
  return new Date(Date.now() - (min + rng.float() * (max - min)) * 86400000).toISOString();
}

const RESOURCE_TYPE_BY_ACTION = {
  LOGIN: null, LOGOUT: null, VIEW_EMPLOYEE: 'employee', VIEW_DOCUMENT: 'document',
  DOWNLOAD_DOCUMENT: 'document', CREATE_REQUEST: 'hr_request', UPDATE_REQUEST: 'hr_request',
  EXPORT_REPORT: 'report', IMPORT_EMPLOYEES: 'import_job', VIEW_AUDIT: 'audit_log',
  CHANGE_ROLE: 'user', UPDATE_PROFILE: 'employee', REPORT_GENERATED: 'report',
};

function run(db, rng, ctx, config, userRows) {
  const insAudit = db.prepare(`INSERT INTO audit_logs
    (audit_id, timestamp, user_id, action, resource_type, resource_id, ip_address, result, user_agent) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insSec = db.prepare(`INSERT INTO security_events
    (event_id, timestamp, employee_id, event_type, detail, ip_address, severity) VALUES (?,?,?,?,?,?,?)`);

  db.exec('BEGIN');
  for (let i = 1; i <= config.AUDIT_COUNT; i++) {
    const user = rng.pick(userRows);
    const action = rng.pick(AUDIT_ACTIONS);
    const resType = RESOURCE_TYPE_BY_ACTION[action];
    insAudit.run(i, daysAgoIso(rng, 0, 365), user.user_id, action, resType,
      resType ? String(rng.int(1, 1200)) : null, privateIp(rng),
      rng.pickWeighted([['SUCCESS', 92], ['FAILURE', 8]]), rng.pick(USER_AGENTS));
  }

  const DETAIL_BY_TYPE = {
    'Failed Login': 'Repeated failed authentication attempts detected for this account.',
    'New Device': 'Sign-in from a previously unseen device fingerprint.',
    'Password Change': 'Account password was changed.',
    'MFA Enabled': 'Multi-factor authentication was enabled for this account.',
    'Suspicious Request': 'Request pattern flagged by automated monitoring for manual review.',
    'Document Access': 'Access to a classified document was recorded.',
    'Role Change': 'Account role was modified by an administrator.',
    'Import Validation': 'Employee data import file completed validation.',
  };
  for (let i = 1; i <= config.SECURITY_EVENT_COUNT; i++) {
    const emp = rng.pick(ctx.empRows);
    const type = rng.pick(SECURITY_EVENT_TYPES);
    insSec.run(i, daysAgoIso(rng, 0, 365), emp.employee_id, type, DETAIL_BY_TYPE[type], privateIp(rng),
      rng.pickWeighted([['Info', 70], ['Low', 15], ['Medium', 10], ['High', 5]]));
  }
  db.exec('COMMIT');
}

module.exports = { run };
