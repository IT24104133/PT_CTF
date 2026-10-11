-- Solstice PeopleHub -- relational schema (SQLite). Built once by seed/seed.js into a persistent
-- file (db/peoplehub.sqlite), not rebuilt per request -- that's what makes 1,000+ employee /
-- 2,000+ audit-log scale workable with real pagination instead of re-generating on every call.

PRAGMA foreign_keys = ON;

CREATE TABLE roles (
  role_id     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,       -- Employee, Manager, HR Helpdesk, HR Manager, Recruiter,
                                           -- Payroll, IT Support, Security, Administrator
  description TEXT
);

CREATE TABLE departments (
  department_id INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  head_employee_id INTEGER               -- FK added after employees exists (see below)
);

CREATE TABLE employees (
  employee_id       TEXT PRIMARY KEY,     -- e.g. SD-10427
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  preferred_name    TEXT,
  email             TEXT NOT NULL UNIQUE,
  phone_extension   TEXT,
  job_title         TEXT NOT NULL,
  department_id     INTEGER NOT NULL REFERENCES departments(department_id),
  manager_id        TEXT REFERENCES employees(employee_id),
  location          TEXT,
  office            TEXT,
  employment_type   TEXT NOT NULL,
  employment_status TEXT NOT NULL,
  job_grade         TEXT,
  join_date         TEXT NOT NULL,
  date_of_birth     TEXT,
  work_mode         TEXT,
  profile_photo     TEXT,
  is_leadership     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_status ON employees(employment_status);
CREATE INDEX idx_employees_name ON employees(last_name, first_name);
CREATE INDEX idx_employees_location ON employees(location);
CREATE INDEX idx_employees_grade ON employees(job_grade);

CREATE TABLE employee_profiles (
  employee_id   TEXT PRIMARY KEY REFERENCES employees(employee_id),
  bio           TEXT,
  skills        TEXT,               -- comma-separated, denormalized on purpose (read-mostly)
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes         TEXT                -- internal HR notes, permission-controlled in the UI
);

CREATE TABLE users (
  user_id       INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,       -- opaque, never actually validated (see challenge notes)
  role_id       INTEGER NOT NULL REFERENCES roles(role_id),
  employee_id   TEXT REFERENCES employees(employee_id),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE leave_records (
  leave_id     INTEGER PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(employee_id),
  leave_type   TEXT NOT NULL,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  days         INTEGER NOT NULL,
  status       TEXT NOT NULL,
  approved_by  TEXT REFERENCES employees(employee_id),
  reason       TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_leave_employee ON leave_records(employee_id);
CREATE INDEX idx_leave_status ON leave_records(status);

CREATE TABLE payroll (
  employee_id       TEXT PRIMARY KEY REFERENCES employees(employee_id),
  salary_band       TEXT NOT NULL,
  base_salary       INTEGER NOT NULL,
  bonus_percentage  INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  pay_frequency     TEXT NOT NULL DEFAULT 'Monthly',
  payroll_status    TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE performance_reviews (
  review_id     INTEGER PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES employees(employee_id),
  reviewer_id   TEXT REFERENCES employees(employee_id),
  review_period TEXT NOT NULL,
  rating        TEXT NOT NULL,
  summary       TEXT,
  goals         TEXT,
  status        TEXT NOT NULL DEFAULT 'Finalized',
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_reviews_employee ON performance_reviews(employee_id);

CREATE TABLE documents (
  document_id     INTEGER PRIMARY KEY,
  employee_id     TEXT REFERENCES employees(employee_id),   -- owning employee (nullable: some are company-wide)
  document_name   TEXT NOT NULL,
  document_type   TEXT NOT NULL,
  uploaded_by     TEXT REFERENCES employees(employee_id),
  classification  TEXT NOT NULL,
  storage_path    TEXT NOT NULL,      -- synthetic path, never a real filesystem path
  body_excerpt    TEXT,               -- short synthetic content shown in the document viewer
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_documents_employee ON documents(employee_id);
CREATE INDEX idx_documents_type ON documents(document_type);

CREATE TABLE document_access (
  document_id  INTEGER NOT NULL REFERENCES documents(document_id),
  role_id      INTEGER NOT NULL REFERENCES roles(role_id),
  can_view     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (document_id, role_id)
);

CREATE TABLE hr_requests (
  request_id   INTEGER PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(employee_id),
  category     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL,
  status       TEXT NOT NULL,
  assigned_to  TEXT REFERENCES employees(employee_id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_hrreq_employee ON hr_requests(employee_id);
CREATE INDEX idx_hrreq_status ON hr_requests(status);
CREATE INDEX idx_hrreq_category ON hr_requests(category);

CREATE TABLE it_tickets (
  ticket_id    INTEGER PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees(employee_id),
  category     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL,
  status       TEXT NOT NULL,
  assigned_to  TEXT REFERENCES employees(employee_id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_itticket_employee ON it_tickets(employee_id);

CREATE TABLE audit_logs (
  audit_id      INTEGER PRIMARY KEY,
  timestamp     TEXT NOT NULL,
  user_id       INTEGER REFERENCES users(user_id),
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    TEXT,
  result        TEXT NOT NULL DEFAULT 'SUCCESS',
  user_agent    TEXT
);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

CREATE TABLE notifications (
  notification_id INTEGER PRIMARY KEY,
  employee_id      TEXT NOT NULL REFERENCES employees(employee_id),
  message          TEXT NOT NULL,
  type             TEXT,
  is_read          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_notif_employee ON notifications(employee_id);

CREATE TABLE announcements (
  announcement_id INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  published_by    TEXT REFERENCES employees(employee_id),
  published_at    TEXT NOT NULL,
  is_pinned       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reports (
  report_id    INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  category     TEXT
);

CREATE TABLE report_results (
  result_id    INTEGER PRIMARY KEY,
  report_id    INTEGER NOT NULL REFERENCES reports(report_id),
  dimension    TEXT NOT NULL,      -- e.g. a department name, a location, a grade
  metric_name  TEXT NOT NULL,
  metric_value REAL NOT NULL
);
CREATE INDEX idx_reportresults_report ON report_results(report_id);

CREATE TABLE job_openings (
  job_id        INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(department_id),
  location      TEXT,
  status        TEXT NOT NULL DEFAULT 'Open',
  opened_at     TEXT NOT NULL
);

CREATE TABLE candidates (
  candidate_id  INTEGER PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  source        TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE applications (
  application_id INTEGER PRIMARY KEY,
  candidate_id   INTEGER NOT NULL REFERENCES candidates(candidate_id),
  job_id         INTEGER NOT NULL REFERENCES job_openings(job_id),
  stage          TEXT NOT NULL,
  applied_at     TEXT NOT NULL
);

CREATE TABLE interviews (
  interview_id   INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(application_id),
  interviewer_id TEXT REFERENCES employees(employee_id),
  scheduled_at   TEXT NOT NULL,
  outcome        TEXT
);

CREATE TABLE training_courses (
  course_id    INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  is_mandatory INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE training_enrollments (
  enrollment_id INTEGER PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES employees(employee_id),
  course_id     INTEGER NOT NULL REFERENCES training_courses(course_id),
  status        TEXT NOT NULL,
  enrolled_at   TEXT NOT NULL,
  completed_at  TEXT
);
CREATE INDEX idx_trainenroll_employee ON training_enrollments(employee_id);

CREATE TABLE security_events (
  event_id     INTEGER PRIMARY KEY,
  timestamp    TEXT NOT NULL,
  employee_id  TEXT REFERENCES employees(employee_id),
  event_type   TEXT NOT NULL,
  detail       TEXT,
  ip_address   TEXT,
  severity     TEXT NOT NULL DEFAULT 'Info'
);
CREATE INDEX idx_secevents_timestamp ON security_events(timestamp);

CREATE TABLE import_jobs (
  import_id        INTEGER PRIMARY KEY,
  filename         TEXT NOT NULL,
  status           TEXT NOT NULL,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_success   INTEGER NOT NULL DEFAULT 0,
  records_rejected  INTEGER NOT NULL DEFAULT 0,
  warnings         TEXT,
  created_at       TEXT NOT NULL
);

-- Server-side-only challenge progress. Never returned by any normal API response; only the
-- backend reads/writes this (see the ctf-admin notes in the developer README).
CREATE TABLE challenge_state (
  session_key   TEXT PRIMARY KEY,
  stage3_login      INTEGER NOT NULL DEFAULT 0,
  stage3_directory  INTEGER NOT NULL DEFAULT 0,
  stage3_employee   INTEGER NOT NULL DEFAULT 0,
  stage3_report     INTEGER NOT NULL DEFAULT 0,
  stage3_request    INTEGER NOT NULL DEFAULT 0,
  stage3_document   INTEGER NOT NULL DEFAULT 0,
  stage3_xxe        INTEGER NOT NULL DEFAULT 0,
  stage3_xss        INTEGER NOT NULL DEFAULT 0,
  stage3_emergency  INTEGER NOT NULL DEFAULT 0,
  stage3_complete   INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT
);

-- Emergency access workflow (section 39).
CREATE TABLE emergency_access_requests (
  request_id        INTEGER PRIMARY KEY,
  employee_id        TEXT NOT NULL REFERENCES employees(employee_id),
  requested_by       TEXT NOT NULL REFERENCES employees(employee_id),
  reason             TEXT NOT NULL,
  access_type        TEXT NOT NULL,
  duration_hours     INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'Draft',
  manager_approved_by  TEXT REFERENCES employees(employee_id),
  security_approved_by TEXT REFERENCES employees(employee_id),
  hr_approved_by       TEXT REFERENCES employees(employee_id),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
