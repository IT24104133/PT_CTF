// Departments, job titles per department, locations, and the executive/management hierarchy.
// Job titles are grouped by department so an employee's title always makes sense for where they
// work (no "Payroll Officer" showing up in Engineering).
'use strict';

const DEPARTMENTS = [
  { code: 'HR', name: 'Human Resources' },
  { code: 'ENG', name: 'Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'SEC', name: 'Information Security' },
  { code: 'FIN', name: 'Finance' },
  { code: 'LEG', name: 'Legal' },
  { code: 'MKT', name: 'Marketing' },
  { code: 'SAL', name: 'Sales' },
  { code: 'OPS', name: 'Operations' },
  { code: 'CS', name: 'Customer Success' },
  { code: 'PROC', name: 'Procurement' },
  { code: 'FAC', name: 'Facilities' },
];

const JOB_TITLES = {
  HR: ['HR Coordinator', 'HR Generalist', 'Senior HR Generalist', 'HR Business Partner', 'Recruiting Coordinator', 'HR Manager', 'People Operations Specialist', 'Compensation Analyst'],
  ENG: ['Software Engineer', 'Senior Software Engineer', 'Staff Engineer', 'QA Engineer', 'Engineering Manager', 'Site Reliability Engineer', 'Platform Engineer', 'Frontend Engineer', 'Backend Engineer', 'Mobile Engineer'],
  IT: ['IT Support Specialist', 'Senior Systems Analyst', 'Systems Administrator', 'Network Engineer', 'IT Operations Manager', 'Helpdesk Technician', 'Infrastructure Engineer'],
  SEC: ['Security Analyst', 'Senior Security Engineer', 'Security Operations Manager', 'Identity & Access Analyst', 'Application Security Engineer', 'Security Compliance Specialist'],
  FIN: ['Financial Analyst', 'Senior Financial Analyst', 'Payroll Specialist', 'Payroll Manager', 'Accounts Payable Clerk', 'Controller', 'Finance Manager', 'Treasury Analyst'],
  LEG: ['Legal Counsel', 'Senior Legal Counsel', 'Contracts Specialist', 'Compliance Officer', 'Paralegal'],
  MKT: ['Marketing Specialist', 'Content Strategist', 'Brand Manager', 'Marketing Analyst', 'Demand Generation Manager', 'Marketing Director'],
  SAL: ['Account Executive', 'Senior Account Executive', 'Sales Development Rep', 'Sales Director', 'Regional Sales Manager', 'Sales Operations Analyst'],
  OPS: ['Operations Analyst', 'Operations Manager', 'Business Operations Specialist', 'Program Manager', 'Process Improvement Lead'],
  CS: ['Customer Success Manager', 'Senior Customer Success Manager', 'Support Specialist', 'Onboarding Specialist', 'CS Operations Analyst'],
  PROC: ['Procurement Specialist', 'Procurement Manager', 'Vendor Relations Analyst', 'Purchasing Coordinator'],
  FAC: ['Facilities Coordinator', 'Office Manager', 'Facilities Manager', 'Workplace Experience Specialist'],
};

const LEADERSHIP_TITLES = {
  HR: 'HR Director', ENG: 'VP Engineering', IT: 'IT Operations Manager', SEC: 'Chief Information Security Officer',
  FIN: 'Chief Financial Officer', LEG: 'General Counsel', MKT: 'VP Marketing', SAL: 'VP Sales',
  OPS: 'Chief Operating Officer', CS: 'VP Customer Success', PROC: 'Head of Procurement', FAC: 'Facilities Director',
};

const LOCATIONS = ['Riverton HQ', 'Ashford Campus', 'Millbrook Office', 'Dellwood Hub', 'Northgate Center', 'Remote'];
const OFFICES = ['Building A', 'Building B', 'Building C', 'Tower 1', 'Tower 2', 'Annex', 'Remote'];

const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contractor', 'Temporary', 'Intern', 'Consultant'];
const EMPLOYMENT_STATUSES_WEIGHTED = [
  ['Active', 82], ['On Leave', 5], ['Probation', 4], ['Notice Period', 3],
  ['Contract', 3], ['Suspended', 1], ['Inactive', 2],
];
const WORK_MODES = ['Onsite', 'Hybrid', 'Remote'];
const JOB_GRADES = ['G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'];

module.exports = {
  DEPARTMENTS, JOB_TITLES, LEADERSHIP_TITLES, LOCATIONS, OFFICES,
  EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES_WEIGHTED, WORK_MODES, JOB_GRADES,
};
