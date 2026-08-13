# Mindful Learning

Node/Express + Vue 3 school management system.

## Quick start (fresh clone → running app)

### Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 25+ | `node -v` |
| pnpm | 11+ | `pnpm -v` |
| MongoDB | 6.0+ | `mongod --version` or use Docker |
| Volta (optional) | any | `volta -v` — pins Node/pnpm automatically |

You do **not** need Docker to run the app locally. `launch.sh` detects whatever
MongoDB is already available (see below).

### Option A — One-command launcher: `./launch.sh` (recommended)

```sh
./launch.sh
```

Works **with or without Docker**:

- **No Docker** — uses a MongoDB already running on `127.0.0.1:27017`. If none is
  running but the `mongod` binary is on your PATH, it starts one automatically.
- **Docker** — only if no MongoDB is reachable and no `mongod` binary exists, it
  falls back to starting the `mongo` service from `docker-compose.yml`.

`launch.sh` also copies `backend/.env.example` → `backend/.env.development` if
missing and auto-generates `JWT_SECRET` when the placeholder is still present.

When it finishes:

| Service   | URL                  | Logs            |
|-----------|----------------------|-----------------|
| Frontend  | http://localhost:5173 | `frontend.log`  |
| Backend   | http://localhost:5010 | `backend.log`   |

Press `Ctrl+C` to stop everything.

### Option B — Manual, no Docker

#### 1. Start MongoDB

```sh
mongod --bind_ip_all
```

Keep it running in its own terminal (default port 27017).

#### 2. Install dependencies

```sh
pnpm install
```

#### 3. Configure environment

```sh
cp backend/.env.example backend/.env.development
```

Edit `backend/.env.development` — the only _required_ values are:

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/mindfullearning` |
| `JWT_SECRET` | Secret for signing JWTs (≥ 32 chars) | `openssl rand -base64 48` |

#### 4. Start the app

```sh
# Backend (port 5010)
cd backend && pnpm dev

# Frontend (port 5173, separate terminal)
cd frontend && pnpm dev
```

### Option C — Docker (full stack)

```sh
make dev
```

Starts the backend and MongoDB containers. Open http://localhost:5173.

### Create the initial admin

A fresh database has no admin. Create one with:

```sh
SYSTEM_ADMIN_PASSWORD="<strong-password>" node backend/scripts/createSystemAdmin.js
```

Omitting `SYSTEM_ADMIN_PASSWORD` creates the account with the known default
password `mindful` and forces a password change on first login (see
[Security](#security)).

### Load education data (programs, courses, course packages)

Seed or refresh the education catalog from an Excel workbook. The scripts read
`MONGODB_URI` from `backend/.env.development`:

```sh
cd backend
set -a; source .env.development; set +a
cd scripts
node dropData.js          # wipe Programs, Courses, CoursePackages
node updateEducation.js   # import them from the Excel workbook
```

`updateEducation.js` imports from the workbook path hardcoded at the bottom of
the script (`backend/scripts/updateEducation.js:118`, default `./test.xlsx`), so
run it from `backend/scripts/` — or change that path to point at e.g.
`backend/scripts/EducationData.xlsx`. Run `dropData.js` first to start from a
clean catalog.

## Health checks

| Endpoint | Purpose | Expected (ready) |
|----------|---------|-------------------|
| `GET /health/live` | Liveness — is the process up? | `200 {"status":"ok"}` |
| `GET /health/ready` | Readiness — can it serve traffic? (DB connected) | `200` or `503` |
| `GET /health` | Combined health + diagnostics | `200` or `503` |
| `GET /metrics` | Error stats, DB info, system info | `200` |

Example:

```sh
curl http://localhost:5010/health/live
# {"status":"ok"}

curl http://localhost:5010/health/ready
# {"status":"ok","database":"connected","uptime":42.1}
```

## Studieplan & notifikationer

When a student's study plan changes (course dates or status, e.g. `reviderad`),
the system notifies both sides:

- **Teacher** — a `studyplan_changed` notification addressed to the enrollment's
  `teacherId`, shown in the navbar bell.
- **Student** — the same notification is also addressed to the student's login
  account (matched by email on the `Student` record) via `meta.studentUserId`.
  `GET /notifications` filters these so a student only ever sees their own.

Revision messages include the new course dates, e.g. "Studieplan reviderad för … —
Nya datum: 2025-03-15 – 2025-05-15."

**APL rule:** APL period dates are derived from the student's current
`StudentEnrollment` records in `GET /students` (single source of truth). Stored
legacy `CoursePackage` education entries are deduplicated by package id, so a
study plan revision that moves course end dates is automatically reflected in the
APL board's end date.

**Auto-RÖD (auto-red):** `GET /students` and `GET /student-details/:id` derive an
APL period (earliest start / latest end across `CoursePackage` education
entries) and compute an *effective* `aplStatus`: when 0 days remain and fewer
than `APL_AUTO_RED_WEEKS` (default **3**, env override `APL_AUTO_RED_WEEKS`)
weeks are left until the APL end date, the response reports `aplStatus: "RED"`
with `aplStatusAuto: true` and `aplWeeksRemaining` (whole weeks, ceil). The
stored status and its history are never mutated — auto-RED only overrides the
returned value; a manual status change (with history) still takes precedence.
Frontend surfaces this as an **AUTO** badge on the APL board and an "Auto-röd –
slutar om X veckor" note on the student's APL tab.

## Återkommande elever (re-registrering)

- **Manual create auto-fill:** `POST /student` checks `personalNumber` (and
  email) against existing students. If the student already exists, the submitted
  details are auto-filled into the existing record (the dropout flag is cleared)
  and the new courses are registered — it returns HTTP `200` with
  `alreadyExists: true` instead of creating a duplicate. The manual-add form
  reports this so staff know the record was updated, not re-created.
- **"Lästa kurser" list:** the student's **Studieplan** tab lists completed
  courses (enrollments with status `completed`) and each row has a
  **"Ny antagning"** button that re-enrolls the student in that course
  (`POST /course-matching/process-education`), scheduling it after the last
  course at the current study tempo.

## Nationella prov & betygsskalor

- **NP-poäng (National test points):** `BetygSattning.vue` includes an **NP-poäng** column for national-test courses (Engelska/Svenska/Matematik). Scores are persisted in `StudentEnrollment.nationalTestPoints` and legacy education `npScore`.
- **Annual Grading Scale Administration:** System admins and admins can manage point thresholds (min points → grade A–E) per term (e.g. `HT24`, `VT25`) and subject (Engelska/Svenska/Matematik) via `/admin/betygsskala` (`GradingScaleAdmin.vue`).
- **Grade suggestion:** In `BetygSattning.vue`, teachers entering national test points can click **"Visa förslag"** to request the grade suggestion (`GET /grading-scale/suggest?term=...&subject=...&points=...`) calculated against that term and subject's active scale.

## Testing

```sh
# Run all tests (backend + frontend)
make test

# Backend only
cd backend && pnpm test

# Frontend only
cd frontend && pnpm test
```

Tests use an in-memory MongoDB — no external database required.

## CI/CD

GitHub Actions runs on every push and PR to `main`:

1. **Lint** — ESLint on both backend and frontend
2. **Test** — Full test suite (backend + frontend with coverage)
3. **Docker** — Build and run the complete Docker test suite

See `.github/workflows/ci.yml`.

## Security

The backend enforces security hardening at startup and runtime:

- **JWT_SECRET validation**: Rejects weak or short secrets (< 32 chars) at boot
- **Rate limiting**: API-wide and per-route rate limits (disabled in test mode)
- **CORS**: Configured for production origins; null origin rejected
- **Helmet**: Security headers including CSP, X-Frame-Options, etc.
- **Input validation**: `validateId()` and `validate()` middleware on public routes
- **Mass assignment protection**: Allowlisted fields on user/student/exam updates
- **Error sanitization**: Production 500s return generic messages; internal details logged only
- **Default admin password rotation**: `backend/scripts/createSystemAdmin.js` creates the
  initial `systemadmin` account with the known default password (`mindful`) and sets
  `mustChangePassword: true`. The first login succeeds but the frontend redirects to
  `/change-password` and blocks the rest of the app until the password is changed. To
  skip the forced change, pass your own password: `SYSTEM_ADMIN_PASSWORD="<strong-password>"
  node backend/scripts/createSystemAdmin.js`

See `SECURITY-HARDENING.md` for the full report.

## Docker (full stack)

```sh
make dev       # build + run backend+mongo
make stop      # docker compose down
make citest    # build cicd image + run full test suite inside Docker
```

## Linting / Formatting

```sh
make format          # ESLint autofix (root-level, no config)
make lint            # Lint backend + frontend with project configs
cd backend && pnpm lint       # Backend only
cd frontend && npx eslint src/   # Frontend only
```

## Troubleshooting

### `Required environment variables are not set`

The server validates `MONGODB_URI` and `JWT_SECRET` at startup. Make sure
`backend/.env.development` exists and contains both. Copy from the example:

```sh
cp backend/.env.example backend/.env.development
```

### `ECONNREFUSED` on startup

MongoDB is not running. Start it with `make dev` or ensure `mongod` is up.

### Login fails with "Kunde inte ansluta till servern" and devtools shows a CORS error with status (null)

This usually means the frontend and backend are pointed at different ports,
not a real CORS problem. Check that `VITE_API_URL` matches the backend's
actual `PORT`. The backend logs the port it actually listens on at startup
(`API listening on http://localhost:PORT`), and the frontend logs the API URL
it is about to call on dev startup (`[API] Connecting to: ...`). When the two
disagree, update the wrong side (canonical local dev port: `5010`). In dev the
Vite proxy forwards `/api` to `http://localhost:5010`, so an empty
`VITE_API_URL` in `frontend/.env.development` is correct as long as the backend
runs on `5010`.

### Port 5010 already in use

Another process is on that port. Find and stop it, or change `PORT` in your
`.env.development`.

### `SIGTERM` / `SIGINT` — shutdown hangs

The server has a 10-second shutdown timeout. If it still hangs, check for
unreleased DB cursors or long-running queries.

### Tests fail with `JWT_SECRET`

Tests set their own `JWT_SECRET` automatically — no configuration needed.
If they still fail, ensure `NODE_ENV=test` is not set in your shell
(the test runner sets it).
