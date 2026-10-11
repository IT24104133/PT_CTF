// HR requests + IT tickets. Subjects/descriptions are templated from realistic phrasing so the
// tables read as a genuine ticket queue rather than obviously-generated filler.
'use strict';
const { HR_REQUEST_CATEGORIES, HR_REQUEST_PRIORITY_WEIGHTED, HR_REQUEST_STATUS_WEIGHTED, IT_TICKET_CATEGORIES } = require('../data/catalog');

const HR_SUBJECTS = {
  Payroll: ['Question about my latest payslip', 'Missing bonus payment', 'Tax withholding update needed', 'Direct deposit change request'],
  Leave: ['Leave balance discrepancy', 'Need to adjust approved leave dates', 'Question about carryover policy'],
  Benefits: ['Benefits enrollment question', 'Dependent add request', 'Health plan change request'],
  Employment: ['Employment verification letter request', 'Title change request', 'Internal transfer inquiry'],
  Access: ['Requesting access to shared drive', 'System access review request', 'Badge access not working'],
  Documents: ['Requesting copy of employment contract', 'Missing signed offer letter', 'Document upload issue'],
  Onboarding: ['New hire equipment not received', 'Onboarding checklist question', 'First day logistics question'],
  Offboarding: ['Final paycheck question', 'Exit interview scheduling', 'Return of equipment confirmation'],
  Policy: ['Question about remote work policy', 'Clarification on expense policy', 'Policy exception request'],
  General: ['General HR question', 'Update contact information', 'Question about company holiday schedule'],
};
const IT_SUBJECTS = {
  VPN: ['VPN client will not connect', 'VPN keeps disconnecting', 'Requesting VPN access for new role'],
  Password: ['Password reset needed', 'Account locked out', 'Unable to change password'],
  Laptop: ['Laptop running slow', 'Laptop screen flickering', 'Requesting laptop replacement'],
  Software: ['Software installation request', 'Application crashing on launch', 'License activation issue'],
  Network: ['No network connectivity in office', 'Wi-Fi dropping intermittently', 'Slow network performance'],
  Email: ['Not receiving external emails', 'Email signature setup request', 'Mailbox storage full'],
  MFA: ['MFA device lost', 'Unable to complete MFA setup', 'MFA prompt not appearing'],
  Access: ['Requesting access to shared system', 'Permission denied on shared folder', 'Access review follow-up'],
  Hardware: ['Monitor not detected', 'Keyboard not working', 'Docking station issue'],
  'New Employee': ['New hire account setup', 'New hire equipment provisioning', 'New hire access request'],
  Offboarding: ['Disable departing employee account', 'Equipment return coordination', 'Mailbox archival request'],
};

function daysAgoIso(rng, min, max) { return new Date(Date.now() - rng.int(min, max) * 86400000).toISOString(); }

function run(db, rng, ctx, config) {
  const insHr = db.prepare(`INSERT INTO hr_requests
    (request_id, employee_id, category, subject, description, priority, status, assigned_to, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insIt = db.prepare(`INSERT INTO it_tickets
    (ticket_id, employee_id, category, subject, description, priority, status, assigned_to, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const hrHandlers = ctx.allEmployeeIds; // narrowed to HR staff at the app layer; any id is fine for seed realism
  const itHandlers = ctx.allEmployeeIds;

  db.exec('BEGIN');
  for (let i = 1; i <= config.HR_REQUEST_COUNT; i++) {
    const cat = rng.pick(HR_REQUEST_CATEGORIES);
    const emp = rng.pick(ctx.empRows);
    const status = rng.pickWeighted(HR_REQUEST_STATUS_WEIGHTED);
    const created = daysAgoIso(rng, 1, 400);
    insHr.run(i, emp.employee_id, cat, rng.pick(HR_SUBJECTS[cat]),
      `Submitted via employee self-service portal. Category: ${cat}.`,
      rng.pickWeighted(HR_REQUEST_PRIORITY_WEIGHTED), status,
      status === 'Open' ? null : rng.pick(hrHandlers), created,
      status === 'Open' ? created : daysAgoIso(rng, 0, 30));
  }
  for (let i = 1; i <= config.IT_TICKET_COUNT; i++) {
    const cat = rng.pick(IT_TICKET_CATEGORIES);
    const emp = rng.pick(ctx.empRows);
    const status = rng.pickWeighted([['Open', 15], ['In Progress', 20], ['Waiting for Employee', 10], ['Resolved', 35], ['Closed', 20]]);
    const created = daysAgoIso(rng, 1, 400);
    insIt.run(i, emp.employee_id, cat, rng.pick(IT_SUBJECTS[cat]),
      `Reported by employee. Category: ${cat}.`,
      rng.pickWeighted([['Low', 30], ['Normal', 45], ['High', 20], ['Urgent', 5]]), status,
      status === 'Open' ? null : rng.pick(itHandlers), created,
      status === 'Open' ? created : daysAgoIso(rng, 0, 30));
  }
  db.exec('COMMIT');
}

module.exports = { run };
