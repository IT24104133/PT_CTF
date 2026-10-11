// Role -> capability matrix (section 71 of the design brief). Every route handler checks these
// server-side; the frontend also hides nav items a role can't use, but that's convenience only --
// none of it is trusted as the actual access control.
'use strict';

const CAPS = {
  Employee:      { directory: false, anyProfile: false, teamProfiles: false, payroll: false, reports: false, hrAdmin: false, itAdmin: false, recruitment: false, audit: false, security: false, admin: false, emergencyApprove: false },
  Manager:       { directory: true,  anyProfile: false, teamProfiles: true,  payroll: false, reports: false, hrAdmin: false, itAdmin: false, recruitment: false, audit: false, security: false, admin: false, emergencyApprove: true },
  'HR Helpdesk': { directory: true,  anyProfile: true,  teamProfiles: false, payroll: false, reports: false, hrAdmin: false, itAdmin: false, recruitment: false, audit: false, security: false, admin: false, emergencyApprove: false },
  'HR Manager':  { directory: true,  anyProfile: true,  teamProfiles: true,  payroll: true,  reports: true,  hrAdmin: true,  itAdmin: false, recruitment: true,  audit: false, security: false, admin: false, emergencyApprove: true },
  Recruiter:     { directory: true,  anyProfile: false, teamProfiles: false, payroll: false, reports: false, hrAdmin: false, itAdmin: false, recruitment: true,  audit: false, security: false, admin: false, emergencyApprove: false },
  Payroll:       { directory: true,  anyProfile: false, teamProfiles: false, payroll: true,  reports: true,  hrAdmin: false, itAdmin: false, recruitment: false, audit: false, security: false, admin: false, emergencyApprove: false },
  'IT Support':  { directory: true,  anyProfile: false, teamProfiles: false, payroll: false, reports: false, hrAdmin: false, itAdmin: true,  recruitment: false, audit: false, security: false, admin: false, emergencyApprove: false },
  Security:      { directory: true,  anyProfile: true,  teamProfiles: false, payroll: false, reports: true,  hrAdmin: false, itAdmin: false, recruitment: false, audit: true,  security: true,  admin: false, emergencyApprove: true },
  Administrator: { directory: true,  anyProfile: true,  teamProfiles: true,  payroll: true,  reports: true,  hrAdmin: true,  itAdmin: true,  recruitment: true,  audit: true,  security: true,  admin: true, emergencyApprove: true },
};

function capsFor(roleName) { return CAPS[roleName] || CAPS.Employee; }
function can(roleName, capability) { return !!capsFor(roleName)[capability]; }

module.exports = { CAPS, capsFor, can };
