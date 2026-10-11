// Every fixed vocabulary list used across the generators: leave types, document categories,
// request categories, ticket categories, ratings, etc. Keeping these in one place makes it easy
// to see (and adjust) the exact taxonomy the whole app uses.
'use strict';

module.exports = {
  LEAVE_TYPES: ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Parental Leave', 'Emergency Leave', 'Unpaid Leave'],
  LEAVE_STATUSES_WEIGHTED: [['Approved', 70], ['Pending', 12], ['Rejected', 8], ['Cancelled', 10]],

  DOCUMENT_TYPES: [
    'Employment Contract', 'Policy', 'Performance Review', 'Compensation Letter', 'Leave Approval',
    'Onboarding', 'Offboarding', 'Benefits', 'Internal Memo', 'Compliance', 'Training',
  ],
  DOCUMENT_CLASSIFICATIONS_WEIGHTED: [['Public', 15], ['Internal', 55], ['Confidential', 25], ['Restricted', 5]],

  HR_REQUEST_CATEGORIES: ['Payroll', 'Leave', 'Benefits', 'Employment', 'Access', 'Documents', 'Onboarding', 'Offboarding', 'Policy', 'General'],
  HR_REQUEST_PRIORITY_WEIGHTED: [['Low', 35], ['Normal', 45], ['High', 15], ['Urgent', 5]],
  HR_REQUEST_STATUS_WEIGHTED: [['Open', 15], ['In Progress', 20], ['Waiting for Employee', 10], ['Resolved', 35], ['Closed', 20]],

  IT_TICKET_CATEGORIES: ['VPN', 'Password', 'Laptop', 'Software', 'Network', 'Email', 'MFA', 'Access', 'Hardware', 'New Employee', 'Offboarding'],

  PERFORMANCE_RATINGS_WEIGHTED: [
    ['Needs Improvement', 6], ['Developing', 16], ['Successful', 46], ['Exceeds Expectations', 24], ['Outstanding', 8],
  ],
  REVIEW_PERIODS: ['H1 2024', 'H2 2024', 'H1 2025', 'H2 2025', 'Annual 2024', 'Annual 2025'],

  TRAINING_COURSES: [
    'Security Awareness Fundamentals', 'Data Protection Essentials', 'Workplace Safety', 'Leadership Fundamentals',
    'HR Compliance Basics', 'Code of Conduct', 'Incident Reporting Procedures', 'Information Security Practices',
    'Anti-Harassment Training', 'Diversity & Inclusion', 'Manager Essentials', 'Effective Communication',
    'Conflict Resolution', 'Time Management', 'Project Management Basics', 'Customer Service Excellence',
    'Financial Literacy for Managers', 'Remote Work Best Practices', 'Business Writing', 'Presentation Skills',
    'Change Management', 'Performance Management for Managers', 'Recruiting & Interviewing', 'Vendor Risk Basics',
    'Phishing Awareness', 'Password & Access Hygiene', 'Records Retention Policy', 'Export Compliance Overview',
    'Workplace Ergonomics', 'New Manager Bootcamp',
  ],
  TRAINING_STATUSES_WEIGHTED: [['Completed', 55], ['In Progress', 25], ['Not Started', 15], ['Overdue', 5]],

  SECURITY_EVENT_TYPES: [
    'Failed Login', 'New Device', 'Password Change', 'MFA Enabled', 'Suspicious Request',
    'Document Access', 'Role Change', 'Import Validation',
  ],

  AUDIT_ACTIONS: [
    'LOGIN', 'LOGOUT', 'VIEW_EMPLOYEE', 'VIEW_DOCUMENT', 'DOWNLOAD_DOCUMENT', 'CREATE_REQUEST',
    'UPDATE_REQUEST', 'EXPORT_REPORT', 'IMPORT_EMPLOYEES', 'VIEW_AUDIT', 'CHANGE_ROLE',
    'UPDATE_PROFILE', 'REPORT_GENERATED',
  ],

  IP_PREFIXES: ['10.24.', '10.31.', '172.20.'],

  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1',
    'Mozilla/5.0 (X11; Linux x86_64) Firefox/129.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/127.0',
  ],

  POLICIES: [
    { name: 'Code of Conduct', body: 'Sets expectations for professional behavior, integrity, and mutual respect across all Solstice Dynamics teams.' },
    { name: 'Remote Work Policy', body: 'Defines eligibility, expectations, and equipment guidelines for employees working outside a company office.' },
    { name: 'Annual Leave Policy', body: 'Describes how annual leave accrues, how to request it, and carryover rules between calendar years.' },
    { name: 'Expense Policy', body: 'Covers what business expenses are reimbursable, approval thresholds, and submission deadlines.' },
    { name: 'Information Security Policy', body: 'Baseline security requirements for handling company systems, credentials, and data classifications.' },
    { name: 'Employee Privacy Policy', body: 'Explains what personal data the company collects about employees and how it is used and retained.' },
    { name: 'Acceptable Use Policy', body: 'Governs appropriate use of company devices, networks, and accounts.' },
    { name: 'Business Continuity Policy', body: 'Outlines how the company maintains operations during a disruption or outage.' },
    { name: 'Incident Reporting Policy', body: 'Describes how employees should report safety, security, or conduct incidents.' },
  ],

  ANNOUNCEMENT_TITLES: [
    'Annual Benefits Enrollment', 'Security Awareness Week', 'Office Maintenance Notice', 'New Remote Work Policy',
    'Employee Town Hall', 'Performance Review Cycle Opens', 'Holiday Schedule Published', 'Payroll Calendar Update',
    'New HR Policy Published', 'Security Training Reminder', 'Q3 All-Hands Recap', 'Parking Garage Closure',
    'New Health Plan Options', 'Building Badge Reader Upgrade', 'Volunteer Day Sign-Up',
  ],

  NOTIFICATION_TEMPLATES: [
    'Your leave request has been approved.',
    'Your leave request has been rejected. See details for the reason.',
    'Your performance review is now available.',
    'Benefits enrollment closes Friday.',
    'Your manager submitted a new goal for you.',
    'A new company policy has been published.',
    'Your HR request has been updated.',
    'Your IT ticket status has changed.',
    'A document has been shared with you.',
    'Your training enrollment deadline is approaching.',
    'Your profile information was updated.',
    'A new announcement has been posted.',
  ],
};
