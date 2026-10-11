# Solstice CTF — Solstice PeopleHub

An intentionally vulnerable, fully local cybersecurity training application. The centerpiece is
**Solstice PeopleHub**, a fictional enterprise HR platform (Solstice Dynamics Ltd.) with ~1,000
synthetic employees, a dozen business modules, and a set of realistic security weaknesses woven
into normal-looking functionality — reached through the outer Solstice CTF storyline as **Exhibit
C**.

Everything is synthetic: fictional company, fictional people, fictional documents, a fictional
filesystem for the XXE lab. Nothing here ever touches a real filesystem path, a real credential, a
real network, or sends data anywhere outside this machine.

---

## Quick start

```
npm run seed          # outer CTF: users.json + challenges.json
npm run seed:peoplehub  # PeopleHub: db/peoplehub.sqlite (~1,000 employees, ~30s)
npm start              # http://localhost:3000
```

Requires Node 18+ (uses `node:sqlite`, currently experimental — you'll see a harmless
`ExperimentalWarning` on startup). No other dependencies; nothing is installed from npm.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `EVIDENCE_DIR`, `USERS_FILE`, `CHALLENGES_FILE` | Outer CTF data locations (see `src/seed/outer-seed.js`) |
| `SEED_EMPLOYEE_COUNT`, `SEED_DOCUMENT_COUNT`, `SEED_REQUEST_COUNT`, `SEED_AUDIT_COUNT`, `SEED_LEAVE_COUNT`, `SEED_IT_TICKET_COUNT`, `SEED_NOTIFICATION_COUNT`, `SEED_ANNOUNCEMENT_COUNT`, `SEED_REPORT_COUNT`, `SEED_JOB_OPENING_COUNT`, `SEED_CANDIDATE_COUNT`, `SEED_APPLICATION_COUNT`, `SEED_INTERVIEW_COUNT`, `SEED_PERFORMANCE_REVIEW_COUNT`, `SEED_TRAINING_COURSE_COUNT`, `SEED_TRAINING_ENROLLMENT_COUNT`, `SEED_SECURITY_EVENT_COUNT` | Override any PeopleHub data volume (see `src/seed/config.js`) |
| `SEED_RNG_SEED` | Change the seeded PRNG's seed (default is fixed, so re-seeding is deterministic — same seed in, same data out) |

---

## Deployment

### Hosting it on the internet (recommended path)

A small VPS (Hetzner CX22, DigitalOcean/Linode $6/mo tier, AWS Lightsail — 1–2 vCPU / 1–2 GB RAM
is plenty) running the app natively behind **Caddy** on the same host, with a real domain pointed
at it. This topology needs zero code changes because it matches what `fromLoopback()` in
`src/server.js` already assumes: the reverse proxy and the Node process share one machine, so the
app can trust `CF-Connecting-IP`/`X-Forwarded-Proto` for real client IPs and HTTPS cookies.

```
# on the VPS, as a sudo user
git clone <this repo> /opt/solstice-ctf && cd /opt/solstice-ctf
npm run seed && npm run seed:peoplehub
sudo cp deploy/solstice-ctf.service /etc/systemd/system/
sudo useradd --system --home /opt/solstice-ctf --shell /usr/sbin/nologin solstice-ctf
sudo chown -R solstice-ctf:solstice-ctf /opt/solstice-ctf
sudo systemctl daemon-reload && sudo systemctl enable --now solstice-ctf

sudo apt install -y caddy   # or the official Caddy repo for your distro
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domain first
sudo systemctl reload caddy

sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443
sudo ufw enable                                 # do NOT allow 3000 externally
```

**Read [`deploy/Caddyfile`](deploy/Caddyfile) before you deploy.** Because Caddy connects to Node
from the same host, *every* internet visitor's request looks like a loopback connection to
`fromLoopback()` once it's proxied — including to `/ctf-admin.html` and `/api/ctf-admin/*`, which
are gated on exactly that check. The Caddyfile blocks both paths at the proxy layer so they never
reach Node from the outside; use an SSH tunnel to reach the panel instead:
`ssh -L 3000:127.0.0.1:3000 user@your-host`, then browse
`http://localhost:3000/ctf-admin.html` on your own machine. This applies to **any** same-host
reverse proxy or tunnel (Caddy, nginx, Cloudflare Tunnel) — not just this Caddy config.

Full step-by-step runbook, VPS sizing/provider comparison, backups, and a security checklist: see
**Part III** of [`docs/SOLSTICE_CASE_FILE.pdf`](docs/SOLSTICE_CASE_FILE.pdf).

### Render, Railway, Fly.io (managed platform — less ops, some trade-offs)

These run your code as a normal persistent process, unlike Vercel (see below) — architecturally
compatible with this app as-is. On **Render** specifically: create a **Web Service** (not a Static
Site) from this repo, start command `npm run render-start` (runs
[`deploy/render-start.sh`](deploy/render-start.sh), which seeds only on first boot, never on a
redeploy that already has data), Node version pinned via the `engines` field in `package.json`
(22.5+, for `node:sqlite`).

Two things you must configure, or it breaks:
- **Attach a persistent disk** mounted at `data/` — otherwise the database resets on every
  redeploy (Render's default filesystem is ephemeral).
- **The admin panel will 404 for everyone, including you.** Render's proxy terminates off-host,
  so `fromLoopback()` never sees a real loopback connection — this fails safely closed rather than
  exposed (unlike the VPS/Caddy path above, there's no extra config needed to keep it safe, but
  also no way to reach it from the browser). Reset the database from Render's shell/console
  instead: `node src/seed/seed.js`.

Railway and Fly.io follow the same shape (persistent process + volume + off-host proxy) with their
own equivalent setup steps.

**Skip Vercel.** It runs your code as short-lived serverless functions with an ephemeral,
per-invocation filesystem — incompatible with this app's design, which holds login sessions in an
in-memory `Map` inside one long-running process and persists PeopleHub's data to a single SQLite
file opened once at startup. Neither survives a serverless model; there's no config flag that
fixes this, it would need a full rewrite of session and storage handling (external session store +
external database).

### Docker (local / containerized alternative)

```
docker compose up --build -d      # builds, seeds deterministically, runs on :3000
```

Data (`data/db/peoplehub.sqlite`, `data/users.json`, `data/challenges.json`, generated evidence
files) lives in a named volume (`ctf-data`) so it survives container restarts. To force a full
reseed, either use the live `/ctf-admin.html` reset panel (works inside the container too, no
restart needed) or recreate the volume: `docker compose down -v && docker compose up --build -d`.
Note: containerized deployments put the app on a different network namespace than the proxy by
default, which *breaks* `fromLoopback()` the other way — see Part III §3.5 in the PDF above for
the `--network=host` / `docker compose exec` workaround if you containerize on a public host.

Cloudflare Tunnel (`tools/cloudflared.exe`) also still works as a same-host alternative to Caddy —
same admin-panel caveat applies.

---

## For players

Start at `http://localhost:3000`. The outer case (login → Exhibit A → Stage 2 → Exhibit B) leads
to **Stage 3: "Migration Security Investigation"** — Exhibit C — which points you at Solstice
PeopleHub, a real, full HR platform running alongside the case file.

Treat PeopleHub like you'd treat any real internal tool you were asked to assess: sign in, look
around, see what each part of the application actually does, and pay attention when something
behaves in a way you didn't expect. The case file will tell you when your investigation is
complete — it won't tell you how to get there.

Nothing in this repository (other than what the game itself hands you) needs to be read to solve
the case. If you're playing rather than building the thing, you're better off *not* reading past
this point.

---

## For developers / maintainers

*(Spoilers past this line — the intended solve chain, the data model, and how the challenge is
put together.)*

### Architecture

Deliberately dependency-free, matching the outer CTF's existing style: a single vanilla Node
`http` server (`src/server.js`), `node:sqlite` for persistence, hand-written multi-page HTML/CSS/JS
on the frontend (no build step, nothing to `npm install`). See [`src/server.js`](src/server.js)
header comments for the outer game; PeopleHub lives entirely under `src/lib/peoplehub/` (backend)
and `public/peoplehub/` (frontend). Code lives under `src/`, generated/seeded data under `data/`,
static frontend assets under `public/` — see [§ Repository layout](#repository-layout) below.

```
src/
  server.js              outer game (~1000 lines) + PeopleHub mount points
  lib/
    normalize.js, forensics.js,    outer game helpers (untouched)
    hrdb.js, xxe.js                outer game's Stage-4 XXE lab (untouched, still live)
    peoplehub/
      db.js              persistent sqlite connection (opened once, not per-request)
      session.js         PeopleHub's own login session (separate from the outer CTF session)
      rbac.js            role -> capability matrix (9 roles)
      challengeState.js  server-side-only progress tracking, keyed by the OUTER session token
      router.js          dispatcher + auth/dashboard/directory/profile handlers
      routes/*.js        one file per business area (timepay, documents, requests, reports,
                          recruitment, training, comms, audit, admin, importxml, feedback, emergency)
  seed/
    config.js          central data-volume knobs (env-overridable)
    data/               name banks, department/job-title/catalog reference lists
    lib/rng.js          seeded PRNG (mulberry32) + deterministic per-module child streams
    generators/*.js     one per domain, each populates its own tables
    seed.js             orchestrator -- deletes data/db/peoplehub.sqlite and rebuilds it from scratch
    outer-seed.js        orchestrator for the outer game's users.json/challenges.json

public/peoplehub/
  shared/            api.js (fetch wrapper), shell.js (sidebar+header, built from data, not
                      duplicated per page), shell.css (design system), table.js (generic
                      paginated/sortable data table)
  *.html + *.js       one pair per page; each page calls PeopleHubShell.init() then its own
                      PH.get()/PH.post() calls

data/
  db/schema.sql          the full relational schema (25 tables, FKs, indexes)
  db/peoplehub.sqlite      generated -- rebuild with `npm run seed:peoplehub`
  challenge-data/           the XXE lab's synthetic filesystem (real files on disk, read-only)
  evidence/                  outer game's downloadable evidence files
  users.json, challenges.json  generated -- rebuild with `npm run seed`
```

PeopleHub is reachable only once the outer game has `stage3 = true` (`src/server.js` checks this
before ever handing off to `src/lib/peoplehub/router.js`). Past that gate, PeopleHub has its *own*
login (`/peoplehub/login.html` → `/api/peoplehub/auth/login`), its own session cookie (`phsid`,
separate from the outer game's `sid`), and its own role-based access control — all independent of
the outer game's mechanics. `/api/ctf-admin/*` and `/ctf-admin.html` are gated purely on the
connection being loopback (`fromLoopback()` in `src/server.js`), never on game progress, and are
never linked from anywhere in the app.

### Repository layout

| Folder | Contents |
|---|---|
| `src/` | All backend code: the outer game server, PeopleHub backend, and both seed orchestrators. Nothing in here is generated — it's the application itself. |
| `public/` | Static frontend: every page the browser loads, plain HTML/CSS/JS, no build step. |
| `data/` | Everything the seed scripts generate or read at runtime: the sqlite database, the XXE sandbox filesystem, the outer game's evidence files, `users.json`/`challenges.json`. Safe to delete and regenerate; excluded from version control by `.gitignore`. |
| `docs/` | Spoiler documentation: `CHALLENGE_GUIDE.md` and the Word-doc exports. |
| `tools/` | `cloudflared.exe`, for exposing localhost via a Cloudflare Tunnel. |

### Database

`data/db/peoplehub.sqlite`, built once by `node src/seed/seed.js` (not regenerated per-request —
the old hr-portal.html lab rebuilt an in-memory DB on every call, which doesn't scale past a
handful of rows; this one persists). Full schema in [`data/db/schema.sql`](data/db/schema.sql):
`employees`, `departments`, `users`, `roles`, `leave_records`, `payroll`, `performance_reviews`,
`documents` + `document_access`, `hr_requests`, `it_tickets`, `audit_logs`, `security_events`,
`notifications`, `announcements`, `reports` + `report_results`, `job_openings`/`candidates`/
`applications`/`interviews`, `training_courses`/`training_enrollments`, `import_jobs`,
`emergency_access_requests`, `challenge_state`.

Re-seeding is deterministic: same RNG seed in, byte-identical base dataset out, every time (see
`src/seed/lib/rng.js` — a seeded mulberry32 PRNG, not `Math.random`). Increase any data volume via
the `SEED_*` env vars in the table above.

### Roles

| Role | Capabilities |
|---|---|
| Employee | Own profile, own leave, own documents, own requests |
| Manager | + team visibility, emergency-access approval |
| HR Helpdesk | + directory, any profile |
| HR Manager | + payroll, reports, HR administration, recruitment |
| Recruiter | + recruitment only |
| Payroll | + directory, payroll, reports |
| IT Support | + directory, IT tickets |
| Security | + directory, any profile, reports, audit log, security events, emergency-access approval |
| Administrator | everything |

See [`src/lib/peoplehub/rbac.js`](src/lib/peoplehub/rbac.js) for the exact capability matrix, enforced
server-side in every route handler (never trust the sidebar for access control — it just hides
links a role can't use).

### The challenge chain

Nine independent flags in `challenge_state`, keyed by the **outer** session token (so PeopleHub
login/logout cycles don't lose progress): `stage3_login`, `stage3_directory`, `stage3_employee`,
`stage3_report`, `stage3_request`, `stage3_document`, `stage3_xxe`, `stage3_xss`,
`stage3_emergency`. `stage3_complete` is derived (all nine true). None of this is ever exposed to
the browser except as the single `investigation` boolean Exhibit C polls.

**[docs/CHALLENGE_GUIDE.md](docs/CHALLENGE_GUIDE.md)** is the full reference: the task list above with a
verified solve walkthrough and exact payloads for every layer, a tiered hint system for stuck
players, and a deeper architecture writeup (request lifecycle, directory map, schema
relationships, RBAC matrix) than this README goes into.

### Resetting

- **`/ctf-admin.html`** (loopback only) — a small dashboard: per-session flag grid, and three
  reset actions (Reset Progress, Reset PeopleHub Sessions, Reset Database). Reset Database closes
  the live `sqlite` handle, re-runs `src/seed/seed.js` as a child process, and reopens on next
  query — no server restart needed, takes ~30s.
- **`npm run seed:peoplehub`** — same full reseed from the command line. Stop the server first
  on Windows (SQLite file locking; the live `/ctf-admin.html` reset button doesn't have this
  problem, since it closes its own handle first).
- **`npm run seed`** — reseeds the *outer* game's `users.json`/`challenges.json`, unrelated to
  PeopleHub.

### Extending it

New business page: add a route handler in `src/lib/peoplehub/routes/`, wire it into
`src/lib/peoplehub/router.js`'s dispatcher, add a page under `public/peoplehub/` using the existing
`shell.js`/`table.js`/`api.js` pattern (see any existing page for the shape), and add a nav entry
in `shell.js`'s `NAV` array if it should be reachable from the sidebar.

New seeded data: add a generator in `src/seed/generators/`, call it from `src/seed/seed.js` in
dependency order (after `employees`, since almost everything FKs to it), and add its table to
`data/db/schema.sql`.
