// Documents + per-role view grants. Storage paths are entirely synthetic (never resolved against
// a real filesystem anywhere in the app) -- they exist only as a realistic-looking string field.
'use strict';
const { DOCUMENT_TYPES, DOCUMENT_CLASSIFICATIONS_WEIGHTED, POLICIES } = require('../data/catalog');

const TITLE_TEMPLATES = {
  'Employment Contract': (name) => `Employment Contract - ${name}`,
  'Policy': () => null, // filled from POLICIES separately
  'Performance Review': (name, period) => `Performance Review - ${name} (${period})`,
  'Compensation Letter': (name) => `Compensation Letter - ${name}`,
  'Leave Approval': (name) => `Leave Approval Notice - ${name}`,
  'Onboarding': (name) => `Onboarding Checklist - ${name}`,
  'Offboarding': (name) => `Offboarding Checklist - ${name}`,
  'Benefits': (name) => `Benefits Enrollment Summary - ${name}`,
  'Internal Memo': () => null,
  'Compliance': () => null,
  'Training': (name) => `Training Completion Record - ${name}`,
};
const MEMO_TITLES = ['Q1 Budget Planning Memo', 'Office Relocation Notice', 'Holiday Schedule Memo',
  'Reorganization Announcement', 'Vendor Transition Memo', 'System Maintenance Notice'];
const COMPLIANCE_TITLES = ['Annual Compliance Attestation', 'Data Retention Compliance Review',
  'Export Control Review', 'Workplace Safety Audit Summary'];

function pathFor(type, id) {
  const folder = type.toLowerCase().replace(/[^a-z]+/g, '-');
  return `/documents/${folder}/doc-${id}.pdf`;
}

function run(db, rng, ctx, config) {
  const insDoc = db.prepare(`INSERT INTO documents
    (document_id, employee_id, document_name, document_type, uploaded_by, classification, storage_path, body_excerpt, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insAccess = db.prepare('INSERT INTO document_access (document_id, role_id, can_view) VALUES (?, ?, 1)');
  const hrIds = [ctx.deptHeadOf.HR, ctx.cpo];
  const nameById = new Map(
    db.prepare('SELECT employee_id, first_name, last_name FROM employees').all()
      .map((e) => [e.employee_id, e.first_name + ' ' + e.last_name]),
  );

  db.exec('BEGIN');
  let id = 1;
  for (; id <= config.DOCUMENT_COUNT; id++) {
    let type = rng.pick(DOCUMENT_TYPES);
    let name, employeeId = rng.pick(ctx.allEmployeeIds), classification = rng.pickWeighted(DOCUMENT_CLASSIFICATIONS_WEIGHTED);
    let excerpt;

    if (type === 'Policy') {
      const pol = rng.pick(POLICIES);
      name = pol.name + ' (v' + rng.int(1, 4) + '.0)';
      employeeId = null;
      classification = 'Public';
      excerpt = pol.body;
    } else if (type === 'Internal Memo') {
      name = rng.pick(MEMO_TITLES);
      employeeId = null;
      excerpt = 'Internal communication distributed to relevant teams.';
    } else if (type === 'Compliance') {
      name = rng.pick(COMPLIANCE_TITLES);
      employeeId = null;
      excerpt = 'Routine compliance documentation retained per records policy.';
    } else {
      const displayName = nameById.get(employeeId) || employeeId;
      name = TITLE_TEMPLATES[type](displayName, '2025');
      excerpt = `${type} on file for ${displayName} (${employeeId}). Retained per standard HR document retention schedule.`;
    }

    const uploadedBy = rng.pick(hrIds);
    const created = new Date(2019, rng.int(0, 11), rng.int(1, 28), rng.int(8, 18), rng.int(0, 59)).toISOString();
    insDoc.run(id, employeeId, name, type, uploadedBy, classification, pathFor(type, id), excerpt, created);

    // Access grants: Public -> everyone (role 1..9), Internal -> most business roles,
    // Confidential -> HR/managers/admin, Restricted -> HR Manager/Security/Administrator only.
    const grantsByClass = {
      Public: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      Internal: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      Confidential: [2, 3, 4, 8, 9],
      Restricted: [4, 8, 9],
    };
    for (const roleId of grantsByClass[classification]) insAccess.run(id, roleId);
  }
  db.exec('COMMIT');
  return { lastDocumentId: id - 1 };
}

module.exports = { run };
