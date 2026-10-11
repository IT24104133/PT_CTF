// Departments, the executive/management hierarchy, employees, profiles, payroll, and PeopleHub
// login accounts. Everything else in seed/ foreign-keys against what this module creates, so it
// runs first.
'use strict';
const { DEPARTMENTS, JOB_TITLES, LEADERSHIP_TITLES, LOCATIONS, OFFICES, EMPLOYMENT_TYPES,
  EMPLOYMENT_STATUSES_WEIGHTED, WORK_MODES, JOB_GRADES } = require('../data/org');
const { FIRST_NAMES, LAST_NAMES } = require('../data/names');

// Roughly realistic headcount weighting -- Engineering and Sales are the biggest, Facilities and
// Procurement the smallest, everything else in between.
const DEPT_WEIGHTS = { ENG: 22, SAL: 14, OPS: 10, CS: 10, IT: 9, FIN: 8, MKT: 7, HR: 7, SEC: 5, LEG: 3, PROC: 3, FAC: 2 };

function isoDate(d) { return d.toISOString().slice(0, 10); }
function isoDateTime(d) { return d.toISOString(); }

function randomDateBetween(rng, startYear, endYear) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + rng.float() * (end - start));
}

function gradeForTitle(rng, title) {
  if (/^Chief|^VP|Director$/i.test(title)) return rng.pick(['G9', 'G10']);
  if (/Manager$/i.test(title)) return rng.pick(['G7', 'G8']);
  if (/^Senior|^Staff/i.test(title)) return rng.pick(['G6', 'G7']);
  return rng.pick(['G3', 'G4', 'G5']);
}

function run(db, rng, config) {
  const usedEmail = new Set();
  const usedNamePair = new Set();

  function makeName() {
    let first, last, key;
    let tries = 0;
    do {
      first = rng.pick(FIRST_NAMES);
      last = rng.pick(LAST_NAMES);
      key = first + '|' + last;
      tries++;
    } while (usedNamePair.has(key) && tries < 8); // duplicates ARE allowed (real orgs have them);
    usedNamePair.add(key);                        // this just biases toward fresh combos first
    return { first, last };
  }

  function makeEmail(first, last) {
    let base = (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '');
    let email = base + '@' + config.EMAIL_DOMAIN;
    let n = 2;
    while (usedEmail.has(email)) { email = base + n + '@' + config.EMAIL_DOMAIN; n++; }
    usedEmail.add(email);
    return email;
  }

  // ---- departments (+ one synthetic Executive Leadership grouping for the C-suite) ----
  const insDept = db.prepare('INSERT INTO departments (department_id, code, name) VALUES (?, ?, ?)');
  const deptIdByCode = {};
  let deptId = 1;
  insDept.run(deptId, 'EXEC', 'Executive Leadership');
  deptIdByCode.EXEC = deptId; deptId++;
  for (const d of DEPARTMENTS) { insDept.run(deptId, d.code, d.name); deptIdByCode[d.code] = deptId; deptId++; }

  // ---- employees ----
  const insEmp = db.prepare(`INSERT INTO employees
    (employee_id, first_name, last_name, preferred_name, email, phone_extension, job_title,
     department_id, manager_id, location, office, employment_type, employment_status, job_grade,
     join_date, date_of_birth, work_mode, profile_photo, is_leadership, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  let nextId = 10001;
  function newEmployeeId() { return 'SD-' + (nextId++); }

  function createEmployee({ deptCode, title, managerId, isLeadership, statusOverride }) {
    const { first, last } = makeName();
    const preferred = rng.bool(0.12) ? rng.pick([first.slice(0, first.length - 1), first + 'ie', first.slice(0, 3)]) : null;
    const id = newEmployeeId();
    const email = makeEmail(first, last);
    const join = randomDateBetween(rng, 2014, 2025);
    const dob = randomDateBetween(rng, 1968, 2003);
    const status = statusOverride || rng.pickWeighted(EMPLOYMENT_STATUSES_WEIGHTED);
    const empType = isLeadership ? 'Full Time' : rng.pickWeighted([
      ['Full Time', 82], ['Part Time', 5], ['Contractor', 6], ['Temporary', 3], ['Intern', 2], ['Consultant', 2],
    ]);
    const now = isoDateTime(new Date());
    insEmp.run(
      id, first, last, preferred, email, String(rng.int(1000, 9999)), title,
      deptIdByCode[deptCode], managerId || null, rng.pick(LOCATIONS), rng.pick(OFFICES),
      empType, status, gradeForTitle(rng, title), isoDate(join), isoDate(dob),
      rng.pick(WORK_MODES), null, isLeadership ? 1 : 0, now, now,
    );
    return id;
  }

  // Leadership: CEO, Chief People Officer, CTO, then one head per functional department.
  const ceo = createEmployee({ deptCode: 'EXEC', title: 'Chief Executive Officer', managerId: null, isLeadership: true, statusOverride: 'Active' });
  const cpo = createEmployee({ deptCode: 'EXEC', title: 'Chief People Officer', managerId: ceo, isLeadership: true, statusOverride: 'Active' });
  const cto = createEmployee({ deptCode: 'EXEC', title: 'Chief Technology Officer', managerId: ceo, isLeadership: true, statusOverride: 'Active' });

  const deptHeadOf = {};
  const reportsToCEO = ['FIN', 'LEG', 'MKT', 'SAL', 'OPS', 'CS'];
  const reportsToCTO = ['ENG', 'IT', 'SEC'];
  for (const code of reportsToCEO) {
    deptHeadOf[code] = createEmployee({ deptCode: code, title: LEADERSHIP_TITLES[code], managerId: ceo, isLeadership: true, statusOverride: 'Active' });
  }
  for (const code of reportsToCTO) {
    deptHeadOf[code] = createEmployee({ deptCode: code, title: LEADERSHIP_TITLES[code], managerId: cto, isLeadership: true, statusOverride: 'Active' });
  }
  deptHeadOf.HR = createEmployee({ deptCode: 'HR', title: LEADERSHIP_TITLES.HR, managerId: cpo, isLeadership: true, statusOverride: 'Active' });
  // Procurement and Facilities sit under Operations (the COO).
  deptHeadOf.PROC = createEmployee({ deptCode: 'PROC', title: LEADERSHIP_TITLES.PROC, managerId: deptHeadOf.OPS, isLeadership: true, statusOverride: 'Active' });
  deptHeadOf.FAC = createEmployee({ deptCode: 'FAC', title: LEADERSHIP_TITLES.FAC, managerId: deptHeadOf.OPS, isLeadership: true, statusOverride: 'Active' });

  // Now fill out each department: a layer of mid-level managers reporting to the head, then
  // individual contributors reporting to either the head or one of those managers.
  const totalRemaining = config.EMPLOYEE_COUNT - Object.keys(deptHeadOf).length - 3; // minus leadership already placed
  const weightSum = Object.values(DEPT_WEIGHTS).reduce((a, b) => a + b, 0);
  const allEmployeeIds = [ceo, cpo, cto, ...Object.values(deptHeadOf)];
  const managerPool = []; // every id that's allowed to have direct reports

  for (const d of DEPARTMENTS) {
    const code = d.code;
    const share = Math.max(4, Math.round((DEPT_WEIGHTS[code] / weightSum) * totalRemaining));
    const managerTitles = JOB_TITLES[code].filter((t) => /Manager|Director$/i.test(t));
    const icTitles = JOB_TITLES[code].filter((t) => !/Manager|Director$/i.test(t));
    const managerCount = Math.max(1, Math.round(share * 0.10));
    const deptManagers = [deptHeadOf[code]];

    for (let i = 0; i < managerCount; i++) {
      const mid = createEmployee({
        deptCode: code, title: rng.pick(managerTitles.length ? managerTitles : JOB_TITLES[code]),
        managerId: deptHeadOf[code], isLeadership: false,
      });
      deptManagers.push(mid);
      allEmployeeIds.push(mid);
    }
    managerPool.push(...deptManagers);

    const icCount = share - managerCount;
    for (let i = 0; i < icCount; i++) {
      const mgr = rng.pick(deptManagers);
      const id = createEmployee({
        deptCode: code, title: rng.pick(icTitles.length ? icTitles : JOB_TITLES[code]),
        managerId: mgr, isLeadership: false,
      });
      allEmployeeIds.push(id);
    }
  }

  // ---- employee_profiles ----
  const insProfile = db.prepare(`INSERT INTO employee_profiles
    (employee_id, bio, skills, emergency_contact_name, emergency_contact_phone, notes) VALUES (?,?,?,?,?,?)`);
  const SKILL_POOL = ['Communication', 'Project Management', 'Data Analysis', 'Stakeholder Management',
    'Process Improvement', 'Cross-functional Collaboration', 'Documentation', 'Vendor Management',
    'Budgeting', 'Public Speaking', 'Mentoring', 'Negotiation'];
  for (const id of allEmployeeIds) {
    const skills = rng.shuffle(SKILL_POOL).slice(0, rng.int(2, 5)).join(', ');
    insProfile.run(id, null, skills, rng.pick(FIRST_NAMES) + ' ' + rng.pick(LAST_NAMES), '555-01' + rng.int(10, 99), null);
  }

  // ---- payroll (every employee has one row; access is gated in the app layer, not here) ----
  const insPayroll = db.prepare(`INSERT INTO payroll
    (employee_id, salary_band, base_salary, bonus_percentage, currency, pay_frequency, payroll_status) VALUES (?,?,?,?,?,?,?)`);
  const empRows = db.prepare('SELECT employee_id, job_grade, employment_status FROM employees').all();
  const BASE_BY_GRADE = { G3: 48000, G4: 56000, G5: 66000, G6: 78000, G7: 92000, G8: 112000, G9: 148000, G10: 195000 };
  for (const e of empRows) {
    const base = (BASE_BY_GRADE[e.job_grade] || 60000) + rng.int(-4000, 6000);
    insPayroll.run(e.employee_id, e.job_grade, base, rng.int(0, 15),
      'USD', 'Monthly', e.employment_status === 'Inactive' ? 'Inactive' : 'Active');
  }

  return { deptIdByCode, deptHeadOf, ceo, cpo, cto, allEmployeeIds, empRows };
}

module.exports = { run };
