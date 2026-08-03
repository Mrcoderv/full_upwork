# Changelog — Mindful Learning Platform

**Comparison:** `revert-14-b` (baseline) → `feat/robustness&security&stability`
**Generated:** 2026-08-03 · verified against the actual branch diff and a live test run on the branch tip

---

## 1. Executive summary

This change set takes the platform from an analytics-only milestone to a fully production-hardened application. Milestone 1 delivered an admin-only Analytics Dashboard (revenue, forecasts, student reports, grade distribution, popular courses, dropout analytics) backed by seven JWT-protected, role-checked API endpoints, and stabilised the test infrastructure (mongodb-memory-server, Docker/CI fixes). Subsequent sessions layered on baseline runnability (environment validation, one-click launch script), runtime robustness (health endpoints, graceful shutdown, centralised error handling), security hardening (JWT secret validation, mass-assignment and ReDoS fixes, authentication on previously open routes, CORS/CSP/mongo-injection defences, error sanitisation), centralised auth-cookie management (sameSite strict), query/pagination performance fixes, comprehensive frontend failure handling (API client, toasts, error boundaries, 404 page, offline detection), and a full testing/CI pipeline (ESLint, coverage thresholds, GitHub Actions). The backend test suite grew from 444 to 868 passing tests and the frontend from 83 to 121, with coverage thresholds enforced in CI.

---

## 2. Scope at a glance

| Metric | Value |
|---|---|
| Files changed | 187 |
| Files added | 35 |
| Files modified | 144 |
| Files deleted | 8 |
| Lines added | 15,470 |
| Lines deleted | 19,967 |
| Test progression (backend) | 444 (Milestone 1) → 864 (hardening commit) → **868** (branch tip, live run) |
| Test progression (frontend) | 83 (Milestone 1) → 121 (branch tip, live run) |
| Backend coverage thresholds | statements 78.5 %, branches 65 %, functions 83 %, lines 78.5 % |
| Frontend coverage thresholds | statements 50 %, branches 40 %, functions 50 %, lines 50 % |
| Deleted files | `.github/workflows/vitest.yml`, `backend/.env.development`, `backend/.env.production`, `backend/.eslintrc.js`, `frontend/.env.development`, three `package-lock.json` files (replaced by a single `pnpm-lock.yaml`) |

**Test-count note.** The apparent jump from 444 (Milestone 1) to 817+ (later sessions) is a real, continuous progression, not a discrepancy: each hardening session added integration/unit tests, and the count at the branch tip is 868 backend / 121 frontend (see §5).

---

## 3. Milestone 1 — Analytics Dashboard & Initial Hardening

### 3.1 Analytics feature

**What it does.** The backend exposes seven read-only analytics endpoints under `/api/analytics` (`backend/src/router/analyticsRoutes.js`):

| Endpoint | Report |
|---|---|
| `GET /analytics/filters` | Municipality / course / teacher filter options |
| `GET /analytics/revenue` | Revenue per municipality and per course |
| `GET /analytics/forecast` | Monthly revenue forecast (configurable 1–12 months) |
| `GET /analytics/students` | Enrollments, unique students, active/new/completed/dropout counts, groupable by month, teacher, course or semester |
| `GET /analytics/grades` | Grade distribution overall and per course |
| `GET /analytics/popular-courses` | Enrollment, completion and grading counts per course |
| `GET /analytics/dropouts` | Dropout rates by month and by course |

The frontend dashboard (`frontend/src/views/Admin/AnalyticsDashboard.vue`) is built with Vuetify components (`v-tabs`, `v-window`, `v-table`, `v-card`, `v-alert`, `v-select`, `v-btn`) plus Chart.js via `vue-chartjs` (bar, line and doughnut charts) and `@vuepic/vue-datepicker`. It supports a shared filter bar (date range, municipality, course, teacher), per-tab loading/error states, and CSV/PDF export for every report. `chart.js`, `date-fns` and `vue-chartjs` were added as frontend dependencies to support it.

**Who can access it.** Every analytics route is guarded by two middlewares: `isAuthenticated` (JWT verification from the httpOnly cookie) and `can("analytics:read")` from `backend/src/middleware/authorization.js`. The permission is granted to the `admin` and `systemadmin` roles in `backend/src/config/roles.js`; the `can()` middleware additionally allows admins as a superuser fallback.

### 3.2 Security enforcement introduced alongside it

- The analytics report handlers share a single error path that returns a generic `Failed to generate report` message on failure (no internal detail leakage).
- The forecast aggregation in `analyticsService.js` was tightened to exclude records with a null `gradeDate`.
- `backend/src/router/analyticsRoutes.js` wraps every handler with `asyncHandler` so rejected promises reach the central error middleware instead of crashing the process.

### 3.3 Test-infrastructure and build fixes

| Fix | Before | After |
|---|---|---|
| Test database | Tests depended on an external MongoDB instance, causing `beforeEach`/`afterEach` timeout flakiness | `mongodb-memory-server` (v11.2.0) dev dependency; `backend/tests/helpers/mongoTest.js` boots an in-memory instance per test run (`MongoMemoryServer.create()` with a 60 s startup timeout) |
| Frontend test mock | `ExcelUpload.test.js` imported `@/api/client.js` without stubbing its interceptors, breaking the module | `vi.mock('@/api/client.js')` now stubs `get/post/put/delete/patch` plus `interceptors.request/response` |
| Docker `test-base` stage | `npm ci` failed on a `package-lock.json` mismatch | Switched to `npm install` so the stage builds cleanly (later superseded by the pnpm migration — see §4.8) |
| `docker-compose.yml` | App container mapped port `5001` | Mapped `5010` to match the backend's default port |

**Claimed results at the time** (commit `302be38`): 444/444 backend tests, 83/83 frontend tests, and a clean Docker build through `test-base`.

---

## 4. Subsequent hardening — Changes by category

### 4.1 Baseline runnability

**What changed.**
- Tracked `.env.development` / `.env.production` files were removed from version control and replaced with `backend/.env.example` documenting required and optional variables.
- `backend/index.js` now validates the environment at startup (non-test): `MONGODB_URI` and `JWT_SECRET` are required, and startup aborts with a clear message if missing or if the secret is weak.
- `launch.sh` (new) provides a one-click local launch: auto-generates a JWT secret when a placeholder is present, starts MongoDB (native binary or Docker fallback), installs dependencies with pnpm, starts backend and frontend with health checks, and cleans up on exit.
- `backend/scripts/seedAndDrop.js` (new) drops and re-seeds programs, courses and course packages from the Excel seed data — the documented workflow for populating a fresh database.

**Before → after.** *Before:* first-run setup required manual env files, a pre-existing database and a hardcoded secret. *After:* `launch.sh` brings the full stack up and the server refuses to start with missing or weak secrets.

### 4.2 Runtime robustness

| Change | Location | Behavior |
|---|---|---|
| Liveness endpoint | `backend/index.js` | `GET /health/live` → `200 { status: "ok" }` |
| Readiness endpoint | `backend/index.js` | `GET /health/ready` → `200` when the DB is connected, `503` otherwise (also reports "connecting"/"disconnected") |
| Combined health + metrics | `backend/index.js` | `GET /health` and `GET /metrics` expose DB state, uptime, memory and error statistics |
| Graceful shutdown | `backend/index.js` | On `SIGTERM`/`SIGINT`: stops accepting requests, closes the HTTP server (10 s force-exit guard), closes the DB connection, logs final metrics |
| Crash handlers | `backend/index.js` | `uncaughtException` / `unhandledRejection` handlers log fatally and shut down cleanly |
| 404 handling | `backend/index.js` | Any unmatched route returns `404 { success:false, error:{ message:"Route not found" } }` |
| Request timeout | `backend/src/middleware/security.js` | 30 s per-request timeout mitigates slowloris/hung connections |
| Structured logging | `backend/src/utils/logger.js` | Console/winston replaced by **pino** — silent in tests, pretty in dev, JSON file transport (error.log + combined.log) in production; all `console.log/console.error` calls migrated to structured loggers |

### 4.3 Security hardening

**Authentication & JWT.**
- Removed the hardcoded `JWT_SECRET = "test-secret"` fallback in `authController.js` (production could previously run with a weak, known secret).
- Startup rejects secrets shorter than 32 characters or matching a known-weak blocklist (`test-secret`, `jwt_mindful`, `secret`, `changeme`, `password`, `default`).
- `/uploads/*` static files are now served only after JWT verification from the auth cookie (`backend/index.js`).

**Mass-assignment & input validation.**
- `authController.register` whitelists the `role` field (`["admin","user","moderator"]`, default `"user"`) so a caller can no longer set arbitrary roles. Four further routes were hardened against mass assignment (`studentRoutes`, `examRoutes`, `searchRoutes`, `actionPlanRoutes`).
- A lightweight schema validator (`backend/src/middleware/validation.js` — `validate()` and `validateId()`) plus email/password/ObjectId validators and an HTML/protocol-stripping sanitizer (`security.js` → `inputValidator`) were applied across the router layer (e.g. register is now `authRateLimiter + validate(registerSchema)`).

**ReDoS prevention.**
- New `backend/src/utils/escapeRegExp.js` escapes all regex metacharacters in user-supplied search input; `searchRoutes.js` now uses it for every `$regex` and in-memory pattern. Four previously vulnerable patterns were fixed (16 dedicated tests).

**Authentication on previously open routes.** Several endpoints were reachable without any auth on the baseline; all are now protected (files and specific routes):

| Route | Baseline | Now |
|---|---|---|
| `POST /api/student` (create) | Open | `authenticateUser` + staff-role check + schema validation |
| `GET /api/students` (list) | Auth only, no role check | `authenticateUser` + staff-role check |
| `POST /api/upload/:studentId`, `GET /api/upload/:studentId`, `GET /api/upload/download/:fileId`, `DELETE /api/upload/:fileId`, `GET /api/upload/all/apl` | Open | `authenticateUser` + student/file access checks (+ upload rate limiter on POST) |
| `GET /api/documents/:id` | Open | `authenticateUser` + student ownership check |
| `PUT /api/notifications/:id/resolve`, `PUT /api/notifications/resolve/:studentId` | Open | `authenticateUser` (+ staff-role check) |
| `GET /api/stats/courses-per-month` | Open | `authenticateUser` |

Grade, meeting and exam routes were likewise brought under `authenticateUser`/role checks.

**Headers, CORS & injection.**
- Helmet CSP tightened: `default-src 'self'`, `frame-src 'none'`, `object-src 'none'`, `upgradeInsecureRequests`; HSTS with preload; `noSniff`; strict referrer policy.
- CORS rejects requests with no `Origin` header in production (blocks no-origin CSRF tricks; allowed in non-production), enforces an allow-list from `ALLOWED_ORIGINS`, and uses `credentials: true`.
- Custom `mongoSanitize` middleware recursively strips keys starting with `$` or containing `.` from `body`/`query`/`params` — blocks classic NoSQL operator injection without a third-party dependency.
- `securityAudit` middleware rejects bodies/URLs matching XSS and SQL/NoSQL injection patterns.
- Rate limiting via `express-rate-limit`: general API limiter (1000 req / 15 min per IP), API-wide limiter (60 req / min), login limiter (5 per 15 min), upload limiter (10 per hour); admins are exempt; thresholds are lowered in test mode.

**Error sanitisation.**
- Production 500 responses return a generic message (stack traces only in development).
- Document/upload 500 responses no longer echo raw `err.message` (prevented internal path/DB detail leakage).
- Request logging replaced `req.body` with `Object.keys(req.body)` to avoid logging PII.
- Document download filenames are sanitised (path-traversal prevention) and capped at 100 characters.

### 4.4 Cookie management

**What changed.** New module `backend/src/config/cookies.js` is the single source of truth for the auth cookie: `AUTH_COOKIE_NAME` (`"token"`), `setAuthCookie()` and `clearAuthCookie()` enforce identical options everywhere — `httpOnly: true`, `secure` in production, `sameSite: "strict"`, `path: "/"`, 7-day expiry.

**Before → after.** *Before:* login set the cookie inline with `sameSite: "lax"` while logout cleared it with `sameSite: "strict"` — a lax/strict mismatch that weakened CSRF protection; cookie name and options were duplicated across `authController.js`, `index.js`, `security.js` and `authRoutes.js`. *After:* all set/clear paths and all `req.cookies` reads use the constant and helpers, with `sameSite` unified to `"strict"` (11 dedicated tests).

### 4.5 Performance fixes

| Change | Location | Before → after |
|---|---|---|
| Student listing pagination | `studentRoutes.js` | Unbounded query → `page`/`limit` (default 500) with `skip`, plus `X-Total-Pages` / `X-Current-Page` response headers; per-route cap (500) enforced explicitly |
| Search pagination | `searchRoutes.js` | Full result set → `page`/`limit` (default 50) with `X-Total-Pages`; per-route cap (50) enforced explicitly |
| Search query batching | `searchRoutes.js` | Sequential awaits → `Promise.all` for parallel student/user lookups; `populate()` restricted to needed fields |
| Connection pool & indexes | `backend/index.js`, `performance.js` | Pool sized from `MAX_CONCURRENT_REQUESTS`; index creation on startup |
| Forecast correctness | `analyticsService.js` | Null `gradeDate` records excluded from the revenue forecast pipeline |

### 4.6 Frontend failure handling

| Piece | File | Purpose |
|---|---|---|
| Centralised API client | `frontend/src/api/client.js` | Single axios instance (`/api` base, `withCredentials`, 30 s timeout). `normalizeError()` maps failures to user-safe Swedish messages (timeout/network/HTTP); 401 responses trigger store `LOGOUT` and redirect to `/login`; `cancelableRequest()` supports abort |
| Toast notifications | `ToastNotification.vue` + `useToast.js` | App-wide snackbar for success/error/warning/info surfaced through the Vuex store |
| Error boundary | `ErrorBoundary.vue` | Catches render errors via `onErrorCaptured` and shows a recoverable alert with a "back to home" action |
| 404 page | `NotFound.vue` + `router.js` | Catch-all route `/:pathMatch(.*)*` renders a styled 404; `router.onError` auto-reloads on failed dynamic chunk loads |
| Offline detection | `useNetworkStatus.js` + `App.vue` | Online/offline banner at the top of the app when the connection drops |
| Error message map | `utils/errorMessages.js` | Centralised Swedish error copy (`getUserMessage()`) |
| Global Vue handler | `main.js` | `app.config.errorHandler` logs unhandled Vue errors instead of silently failing |

Many admin/teacher views were migrated off scattered axios calls and raw error handling onto the shared client/toasts (e.g. `ExcelUpload.vue`, `CourseOverview.vue`, `AddStudent/AddTeacher`, grade and exam forms).

### 4.7 Testing & CI

**GitHub Actions.** New `.github/workflows/ci.yml` (pnpm-based) replaces the old `vitest.yml`: a `lint` job (ESLint, backend max-warnings 50 / frontend 770), a `test` job (backend and frontend Vitest), and a `docker` job that builds the `cicd` target and runs the suite inside the container. Flakiness fixes along the way: bcrypt test timeout increase (667feb8), flaky-test resolution (2e8f405), `.gitignore` test skip when the file is absent (78cb43e), and CI/Dockerfile corrections (674beea, 9499b36).

**Linting.** `backend/.eslintrc.cjs` and `frontend/eslint.config.js` (eslint-plugin-vue flat config) were added; `make format` / `make lint` run them across both packages.

**Coverage thresholds.** Backend `vitest.config.js` enforces statements 78.5 / branches 65 / functions 83 / lines 78.5; frontend enforces 50 / 40 / 50 / 50. The measured frontend coverage on the branch tip exceeds all thresholds.

**New tests (selection).**
- Integration: `healthAndSecurity.test.js` (health endpoints, security middleware), `studentRoutesAuth.test.js` (auth/RBAC on student routes), expanded `uploadRoutes.test.js`, `statsRoutes.test.js`, `notificationRoutes.test.js`, `userRoutes.test.js`.
- Unit: `securityHardening.test.js`, `escapeRegExp.test.js`, `cookies.test.js`, `startup.test.js`, error-handler suite (generic production errors, logger integration), `mongoTest.test.js`, plus frontend `client.test.js`, `ToastNotification.test.js`, `useNetworkStatus.test.js`, `useToast.test.js`, `NotFound.test.js`.

**E2E scaffolding.** A Playwright setup was added under `e2e/` (`verification.spec.js`, `playwright.config.js`) providing role-based login flows and console/network-error assertion smoke tests against a live stack.

### 4.8 Docker & deployment

- **pnpm migration.** The three `package-lock.json` files were replaced by a single workspace `pnpm-lock.yaml` (`pnpm-workspace.yaml` declares root + `backend/` + `frontend/`). CI, Docker and the Makefile use `pnpm install --frozen-lockfile`. The Milestone 1 `npm ci → npm install` Docker fix was superseded by this migration.
- **Multi-stage Dockerfile.** `deps` (all deps with a BuildKit pnpm-store cache mount), `test-base` (adds `make` and pre-caches the mongodb-memory-server binary so tests don't time out in Docker), `cicd` (source + tests, used by `make citest`), `build` (frontend production build), `dev` (non-root user, healthcheck, port 5010), `production` (non-root, `pnpm prune --prod`, healthcheck).
- **docker-compose.** Mongo host port moved to `27018` (avoids clashing with a locally running Mongo on `27017`); app on `5010`; backend/frontend bind-mounts removed in favour of image contents; the app service now ships an `environment:` block (`MONGODB_URI`, `JWT_SECRET` with a dev-insecure fallback, `CLIENT_URL`, `NODE_ENV`, `PORT`) so `make dev` boots without operator-supplied env.
- **Expanded `.dockerignore`** excludes `node_modules`, `.env*`, coverage/dist and E2E artifacts.
- **`launch.sh` + `DEPLOYMENT.md` + new root `README.md`** document local and production deployment, environment variables and PM2-based deployment.

---

## 5. Test evidence

Progression is shown as a timeline because the suite grew substantially between Milestone 1 and the final state:

| Point | Backend | Frontend | Notes |
|---|---|---|---|
| Milestone 1 tip (`302be38`) | 444 / 444 | 83 / 83 | Claimed in commit message; Docker built clean through `test-base` |
| Hardening commit (`285c77d`) | 864 across 53 files | 121 across 8 files | Recorded in `backend/README.md` and `SECURITY-HARDENING.md` |
| Branch tip (`f148561`) — live run | 868 across 53 files | 121 across 8 files | Verified on 2026-08-03 against the actual branch |

The delta from 864 → 866 is the additional coverage added by the final fixup commits (centralised-cookie tests, CORS no-origin tests); 866 → **868** is the review follow-up (§8) adding two document-upload blocklist tests. Both steps are consistent with the upward progression.

Live run details (branch tip):
- Backend: `NODE_ENV=test npx vitest run` → **868 tests passing** (a small number of environment-dependent tests — e.g. the `.gitignore`-presence test — skip when their precondition is absent; on a clean run all 868 pass). A rare first-run mongodb-memory-server startup race was observed once and cleared on rerun (see §6).
- Frontend: `NODE_ENV=test npx vitest run` → **121 tests passing**, coverage statements 78.45 %, branches 69.54 %, functions 68 %, lines 79.31 % — all above the configured thresholds.
- CI runs the same suites plus the containerised `make citest` build.

---

## 6. Known accepted risks / deferred items

These items are intentionally not resolved and should not be read as fully fixed:

1. **Remaining supply-chain vulnerabilities (dev-only).** `pnpm audit` still reports two moderate findings that have no non-breaking fix: `vue-template-compiler` (moderate XSS, transitive via the `documentation` dev dependency — a Vue 2 component with no upstream fix without replacing the doc tool) and `showdown` (moderate ReDoS, transitive via `clean-jsdoc-theme`). Both were explicitly pinned via overrides in `pnpm-workspace.yaml`; the previously critical (vitest) and high (brace-expansion, uuid) findings were resolved.
2. **Header-based role trust model.** Authorisation is stateless: the role/permission claims live inside the signed JWT (delivered via the httpOnly cookie, with an `Authorization`-header fallback in `authenticateUser`), and route-level checks such as `req.user.role === "teacher"` trust those claims rather than performing a per-request server-side session/DB lookup. This is a deliberate trade-off of the stateless-JWT design and is mitigated by secret validation and strict cookie flags, but it remains a design-level acceptance rather than a resolved item.
3. **Docker Desktop "mounts denied" on `/media/...` paths (local dev quirk).** Docker Desktop file-sharing does not permit bind-mounting host paths under `/media/...` on the maintainer's machine. This is a Docker preference limitation, not a code defect; `make citest` was changed to build the `cicd` image instead of relying on volume mounts to work around it.
4. **mongodb-memory-server startup race.** An intermittent first-run flake (invalid JSON parsed from the in-memory `mongod` log line) has been observed once during local runs; it clears on rerun and has not been observed inside Docker (the binary is pre-cached in `test-base`). Treated as environment flakiness, not a code defect.

---

## 7. Appendix — full file change list

Raw `git diff revert-14-b...feat/robustness&security&stability --stat` output:

```
 .dockerignore                                      |   51 +-
 .github/workflows/ci.yml                           |   57 +
 .github/workflows/vitest.yml                       |   73 -
 .gitignore                                         |    9 +
 AGENTS.md                                          |    1 +
 DEPLOYMENT.md                                      |   89 +
 Dockerfile                                         |   93 +-
 Makefile                                           |   26 +-
 README.md                                          |  165 +
 SECURITY-HARDENING.md                              |  132 +
 backend/.env.development                           |    6 -
 backend/.env.example                               |   13 +
 backend/.env.production                            |    6 -
 backend/.eslintrc.cjs                              |   11 +
 backend/.eslintrc.js                               |    0
 backend/README.md                                  |   10 +-
 backend/index.js                                   |  228 +-
 backend/package-lock.json                          | 4240 ----------
 backend/package.json                               |   24 +-
 backend/scripts/seedAndDrop.js                     |  122 +
 backend/src/config/cookies.js                      |   21 +
 backend/src/controllers/analyticsController.js     |    5 +-
 backend/src/controllers/authController.js          |   63 +-
 .../src/controllers/courseMatchingController.js    |  389 +-
 backend/src/controllers/gradeReportController.js   |    3 +-
 backend/src/controllers/notificationController.js  |   15 +-
 backend/src/controllers/studentController.js       |   95 +-
 .../src/controllers/studentDetailsController.js    |  144 +-
 backend/src/middleware/security.js                 |   46 +-
 backend/src/middleware/validation.js               |   24 +-
 backend/src/models/CourseInstance.js               |   15 +-
 backend/src/models/StudentEnrollment.js            |    3 +-
 backend/src/router/actionPlanRoutes.js             |   13 +-
 backend/src/router/analyticsRoutes.js              |   19 +-
 backend/src/router/auditRoutes.js                  |    3 +-
 backend/src/router/authRoutes.js                   |   19 +-
 backend/src/router/courseMatchingRoutes.js         |   40 +-
 backend/src/router/coursePackageRoutes.js          |   22 +-
 backend/src/router/courseRoutes.js                 |   36 +-
 backend/src/router/documentRoutes.js               |  101 +-
 backend/src/router/examRoutes.js                   |  391 +-
 backend/src/router/gradeReportRoutes.js            |    3 +-
 backend/src/router/gradeRoutes.js                  |   87 +-
 backend/src/router/meetingroutes.js                |   30 +-
 backend/src/router/notificationRoutes.js           |   59 +-
 backend/src/router/programRoutes.js                |   10 +-
 backend/src/router/router.js                       |    3 +-
 backend/src/router/searchRoutes.js                 |  263 +-
 backend/src/router/statsRoutes.js                  |    6 +-
 backend/src/router/studentDetailsRoutes.js         |   19 +-
 backend/src/router/studentRoutes.js                |  554 +-
 backend/src/router/taskRoutes.js                   |   21 +-
 backend/src/router/teacherRoutes.js                |   25 +-
 backend/src/router/uploadRoutes.js                 |  241 +-
 backend/src/router/userRoutes.js                   |   29 +-
 backend/src/services/analyticsService.js           |    2 +-
 backend/src/utils/calendarEventSync.js             |   33 +-
 backend/src/utils/courseMatchingService.js         |  321 +-
 backend/src/utils/createFailingNotification.js     |    3 +-
 backend/src/utils/errorHandler.js                  |   48 +-
 backend/src/utils/escapeRegExp.js                  |    3 +
 backend/src/utils/integratedEducationParser.js     |   25 +-
 backend/src/utils/logger.js                        |   63 +
 backend/src/utils/parseContactPdf.js               |   31 +-
 backend/src/utils/parseStudentExcel.js             |   16 +-
 backend/src/utils/performance.js                   |    2 +-
 backend/src/utils/slutprovDateCalculator.js        |   17 +-
 backend/src/utils/teacherService.js                |   12 +-
 backend/tests/helpers/mongoTest.js                 |   33 +-
 backend/tests/integration/api.test.js              |   23 +-
 .../tests/integration/coursePackageRoutes.test.js  |   14 +-
 backend/tests/integration/courseRoutes.test.js     |    2 +-
 backend/tests/integration/documentRoutes.test.js   |    7 +-
 .../tests/integration/healthAndSecurity.test.js    |  130 +
 .../tests/integration/notificationRoutes.test.js   |    4 +
 backend/tests/integration/programRoutes.test.js    |    9 +-
 backend/tests/integration/statsRoutes.test.js      |   19 +
 .../tests/integration/studentRoutesAuth.test.js    |  223 +
 backend/tests/integration/teacherRoutes.test.js    |    6 +-
 backend/tests/integration/uploadRoutes.test.js     |  200 +-
 backend/tests/integration/userRoutes.test.js       |   18 +-
 backend/tests/setup.js                             |    8 +
 backend/tests/unit/authController.test.js          |   23 +-
 backend/tests/unit/cookies.test.js                 |  100 +
 backend/tests/unit/courseInstance.test.js          |    2 -
 .../tests/unit/courseMatchingController.test.js    |   11 +-
 backend/tests/unit/courseMatchingService.test.js   |   28 +-
 backend/tests/unit/errorHandler.test.js            |   50 +-
 .../unit/errorHandlerConsoleProduction.test.js     |   59 +-
 backend/tests/unit/errorHandlerLogger.test.js      |   55 +-
 backend/tests/unit/escapeRegExp.test.js            |   74 +
 backend/tests/unit/gradeRoutes.test.js             |   77 +-
 backend/tests/unit/index.test.js                   |   20 +-
 backend/tests/unit/mongoTest.test.js               |   42 +-
 backend/tests/unit/notificationController.test.js  |   30 +-
 backend/tests/unit/performance.test.js             |    7 +-
 backend/tests/unit/security.test.js                |   35 +-
 backend/tests/unit/securityHardening.test.js       |  254 +
 backend/tests/unit/startup.test.js                 |   10 +
 backend/tests/unit/studentController.test.js       |   18 +-
 backend/tests/unit/studentDetailsController.test.js|   20 +-
 backend/tests/unit/studentRoutes.test.js           |   83 +-
 backend/tests/unit/teacherService.test.js          |   29 +-
 backend/vitest.config.js                           |   13 +-
 docker-compose.yml                                 |    6 +-
 e2e/package-lock.json                              |   78 +
 e2e/package.json                                   |   14 +
 e2e/playwright.config.js                           |   41 +
 e2e/tests/verification.spec.js                     |  225 +
 frontend/.env.development                          |    3 -
 frontend/eslint.config.js                          |   29 +
 frontend/package-lock.json                         | 5128 -----------
 frontend/package.json                              |   13 +-
 frontend/src/App.vue                               |   26 +-
 frontend/src/api/client.js                         |  111 +
 frontend/src/components/APLBoard.vue               |   46 +-
 frontend/src/components/APLFileArchive.vue         |   23 +-
 frontend/src/components/ErrorBoundary.vue          |   22 +
 frontend/src/components/FileUploaderDownloader.vue |   28 +-
 frontend/src/components/NavBar.vue                 |   27 +-
 frontend/src/components/Teacher/CourseOverview.vue |  249 +-
 .../components/Teacher/StudentEnrollmentForm.vue   |   19 +-
 frontend/src/components/ToastNotification.vue      |   27 +
 frontend/src/components/notificationBox.vue        |    9 +-
 frontend/src/composables/useNetworkStatus.js       |   25 +
 frontend/src/composables/useToast.js               |   30 +
 frontend/src/main.js                               |   21 +-
 frontend/src/router/router.js                      |   16 +
 frontend/src/store/store.js                        |   59 +-
 frontend/src/utils/errorMessages.js                |   15 +
 frontend/src/views/APLView.vue                     |    8 +-
 frontend/src/views/Admin/AddStudent.vue            |   29 +-
 frontend/src/views/Admin/AddTeacher.vue            |   31 +-
 frontend/src/views/Admin/AddUser.vue               |   17 +-
 frontend/src/views/Admin/AnalyticsDashboard.vue    |   40 +-
 frontend/src/views/Admin/AuditLogView.vue          |    8 +-
 frontend/src/views/Admin/CourseInstances.vue       |   51 +-
 frontend/src/views/Admin/CourseMatching.vue        |   49 +-
 frontend/src/views/Admin/CoursesStats.vue          |    9 +-
 frontend/src/views/Admin/EarningsOverview.vue      |    7 +-
 frontend/src/views/Admin/EditStudent.vue           |   31 +-
 frontend/src/views/Admin/EducationDetails.vue      |    6 +-
 frontend/src/views/Admin/EducationEditor.vue       |   24 +-
 frontend/src/views/Admin/ExcelUpload.vue           |   51 +-
 frontend/src/views/Admin/ManualAddStudent.vue      |   30 +-
 frontend/src/views/Admin/ProgramsAndCourses.vue    |   14 +-
 frontend/src/views/Admin/ProgramsAndPackages.vue   |    9 +-
 frontend/src/views/Admin/SearchResultDetails.vue   |   12 +-
 frontend/src/views/Admin/SearchTabs/AccountTab.vue |   49 +-
 .../views/Admin/SearchTabs/ActionPlanQuestions.vue |   23 +-
 .../views/Admin/SearchTabs/ChangeActionPlan.vue    |   13 +-
 .../src/views/Admin/SearchTabs/DocumentSection.vue |   21 +-
 frontend/src/views/Admin/SearchTabs/StudyPlan.vue  |   10 +-
 frontend/src/views/Admin/StudentEnrollments.vue    |   12 +-
 frontend/src/views/Admin/TeacherManagement.vue     |   55 +-
 frontend/src/views/Admin/gradeStudent.vue          |   22 +-
 .../views/Appointments/RoleBasedAppointments.vue   |   13 +-
 frontend/src/views/Auth/Register.vue               |   10 +-
 frontend/src/views/Auth/ResetPassword.vue          |    8 +-
 frontend/src/views/Exams/ExamAdminTable.vue        |   23 +-
 frontend/src/views/Exams/ExamForm.vue              |   21 +-
 frontend/src/views/Modals/AddEventModal.vue        |  599 +-
 frontend/src/views/Modals/AddMeetingModal.vue      |  382 +-
 frontend/src/views/Modals/EventModal.vue           |   53 +-
 frontend/src/views/Modals/MeetingModal.vue         |   11 +-
 frontend/src/views/NotFound.vue                    |   16 +
 frontend/src/views/Provningar/ProvningarCrud.vue   |   53 +-
 frontend/src/views/Student/StudentDetails.vue      |   14 +-
 frontend/src/views/Student/tabs/GeneralTab.vue     |   38 +-
 frontend/src/views/Student/tabs/PermissionsTab.vue |   18 +-
 frontend/src/views/Student/tabs/StudyPlanTab.vue   |   24 +-
 frontend/src/views/Teacher/BetygSattning.vue       |   54 +-
 frontend/src/views/Teacher/ExamCalendar.vue        |   13 +-
 frontend/tests/unit/EducationEditor.test.js        |  135 +-
 frontend/tests/unit/ExcelUpload.test.js            |   90 +-
 frontend/tests/unit/api/client.test.js             |  149 +
 .../unit/components/ToastNotification.test.js      |   80 +
 .../unit/composables/useNetworkStatus.test.js      |   93 +
 frontend/tests/unit/composables/useToast.test.js   |  107 +
 frontend/tests/unit/store.test.js                  |   18 +-
 frontend/tests/unit/views/NotFound.test.js         |   51 +
 frontend/vitest.config.js                          |    6 +
 launch.sh                                          |  158 +
 package-lock.json                                  | 6851 ---------------
 package.json                                       |    4 +-
 pnpm-lock.yaml                                     | 8926 ++++++++++++++++++++
 pnpm-workspace.yaml                                |   13 +
 187 files changed, 15470 insertions(+), 19967 deletions(-)
```

---

## 8. Review follow-up — ten discrepancies found and fixed (2026-08-03)

A cross-check of the claims above against the actual code surfaced ten items. All were resolved; `NEW-FEATURES.md` (Verification notes) carries the same table.

| # | Finding | Resolution |
|---|---|---|
| 1 | `docker-compose.yml` had no env for the app service, so `make dev` exited on the mandatory-env check (§4.8) | Added an `environment:` block (`MONGODB_URI`, `JWT_SECRET` dev fallback, `CLIENT_URL`, `NODE_ENV`, `PORT`); `make dev` boots and `/health/ready` returns DB-connected |
| 2 | `backend/ecosystem.config.cjs` pinned blocklisted `JWT_SECRET: "jwt_mindful"` and a committed plaintext `GOOGLE_PWD` (§4.8 PM2 path) | Both now read from `process.env`; credential removed from git (rotate the Google account password if it ever shipped) |
| 3 | `launch.sh` sentinel mismatched the `.env.example` placeholder (§4.1) | `.env.example` now ships `REPLACE_WITH_GENERATED_SECRET_MIN_32_CHARS`; fresh copies auto-fill |
| 4 | `documentRoutes.js` echoed raw `err.message` on 500 (`:222`) and in upload-validation `details` (§4.3) | Generic 500 message; validation branch returns only field-level messages from `error.errors` |
| 5 | Disk-based document upload had no extension/MIME blocklist (§4.3 upload hardening) | Added `DANGEROUS_EXTENSIONS` + `text/html*`/`application/x-msdownload` rejection via multer `fileFilter`; two new integration tests |
| 6 | `courseDetailRateLimiter` (2000 req/min) defined but never mounted (§4.3 rate limiting) | Mounted on `GET /courses/:courseId` |
| 7 | `winston` still declared in `backend/package.json` though the logger is pino-only (§4.2) | Removed; workspace lockfile regenerated; `pnpm install --frozen-lockfile` passes |
| 8 | `/health`/`/metrics` unauthenticated; `/metrics` cache hard-coded `{ size: 0, keys: [] }` (§4.2) | Cache wired to `cacheManager.getStats()`; endpoints stay unauthenticated by decision (firewalled/VPN only) with the access-control assumption documented in `DEPLOYMENT.md` |
| 9 | Duplicate `SIGINT` handler in `performance.js` (§4.2 graceful shutdown) | Single path: `index.js` owns signals, delegates DB close to `dbOptimizer.shutdown()`; verified with a container `SIGINT` test |
| 10 | `requestOptimizer` 100-cap vs. per-route limits (§4.5) | Per-route caps authoritative: students 500, search 50 — each route clamps explicitly; optimiser's 100 cap stays the shared default elsewhere |

**Post-fix verification:** backend `868/868` tests, frontend `121/121` tests, `make citest` green, `make dev` boots from a clean state, and a live `SIGINT` shuts the container down gracefully.
