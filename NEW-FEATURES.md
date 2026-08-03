# New Features — Mindful Learning Platform

**Branch:** `feat/robustness&security&stability` (vs. baseline `revert-14-b`)
**Scope:** New capabilities introduced by this branch, written up feature by feature. This is a feature document — for the raw diff see `CHANGELOG.md`; for the original Etapp 1/2 product features see `FEATURES.md`.
**Verification:** Every claim below was checked against the branch tip code (2026-08-03). File/line references point at the implementation as it stands.

---

## Product Feature

### 1. Analytics Dashboard

**Description**
An admin-only reporting area that turns the raw enrollment/grade data into seven on-demand reports: revenue by municipality and course, monthly revenue forecasts, student statistics, grade distribution, popular courses and dropout analytics, plus the shared filter options they depend on. A frontend dashboard at `/admin/analytics` renders each report as a chart plus a data table, with CSV and PDF export for every tab.

**Location**
- Backend: `backend/src/router/analyticsRoutes.js:17-23` (7 `GET` endpoints under `/api/analytics`), `backend/src/controllers/analyticsController.js`, `backend/src/services/analyticsService.js`.
- Access control: `isAuthenticated` (`backend/src/middleware/auth.js`) → `can("analytics:read")` (`backend/src/middleware/authorization.js:17`); permission granted to `admin` and `systemadmin` in `backend/src/config/roles.js`, with an additional admin/systemadmin superuser short-circuit in `authorization.js:34-36`.
- Frontend: `frontend/src/views/Admin/AnalyticsDashboard.vue` (route `frontend/src/router/router.js:216-220`, `meta.role: ['admin','systemadmin']`), charts via `vue-chartjs`/`chart.js`, exports via `frontend/src/utils/exportUtils.js` (`exportToCSV`/`exportToPDF`).

**Rules**
- All seven endpoints require a valid JWT and the `analytics:read` permission; teachers/users/students are rejected (403).
- Forecast horizon is clamped to 1–12 months (`analyticsService.js:210`).
- Forecast/revenue pipelines exclude enrollments with a null `gradeDate` (`analyticsService.js:214`).
- Realized revenue = graded enrollments (`grade` not in `[null,""]`); forecasted revenue = ungraded enrollments with status `active`/`enrolled`/`reviderad`, priced at grade "A" as a default (`analyticsService.js:95-177`).
- Student report `groupBy` is restricted to `month|teacher|course|semester`, defaulting to `month` (`analyticsService.js:268-270`).
- Dropout statuses are exactly `dropped`/`suspended` (`analyticsService.js:8`).
- Grade distribution is returned in canonical grade order A–E, F, STRECK, AVBROTT (`analyticsService.js:384`).
- Every handler is wrapped in `asyncHandler` and reports a generic `Failed to generate report` message on failure — no internal detail is leaked to the client (`analyticsController.js:22-30`).

**Risk addressed**
Before this branch there was no aggregated view of revenue, forecasts, grades or dropouts; producing one required manual extraction from raw records, and any consumer had full unfiltered DB exposure. The dashboard closes that with read-only, permission-gated reports, so financial and grade data is now both discoverable and restricted to admin/systemadmin accounts.

**Residual risk / limitations**
The forecast is an estimate — the average of the trailing 3 observed months times municipality pricing — not an accounting figure; the UI explicitly labels it as such. Reports are un-paginated aggregations over the full dataset and can be slow at very large enrollment volumes. Revenue figures depend on the `gradeToRevenue` pricing table being kept in sync with real contracts.

**Advantage / benefit**
School leadership can see realized vs. forecasted income, grade curves and dropout rates per municipality/course/teacher without touching raw data, and can export any report for external reporting — while the generic error path keeps failure detail away from non-admin eyes.

---

## Reliability & Operations

### 2. Health, readiness & metrics endpoints

**Description**
Four unauthenticated endpoints that let orchestrators, load balancers and humans ask "is the process up?" and "can it actually serve traffic?" The key distinction is liveness (process responds) vs. readiness (database connection is live). A combined `/health` and a `/metrics` endpoint additionally expose uptime, memory, DB state and in-memory error statistics.

**Location**
- `backend/index.js:136-138` (`GET /health/live`), `:141-156` (`GET /health/ready`), `:159-170` (`GET /health`), `:173-189` (`GET /metrics`).
- Metrics source: `errorMonitor` in `backend/src/utils/errorHandler.js:47-155`.

**Rules**
- `/health/live` always returns `200 { status: "ok" }` while the process is responsive.
- `/health/ready` returns `200 { status:"ok", database:"connected" }` only when `mongoose.connection.readyState === 1`; otherwise `503` with `database:"connecting"` (readyState 2) or `"disconnected"`.
- `/health` returns `200 { status:"OK" }` when the DB is connected and `503 { status:"DEGRADED" }` otherwise, plus timestamp, uptime, environment, memory usage and error statistics.
- `/metrics` returns error stats (`errorMonitor.getErrorStats()`), a live cache section (`cacheManager.getStats()` — size + keys), database host/name/readyState and system info (node version, platform, memory, uptime).
- All four are mounted before the router, so they respond even while other middleware/routes are slow.

**Risk addressed**
Previously there was no way to distinguish "API process running" from "API running but its database connection has died" — an outage was only discovered when users reported errors, and rolling restarts had no probe to gate on. `/health/ready` lets a supervisor take an instance out of rotation the moment the DB connection drops.

**Residual risk / limitations**
Readiness reflects only the Mongoose connection state, not query latency or overload; a slow-but-connected DB still reports "ready". `/metrics` and `/health` are intentionally unauthenticated and expose the DB host/name and memory figures — they must only be reachable from trusted networks (firewall/VPN), an assumption documented under "Health Endpoints" in `DEPLOYMENT.md`. The `/metrics` cache section is wired to `cacheManager.getStats()` (`index.js:176`), so it reflects real in-process cache state. Output is JSON, not Prometheus format, so standard exporters need an adapter.

**Advantage / benefit**
Ops can detect a dead DB connection via `/health/ready` before users report errors, and Docker/PM2 healthchecks (`Dockerfile:83-84`, `:112-113`) now have a real probe to gate on.

### 3. Graceful shutdown & crash handling

**Description**
The server now reacts deliberately to termination signals and to unrecoverable JS errors instead of dying silently. `SIGTERM`/`SIGINT` trigger a graceful drain — stop accepting requests, close the HTTP server, close the DB connection, log final metrics, exit 0 — while `uncaughtException`/`unhandledRejection` log the failure and exit 1 after closing the DB.

**Location**
- `backend/index.js:250-300`: `shutdown(signal)`, `SIGTERM`/`SIGINT` handlers, `uncaughtException` and `unhandledRejection` handlers.

**Rules**
- On `SIGTERM`/`SIGINT`: `server.close()` waits for in-flight requests to finish, with a 10-second force-exit guard (`setTimeout` → `process.exit(1)`, `unref()`ed) so a hung request cannot block shutdown forever (`index.js:257-261`).
- After the HTTP server closes, the Mongoose connection is closed and final error metrics are logged before `process.exit(0)`.
- `uncaughtException` and `unhandledRejection` log at `fatal`, record the error in `errorMonitor`, close the DB connection and `process.exit(1)` so the orchestrator can restart a poisoned process.

**Risk addressed**
Before this branch a `SIGTERM` (deploy, `docker stop`, PM2 reload) or a stray rejection could kill the process mid-request or leave the DB connection dangling — potentially truncating writes and hiding the real failure. Shutdown is now orderly, and crash causes are captured in structured logs before the process exits.

**Residual risk / limitations**
The 10-second force-exit can cut genuinely long requests. Shutdown is single-path: `index.js` owns `SIGTERM`/`SIGINT` and delegates the DB close to `dbOptimizer.shutdown()` (`backend/src/utils/performance.js:223-228`); the former duplicate `SIGINT` handler in `performance.js` was removed. There is no handling of `EADDRINUSE`/port conflicts.

**Advantage / benefit**
Zero-downtime deploys and container restarts no longer corrupt in-flight work or leak connections, and a crashed process leaves a fatal log line instead of silence.

### 4. Centralized structured logging (pino)

**Description**
The ad-hoc `console.log`/`winston` output was replaced with a single pino logger that emits structured, level-aware JSON. In development it prints colorized human-readable lines; in production it writes JSON to `error.log` and `combined.log`; in tests it is silent.

**Location**
- `backend/src/utils/logger.js` (whole file); all log calls across `backend/` use `logger.info/error/warn/debug/fatal` with structured fields; request logging in `backend/src/middleware/security.js:465-489`.

**Rules**
- Level: `LOG_LEVEL` env or `info`; forced `silent` when `NODE_ENV=test` (`logger.js:12,24-25`).
- Dev (non-production): `pino-pretty` transport with colorize and `SYS:standard` timestamps (`logger.js:26-42`).
- Production: two `pino/file` transports — `error.log` at level `error`, `combined.log` at the base level — under `backend/logs`, auto-created via `mkdir: true` (`logger.js:43-61`).
- Timestamps are ISO-8601 (`pino.stdTimeFunctions.isoTime`); every record carries `service: "mindful-learning-api"` and a `level` field.
- `requestLogger` records method, URL, status, duration, IP, user-agent, userId and userRole — and does **not** log the request body (see Feature 13).

**Risk addressed**
Previously logs were unstructured console lines mixed into stdout with no levels, timestamps or request correlation — effectively unusable for production debugging, and bodies were being logged, risking PII. Structured, leveled JSON gives ops parseable records and a dedicated error stream.

**Residual risk / limitations**
Production files are append-only with no rotation configured — `error.log`/`combined.log` will grow until the disk is managed externally. There is no log-shipping configured (no stdout/JSON-to-stdout in production, so container log drivers miss the app logs). The stale `winston` dependency was removed from `backend/package.json` and the workspace lockfile; the codebase uses pino exclusively.

**Advantage / benefit**
An operator can `grep` or pipe structured logs, separate errors from the noise, and see request metadata per line — with no PII bodies — which was not possible before.

### 5. Environment validation & one-click launch

**Description**
A developer can now go from a fresh clone to a running stack with one script, and a misconfigured server refuses to start with a clear message instead of failing later at runtime. `.env.*` files were removed from version control and replaced with a documented `backend/.env.example`; `backend/index.js` validates the environment at boot; `launch.sh` automates Mongo/deps/backend/frontend startup; `backend/scripts/seedAndDrop.js` resets the program/course data from the Excel seed.

**Location**
- `backend/.env.example`; `backend/index.js:24-51` (startup validation); `launch.sh` (whole file); `backend/scripts/seedAndDrop.js` (whole file).

**Rules**
- In any non-test environment, `MONGODB_URI` and `JWT_SECRET` must be set or the server logs a `fatal` and exits 1 (`index.js:25-35`).
- `JWT_SECRET` must be ≥ 32 characters and not on the blocklist `["test-secret","jwt_mindful","secret","changeme","password","default"]`, else startup aborts (`index.js:37-49`).
- `launch.sh`: auto-generates a random 32-byte hex JWT secret when the placeholder string `REPLACE_WITH_GENERATED_SECRET` is present in `backend/.env.development`; starts MongoDB (native `mongod`, falling back to the Docker `mongo` service on port 27018); installs root/backend/frontend deps with pnpm (frozen lockfile, falling back to plain install); kills stale processes on ports 5010/5173; starts backend and frontend with health checks; traps `SIGINT`/`SIGTERM` to shut both back down.
- `seedAndDrop.js`: drops all programs, courses and course packages, then re-creates them from `backend/scripts/EducationData.xlsx` (upserts by name/code), reporting final counts.

**Risk addressed**
Before, first-run setup required hand-written env files, a pre-existing Mongo database and a hardcoded/weak secret; the result was confusing failures and secrets checked into git. Now the environment is documented, validated fast and scripted, and the data bootstrap is a documented one-liner.

**Residual risk / limitations**
`launch.sh` auto-generates the JWT secret when the sentinel `REPLACE_WITH_GENERATED_SECRET_MIN_32_CHARS` is present, and `backend/.env.example` now ships that same sentinel — so a fresh copy of the example file is auto-filled on first run. `launch.sh` still `kill -9`s whatever is currently bound to ports 5010/5173, which can clobber unrelated local dev servers. `backend/ecosystem.config.cjs` no longer pins any secret values: `JWT_SECRET` and `GOOGLE_PWD` are read from `process.env` (the committed `jwt_mindful` secret and the plaintext `GOOGLE_PWD` were removed — rotate that Google account credential if it ever shipped), so the documented PM2 production path (`make deploy` → `pm2 startOrReload ecosystem.config.cjs --env production`) passes the startup validation when real secrets are supplied.

**Advantage / benefit**
A new developer goes from clone to working app in one command, and any environment mistake surfaces as a specific fatal message at boot rather than an opaque runtime crash — the fastest possible failure feedback.

---

## Security

### 6. JWT secret strength enforcement

**Description**
The backend can no longer run with a weak, known, or missing signing secret. The hard-coded `"test-secret"` fallback was removed, and startup now rejects short or blocklisted secrets outright, so tokens cannot be forged with a publicly-known key.

**Location**
- `backend/index.js:25-50` (boot-time validation); removal of the fallback in `backend/src/controllers/authController.js` (all `jwt.sign`/`jwt.verify` calls now use `process.env.JWT_SECRET` directly, e.g. `authController.js:89`).

**Rules**
- Non-test boot requires `JWT_SECRET` to exist, be at least 32 characters long, and not equal any of `test-secret`, `jwt_mindful`, `secret`, `changeme`, `password`, `default` — otherwise `logger.fatal` + `process.exit(1)`.
- Tests are exempt from boot validation and set their own secrets, so the test suite is unaffected (`index.js:25`).
- JWT sign/verify no longer has any fallback value: missing secret → sign/verify fails rather than silently using a default.

**Risk addressed**
The baseline shipped a `test-secret` fallback, meaning production could run with a known secret that anyone could use to sign arbitrary admin tokens. This closes that by making the secret a hard boot requirement with a minimum strength and a blocklist of obviously weak values.

**Residual risk / limitations**
The blocklist is an exact-match list, not a strength policy — a 40-character secret like `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"` passes. `backend/ecosystem.config.cjs` now takes `JWT_SECRET` from `process.env` (no default), so PM2 production runs use the operator-supplied secret (see Feature 5). Rotating the secret invalidates all existing sessions (inherent to signed JWTs).

**Advantage / benefit**
Token forgery via a known/default key is no longer possible on any correctly-configured deployment, because a weak secret now prevents the server from starting at all.

### 7. Authentication on previously-open routes

**Description**
Several endpoints that were reachable without any login on the baseline now require a valid JWT session (and, where it matters, a staff/admin role or ownership of the resource). This includes student create/list, every file upload/download/delete path, document access, notification resolution, stats, and the static `/uploads/*` files.

**Location**
- `backend/src/router/studentRoutes.js` (`POST /student` :420, `GET /students` :133, and every other route :43-1314 all carry `authenticateUser` + `hasRole`).
- `backend/src/router/uploadRoutes.js` (`POST /:studentId` :185, `GET /:studentId` :247, `GET /download/:fileId` :262, `DELETE /:fileId` :285, `GET /all/apl` :303, `DELETE /cleanup/orphaned` :379, `POST /upload/xlsxupload` :164).
- `backend/src/router/documentRoutes.js` (`GET /documents/:id` :187, `DELETE` :226, `POST /documents/upload` :78).
- `backend/src/router/notificationRoutes.js` (`PUT /notifications/resolve/:studentId` :177, `PUT /notifications/:id/resolve` :191, `GET /notifications` :16).
- `backend/src/router/statsRoutes.js:10` (`GET /courses-per-month`).
- `backend/src/router/gradeRoutes.js`, `examRoutes.js`, `meetingroutes.js`, `taskRoutes.js`, `searchRoutes.js`, `userRoutes.js`, `actionPlanRoutes.js`, `teacherRoutes.js` — all routes now run behind `authenticateUser`/`isAuthenticated` and role checks.
- Static files: `backend/index.js:198-209` requires a valid cookie JWT before `express.static` serves `/uploads/*`.

**Rules**
- All student/file/document/notification/stats routes require a valid session (`authenticateUser`, JWT from the httpOnly cookie, with a `Bearer` header fallback).
- Staff actions are gated by role lists: e.g. `ALLOWED_STAFF_ROLES = ["systemadmin","admin","teacher","coordinator","syv","specped","tester"]`; deletions require admin roles (`studentRoutes.js:27-28`).
- Teachers are scoped to their own data: `GET /students` filters by the teacher's `teacherId` (`studentRoutes.js:141-152`); file access checks deny a teacher access to another teacher's students (`uploadRoutes.js:45-85`, `:88-150`).
- Invalid file IDs return `400` before any DB lookup (`uploadRoutes.js:98-100`); orphaned files (no student link) are admin-only (`uploadRoutes.js:116-123`).
- `xlsxupload` additionally requires `systemadmin|admin|coordinator|tester` (`uploadRoutes.js:167`).

**Risk addressed**
On the baseline anyone who could reach the API could create students, upload/download/delete arbitrary files, resolve notifications and read stats without any session — a trivial data-integrity and privacy breach. These paths are now closed unless the caller has a valid session and the matching role or ownership.

**Residual risk / limitations**
Authorization is stateless: role claims live in the signed JWT and `hasRole`/`checkStudentAccess` trust `req.user.role` from the token rather than a per-request DB lookup (the documented accepted risk in `CHANGELOG.md` §6). A leaked or long-lived token therefore carries its role with it; mitigations are secret-strength enforcement and strict cookie flags.

**Advantage / benefit**
An unauthenticated attacker can no longer reach any data-mutating or file-serving endpoint; teachers can only touch students/files they are assigned to, which both shrinks the breach surface and enforces the intended role boundaries.

### 8. Mass-assignment protection & input validation/sanitization

**Description**
Request bodies are no longer trusted wholesale. Registration whitelists the assignable `role` values, several write routes copy only an explicit allow-list of fields into documents, and a reusable schema validator (`validate`/`validateId`) plus a sanitizer enforce types, lengths, email/password rules, ObjectId formats and strip HTML/script markup.

**Location**
- `backend/src/controllers/authController.js:16-17` (role whitelist `["admin","user","moderator"]`, default `"user"`); the mounted register route ignores role entirely (`backend/src/router/authRoutes.js:42`).
- Whitelisted writes: `backend/src/router/studentRoutes.js:434` (create: 20 fields), `:913-949` (update: 18 fields + `municipality.type`), `backend/src/router/searchRoutes.js:615` and `:630`.
- Validators: `backend/src/middleware/validation.js` (`validate()`, `validateId()`), `backend/src/middleware/security.js:298-373` (`inputValidator`: `validateEmail`, `validatePassword`, `sanitizeInput`, `validateObjectId`).
- Applied on register/login (`authRoutes.js:30,55`), student create/update (`studentRoutes.js:420,910`), course create (`courseRoutes.js:74`), course-package (`coursePackageRoutes.js:53`), user routes (`userRoutes.js:32,62`).

**Rules**
- `register` accepts `role` only if it is one of `admin|user|moderator`, otherwise it falls back to `"user"`; a caller can never self-assign `systemadmin` or `teacher`.
- `validate(schema)`: supports `required`, `type`, `min`/`max` length, `email`, `password` (≥ 8 chars, upper + lower + digit + special), `objectId` (24-hex), custom rules, and `sanitize` (string fields rewritten through `sanitizeInput`).
- `validateId()` rejects any route param that is not exactly 24 hex chars with `400`.
- `sanitizeInput` removes `<script>`/`</script>`, all `<`/`>`, the `javascript:` scheme, and `onXxx=` event-handler attributes.
- Student create/update only copy the allow-listed fields into the document — unknown fields in the payload are dropped.

**Risk addressed**
The baseline allowed a client to submit arbitrary fields (e.g. `role: "systemadmin"` on register, or a fabricated `_id`/`teacherId` on student create) that were persisted verbatim — a privilege-escalation and data-integrity hole. Field whitelists plus schema validation close the injection of unwanted document fields and malformed values.

**Residual risk / limitations**
Validation is opt-in per route: fields are only sanitized when the schema sets `sanitize: true`, and not every route in the codebase has a schema yet (e.g. `documentRoutes.js` upload has none). The password rule is applied at registration/login but existing users with weaker passwords are unaffected. Whitelists must be maintained as models evolve — a new field added to the model but not the list is silently dropped on update.

**Advantage / benefit**
A caller can no longer escalate their own role or smuggle arbitrary fields into the database, and malformed payloads now get a clean `400` with a specific message instead of a `500`.

### 9. ReDoS prevention (escaping regex input)

**Description**
User-supplied search text is now escaped before it is compiled into any regular expression, so a crafted query cannot turn a simple text search into a catastrophic backtracking pattern that pins the CPU.

**Location**
- `backend/src/utils/escapeRegExp.js` (escapes `/[.*+?^${}()|[\]\\]/g`); used in `backend/src/router/searchRoutes.js` for every `$regex` (student names `:158`, user username/email/name `:160-165`) and in-memory pattern (`:244`).

**Rules**
- Every search term passed to `$regex` or `new RegExp()` in `searchRoutes.js` goes through `escapeRegExp(q)` first; regex metacharacters become inert literals.
- Four previously-vulnerable patterns were fixed; covered by 16 dedicated unit tests (`backend/tests/unit/escapeRegExp.test.js`).

**Risk addressed**
A search input like `(a+)+$` or `((((a+` compiled directly into a regex could make MongoDB or Node spend seconds-to-minutes backtracking per request — a cheap DoS vector on a public-ish search endpoint. Escaping makes the user string match literally, so the work is bounded by input length.

**Residual risk / limitations**
Escaping is applied where it was added — any future route that builds a regex from user input without `escapeRegExp` reintroduces the issue. It neutralizes regex metacharacters only; it does not limit the total length of the query string (that is handled by general request limits, not here).

**Advantage / benefit**
Search is now safe from regex-based CPU exhaustion, and because the escaping is centralized, the fix pattern is trivial to reuse on any new search route.

### 10. Security headers, CORS allowlist & request timeout

**Description**
The API now ships hardened HTTP headers via Helmet, a strict CORS allow-list that blocks Origin-less requests in production, and a 30-second per-request timeout to cut hung/slowloris connections.

**Location**
- `backend/src/middleware/security.js`: `securityHeaders` (`:270-295`), `corsConfig` (`:492-532`), `requestTimeout` (`:635-652`); wired in `backend/index.js:77,80,84`.

**Rules**
- CSP: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com`; `img-src 'self' data: https:`; `connect-src 'self'`; `frame-src 'none'`; `object-src 'none'`; `upgrade-insecure-requests`.
- HSTS: `maxAge` 1 year, `includeSubDomains`, `preload` (`security.js:288-292`); `noSniff` on; referrer policy `strict-origin-when-cross-origin`.
- CORS: requests with no `Origin` header are **rejected (403) in production** and allowed in non-production; allowed origins come from `ALLOWED_ORIGINS` (default `http://localhost:5173`, `http://localhost:3000`, `https://mindfullearning.se`, `https://www.mindfullearning.se`); `credentials: true` so the auth cookie works.
- Timeout: every request is capped at 30 s; if no response headers have been sent when the timer fires, the server returns `503` with a timeout message (`index.js:80`).

**Risk addressed**
The baseline had no CSP/HSTS framing and MIME protections, no origin enforcement (any site could issue credentialed cross-site calls), and no upper bound on request duration. These headers and rules reduce XSS/clickjacking/MIME-sniffing/mixed-content exposure, block CSRF tricks that omit the Origin header, and stop individual requests from hanging the worker forever.

**Residual risk / limitations**
`script-src 'self'` means any future inline `<script>` or third-party CDN script is blocked by the browser — a constraint on future frontend work. CSP allows `img-src https:` (any https image host). The referrer policy is `strict-origin-when-cross-origin`, which still sends the origin across cross-site requests. The timeout is per-request, not per-connection; a flood of many small slow requests is bounded by rate limiting (Feature 12), not this.

**Advantage / benefit**
Browsers now actively refuse to execute/embed most injected content, cross-origin requests are either from the allow-list or blocked, and a stuck handler times out in 30 s instead of occupying a worker indefinitely.

### 11. NoSQL-injection defense & request audit

**Description**
Two middleware layers neutralize classic Mongo operator injection and obvious script/SQL payloads before they reach any route: a recursive sanitizer strips keys that start with `$` or contain `.` from `body`/`query`/`params`, and an audit filter rejects (400) requests whose body or URL matches XSS or SQL/NoSQL injection patterns.

**Location**
- `backend/src/middleware/security.js`: `sanitizeValue`/`mongoSanitize` (`:538-574`), `securityAudit` (`:577-632`); wired in `backend/index.js:122` (after body parsing) and `:102`.

**Rules**
- `mongoSanitize` recursively walks arrays/objects in `req.body`, `req.query` and `req.params` and deletes any key beginning with `$` (e.g. `$gt`, `$where`, `$ne`) or containing `.` (e.g. `email.foo`) — applied to every request, no exceptions.
- `securityAudit` returns `400 { error:{ message:"Invalid request detected" } }` and logs a warning when the serialized body or URL matches `<script`, `javascript:`, `on[a-z]+=`, `union select`, `drop table`, or `delete from` (case-insensitive).

**Risk addressed**
Before, payloads like `{ "email": { "$gt": "" } }` could reach Mongoose queries and bypass auth/filter logic (the classic MongoDB NoSQL injection). The sanitizer destroys those keys at the edge, and the audit layer catches and logs overt attack attempts with IP/user-agent context.

**Residual risk / limitations**
Dangerous keys are silently dropped rather than rejected, so a request that legitimately uses a dotted field name would have it silently altered. The audit pattern list is fixed and small; it is a tripwire, not a full WAF. The audit check stringifies the whole body, so very large payloads incur a serialization cost per request.

**Advantage / benefit**
NoSQL operator injection is structurally impossible against this codebase now — the payload keys never survive to the model layer — without adding a third-party sanitization dependency.

### 12. Rate limiting

**Description**
Four rate limiters throttle traffic per IP: a global limit, a tighter per-API limit, a strict login limiter and an upload limiter. Admins are exempt, and thresholds are lowered in test mode so the behavior is testable.

**Location**
- `backend/src/middleware/security.js`: `rateLimiter` (`:189`), `apiRateLimiter` (`:252`), `authRateLimiter` (`:215-219`), `uploadRateLimiter` (`:221-225`), admin-skip helper `isAdminUser` (`:138-176`); wiring in `backend/index.js:87-93`, `backend/src/router/authRoutes.js:30,55`, `backend/src/router/uploadRoutes.js:168,185`.

**Rules**
- Global: 1000 requests / 15 min per IP (`security.js:12-17`), applied to the whole app in non-test mode.
- API-wide: 60 requests / min on `/api/*` (`security.js:229-230`), skipping the login path (which has its own limiter).
- Auth: 5 attempts / 15 min on `/auth/login` and `/auth/register`.
- Upload: 10 uploads / hour on the file-upload routes.
- Admins (`admin`/`systemadmin`, detected from the JWT cookie) are exempt via the `skip` callback on every limiter.
- Test mode: global window 60 s / max 3 (`security.js:180-184`), and the API-wide limiter is only mounted on `/api/students`.
- Over-limit responses are `429` with a `retryAfter` hint (`security.js:200-212`).

**Risk addressed**
The baseline had no throttling, so a credential-stuffing attack could hammer login, and any client could flood uploads or general endpoints. These limiters slow brute-force password guessing and runaway clients to a crawl per IP.

**Residual risk / limitations**
Limits are per-IP and trivially bypassed by a botnet or by rotating IPs. Without Express `trust proxy` configured, all users behind a shared proxy/load-balancer may appear to come from one IP and hit the limit collectively. The admin exemption means a stolen admin token can bypass every limiter. `courseDetailRateLimiter` (`security.js:255-259`, 2000/min) is now mounted on `GET /courses/:courseId` (`courseRoutes.js`), so the previously-inert limiter is active on the high-volume course-detail path.

**Advantage / benefit**
Automated login brute-force and upload/API abuse are throttled out of the box, with response codes a client can actually react to (`429` + `Retry-After`).

### 13. Error sanitization & PII-safe logging

**Description**
Production error responses no longer leak internal detail, and logs no longer contain request bodies. The global error handler classifies common errors into clean HTTP responses with stack traces only in development; analytics and document/upload failures return generic messages; request logging dropped body content entirely.

**Location**
- `backend/src/utils/errorHandler.js:158-212` (`globalErrorHandler`), `:47-155` (`errorMonitor.recordError` — logs server-side only).
- `backend/src/controllers/analyticsController.js:28` (generic `Failed to generate report`).
- `backend/src/middleware/security.js:465-489` (`requestLogger` — method/url/status/duration/IP/user-agent/userId/role only).
- Filename sanitization: `backend/src/router/uploadRoutes.js:28-33` and `backend/src/router/documentRoutes.js:46`.

**Rules**
- Production 500 responses return `{ success:false, error:{ message } }` with no stack; stack/timestamp/path are added only when `NODE_ENV === "development"` (`errorHandler.js:205-210`).
- Mongoose `CastError` → 404, duplicate key (`11000`) → 409, `ValidationError` → 400, JWT errors → 401 (`errorHandler.js:166-194`).
- Analytics failures always return `Failed to generate report`/`Failed to load filter options`.
- `requestLogger` logs no body, only metadata (the baseline logged `req.body`).
- Download filenames are sanitized to `[a-zA-Z0-9_-]` and capped at 100 characters, blocking path-traversal filenames.

**Risk addressed**
Before, 500 responses and logs could echo raw `err.message` — exposing internal file paths, DB details and PII — and request logs captured full bodies. That directly fed reconnaissance and privacy incidents. The current handling keeps detail server-side and generic client-side.

**Residual risk / limitations**
The remaining raw-message echoes were removed: `GET /api/documents/:id` now returns a generic message on 500 (`documentRoutes.js:222`), and the document-upload validation branch no longer puts `error.message` in `details` (`documentRoutes.js:164-170`) — the "no raw message" guarantee is now universal across these paths. Stack traces still land in server-side pino logs (appropriate, but the files are the sensitive artifact now). `errorMonitor.recordError` logs the full error object including stack, which may contain query parameters.

**Advantage / benefit**
An attacker probing the API learns nothing about the internal layout from error text, and PII no longer flows into request logs — shrinking both the recon surface and GDPR-relevant data collection.

### 14. File upload hardening

**Description**
Uploaded files are constrained by size, extension and MIME type, filenames are sanitized, and files are stored in GridFS with ownership metadata instead of under attacker-controlled names. Multer errors (oversize) are handled explicitly, and an admin-only endpoint cleans up orphaned files.

**Location**
- `backend/src/router/uploadRoutes.js`: size limit `:19`, dangerous-extension list `:20-23`, filename sanitizer `:28-33`, MIME/extension rejection `:200-207`, Multer error handler `:153-161`, orphan cleanup `:379-436`.
- `backend/src/router/documentRoutes.js`: 10 MB multer limit `:60`, sanitized disk filename `:46`, Multer error handler `:65-76`.

**Rules**
- Max file size 10 MB (`uploadRoutes.js:19`, `documentRoutes.js:60`); oversize → `413` (GridFS) / `400` (documents).
- GridFS uploads reject extensions in `DANGEROUS_EXTENSIONS` (`.exe .dll .bat .sh .js .py .html .htm .xhtml .php .jsp .asp .aspx .vbs .cmd .pl .cgi .msi .jar .scr`) and reject content types `text/html*` and `application/x-msdownload` with `400` (`uploadRoutes.js:200-207`).
- Filenames are reduced to `[a-zA-Z0-9_-]` (underscore for anything else) and capped at 100 characters before storage, defeating path-traversal and odd names.
- Files are stored in GridFS with `metadata` containing studentId, uploader role/email/userId and timestamp (`uploadRoutes.js:212-221`).
- Every upload route requires auth and a role/ownership check (Feature 7); uploads are rate-limited (Feature 12).
- `DELETE /api/upload/cleanup/orphaned` (admin-only) finds files whose student no longer exists and deletes them, returning a count.

**Risk addressed**
The baseline accepted arbitrary files under attacker-influenced names, creating stored-XSS and executable-download risks plus garbage accumulating in storage. The hardening blocks executable/HTML uploads, neutralizes hostile filenames, caps payload size and gives admins a way to reclaim orphaned storage.

**Residual risk / limitations**
The disk-based `documentRoutes.js` upload path now has the same extension/MIME blocklist as the GridFS `uploadRoutes` path (dangerous extensions plus `text/html*` / `application/x-msdownload` content types, rejected via a multer `fileFilter` before anything is written to disk). Extension checks are name-based: renaming `evil.sh` to `evil.sh.txt` passes the filter (it is stored as text and served with its own content-type, but the blocklist is not a content scanner). Orphan cleanup is manual (admin-triggered), not scheduled.

**Advantage / benefit**
The file store can no longer be used to distribute executables/HTML or to store path-traversal filenames, uploads are size-bounded, and storage can be reclaimed without hand-editing GridFS.

### 15. Centralized cookie management (sameSite strict)

**Description**
All authentication-cookie code now flows through one module that sets the name and options in a single place, and both set and clear use identical, strict flags — closing a CSRF-relevant lax/strict mismatch that previously existed between login and logout.

**Location**
- `backend/src/config/cookies.js` (whole file); consumers: `backend/src/controllers/authController.js:5,93,174`, `backend/index.js:199`, `backend/src/router/authRoutes.js:62`, `backend/src/middleware/security.js:147`.

**Rules**
- Cookie name is the constant `AUTH_COOKIE_NAME = "token"` everywhere.
- `setAuthCookie` / `clearAuthCookie` always use `httpOnly: true`, `secure` in production, `sameSite: "strict"`, `path: "/"`, and a 7-day `maxAge` on set (`cookies.js:3-14`).
- All `req.cookies` reads of the auth token use `AUTH_COOKIE_NAME` (`authController.js:126,190`, `authRoutes.js:62`, `index.js:199`).
- 11 dedicated unit tests cover the module (`backend/tests/unit/cookies.test.js`).

**Risk addressed**
On the baseline, login set the cookie with `sameSite: "lax"` while logout cleared it with `"strict"` — the mismatch weakened CSRF protection on the set path, and the name/options were copy-pasted across four files where they could drift. Unifying on `strict` means the browser will not send the cookie on cross-site requests, which blocks state-changing CSRF.

**Residual risk / limitations**
`sameSite: strict` means the cookie is not sent on cross-site top-level navigation at all, so any future embed or cross-origin flow must account for it (this app is same-site, so it is fine). `secure` only applies in production, so an unencrypted production deployment would still send the token in clear; the flag follows `NODE_ENV`. Tokens are valid for 7 days with no server-side revocation — logout clears the cookie but a stolen token remains valid until expiry.

**Advantage / benefit**
One module now owns the cookie contract, so set/clear can never diverge again, and the strict SameSite flag closes the CSRF gap with a single configuration point.

---

## Performance

### 16. Pagination & query-batching fixes

**Description**
The heaviest read paths stopped returning unbounded result sets and stopped issuing per-row queries. Student listing and search are paginated with response headers, enrollment lookups are batched with `$in` instead of per-student queries, `populate()` is restricted to needed fields, the Mongo connection pool is sized from config, and startup creates database indexes.

**Location**
- Student listing pagination + header set: `backend/src/router/studentRoutes.js:157-181`; batched enrollment fetch `:202-211`; batched course-package fallback `:236-255`.
- Search pagination: `backend/src/router/searchRoutes.js:272-284`; parallel student/user lookups `:155-167`; restricted `populate`/batch user lookups `:440-465`, `:537-564`.
- Pool + indexes: `backend/index.js:226-230`, `backend/src/utils/performance.js:231-249`.
- Forecast correctness: `backend/src/services/analyticsService.js:214` (null `gradeDate` excluded).

**Rules**
- `GET /students`: `limit` defaults to 500, `page` defaults to 1, query is `skip(offset).limit(limit)`; `X-Total-Count`, `X-Total-Pages`, `X-Current-Page` are set on the response (`studentRoutes.js:158-181`).
- `GET /search`: `limit` defaults to 50, `page` defaults to 1; same three headers (`searchRoutes.js:273-282`).
- Enrollments for N students are fetched with a single `{ studentId: { $in: ids } }` query and grouped in memory; `populate` calls specify field lists (e.g. `"mainCourseId", "courseName"`).
- Mongo pool `maxPoolSize` comes from `MAX_CONCURRENT_REQUESTS` (default 50), with 5 s server selection and 45 s socket timeouts (`index.js:226-230`).
- On startup (non-test), indexes are created for `Student`, `Course`, `StudentEnrollment` and `User`; index-creation failure is logged as a warning and does not stop the server.

**Risk addressed**
The baseline listed every student and every search result in one unbounded query, and fetched enrollments one-per-student (N+1) — at a few hundred students this produced seconds of latency and huge payloads. Pagination bounds memory/payload, batching collapses round-trips, and indexes keep lookups fast.

**Residual risk / limitations**
The student list still does substantial per-student in-memory post-processing (education merging), so it can stay slow for very large datasets even when paginated. `requestOptimizer` caps query `limit` at 100 as the shared default (`performance.js:258`), while the per-route caps stay authoritative: `studentRoutes` clamps to 500 and `searchRoutes` to 50, each enforcing its own cap on top of the shared middleware. Default 500 is still a large page size. Index creation only logs a warning on failure, so a missed index silently persists.

**Advantage / benefit**
Student and search pages load in bounded time with predictable payload sizes and client-side pagination headers, and the DB connection is sized and indexed for the actual request load instead of defaults.

---

## Frontend Experience

### 17. Centralized API client & error normalization

**Description**
All frontend HTTP now goes through one axios instance that adds credentials and a timeout, normalizes every failure into a consistent `{ status, message, code, raw }` shape with user-safe Swedish copy, and reacts globally to session expiry by logging the user out and redirecting to `/login`.

**Location**
- `frontend/src/api/client.js` (whole file); `frontend/src/utils/errorMessages.js` (message map + `getUserMessage()`); store actions migrated to the client in `frontend/src/store/store.js`.

**Rules**
- Single instance: `baseURL = (VITE_API_URL || "") + "/api"`, `withCredentials: true`, `timeout: 30000` (`client.js:3-7`).
- `normalizeError`: `ECONNABORTED` → `{ code:"TIMEOUT" }`; `ERR_CANCELED` → `{ code:"CANCELLED" }`; no response → `{ code:"NETWORK" }`; otherwise `{ code:"HTTP_<status>" }` with a Swedish message from `GENERIC_MESSAGES` (400/401/403/404/409/422/429/500/502/503) or a backend-provided message.
- Any response with status 401 triggers `store.commit("LOGOUT")` and, unless already on `/login`, a redirect to `/login` (`client.js:86-96`).
- `cancelableRequest(config)` returns `{ promise, cancel() }` backed by `AbortController` for abortable calls.
- Views receive the normalized error (never raw axios internals) and can read `err.code`/`err.message` safely.

**Risk addressed**
Views previously duplicated ad-hoc axios calls and raw error handling, producing inconsistent English/technical error messages and unhandled 401s that left the UI looking logged-in after a session expired. One client now gives every screen consistent Swedish feedback and enforces logout-on-expiry globally.

**Residual risk / limitations**
`normalizeError` trusts a backend-provided `message` field when present, so a backend response that echoes internal detail would surface it (backend sanitization limits this, see Feature 13). The 401 redirect does a full `window.location.href` reload. Not every legacy view was migrated to the shared client.

**Advantage / benefit**
Users see the same clear Swedish error copy everywhere, and a dead session is handled automatically (logout + login redirect) instead of producing baffling partial-UI failures.

### 18. Toast notification system

**Description**
An app-wide snackbar surfaces success/error/warning/info messages to the user. A tiny reactive singleton (`useToast`) holds the message state, and a single component (`ToastNotification`) renders it top-right; any view can call `success()`, `error()`, etc. with sensible default durations.

**Location**
- `frontend/src/composables/useToast.js` (state + show/success/error/warning/info/dismiss); `frontend/src/components/ToastNotification.vue`; mounted once in `frontend/src/App.vue:4`.
- Migrated views (e.g. `ExcelUpload.vue`, `CourseOverview.vue`, grade/exam forms) call it instead of raw error handling.

**Rules**
- Default timeouts: success 4 s, error 7 s, warning 6 s, info 5 s (`useToast.js:24-27`).
- Only one toast displays at a time: a new `show()` clears the previous timer and replaces the message.
- Type → Vuetify color mapping (`success|error|warning|info`) and a "Stäng" dismiss button (`ToastNotification.vue:21-26`).

**Risk addressed**
Silent failures were common — an operation would fail and the only trace was the browser console. Toasts give immediate, visible feedback for every important outcome without each view building its own alert markup.

**Residual risk / limitations**
The toast is a single slot — rapid successive notifications overwrite each other (no queue). Not all views were migrated, so some paths still fail silently.

**Advantage / benefit**
Users and admins get instant confirmation that an action succeeded or failed, reducing duplicate submits and "did it save?" confusion.

### 19. Error boundary & global error handler

**Description**
A reusable error boundary wraps the routed content: if a component throws during render, the user sees a recoverable alert with a "back to home" action instead of a blank/broken screen. A global Vue handler also captures and logs any unhandled component error.

**Location**
- `frontend/src/components/ErrorBoundary.vue` (uses `onErrorCaptured`); wraps `<router-view>` in `frontend/src/App.vue:18-20`; `app.config.errorHandler` in `frontend/src/main.js:41-43`.

**Rules**
- `onErrorCaptured` sets an error flag and returns `false` (suppressing propagation) so the rest of the app keeps working.
- When the flag is set, the slot is replaced by an `v-alert` ("Något gick fel … Till startsidan") with a button that routes to `/` and a close button that resets the boundary.
- `app.config.errorHandler` logs unhandled Vue errors (`console.error` with `{ err, info }`) so they are not silently swallowed.

**Risk addressed**
A single bad render used to take down the whole page (white screen) with no explanation and no path forward. The boundary isolates the failure to a region, explains it, and offers recovery.

**Residual risk / limitations**
`onErrorCaptured` catches render/lifecycle errors in the routed tree, not errors thrown in event handlers or async callbacks (those fall to `errorHandler`, which only logs). The boundary's error state persists across route changes until dismissed, so navigating away and back can show a stale alert.

**Advantage / benefit**
Users never hit a completely dead page from a render bug; they get a clear message and a one-click way home, while the developer still sees the error in the console.

### 20. 404 handling & chunk-load recovery

**Description**
Unknown URLs render a styled Swedish 404 page instead of a blank screen, and when a lazy-loaded route chunk fails to download (e.g. after a deploy invalidates the old bundle hash), the router automatically reloads the page to fetch the fresh bundle.

**Location**
- `frontend/src/views/NotFound.vue`; catch-all route `/:pathMatch(.*)*` in `frontend/src/router/router.js:291-296`; `router.onError` recovery in `router.js:304-310`.

**Rules**
- Any unmatched path matches the catch-all and renders `NotFound.vue` ("Sidan hittades inte", button to `/`).
- `router.onError` detects `Failed to fetch dynamically imported module` / `Loading chunk ... failed` and performs `window.location.href = to.fullPath` to reload.
- Page titles are set per-route in the global `beforeEach` guard (`router.js:314`).

**Risk addressed**
Typed/broken URLs previously produced a blank page with no guidance, and after a production deploy a user with a cached old bundle hit a dead navigation with no recovery. The 404 page explains the miss, and the auto-reload self-heals stale-chunk sessions.

**Residual risk / limitations**
If the chunk is permanently missing (not just stale), the reload will land on the 404 page rather than retrying indefinitely — an acceptable trade-off. The recovery matches two specific error strings; other navigation errors are not handled.

**Advantage / benefit**
Users can recover from dead links and stale deployments without clearing the cache, which is the most common real-world cause of "the app broke after deploy".

### 21. Offline detection

**Description**
The app listens for the browser's `online`/`offline` events and shows a persistent warning banner at the top of the page while there is no network connection, so users understand why requests are failing.

**Location**
- `frontend/src/composables/useNetworkStatus.js`; banner in `frontend/src/App.vue:6-14`.

**Rules**
- Initial state is `navigator.onLine`; the `online`/`offline` window events flip the reactive `isOnline` flag (`useNetworkStatus.js:3-22`).
- While offline, a `v-alert` warning ("Du är offline. Några funktioner fungerar inte …") is shown across the whole app (`App.vue:6-14`).

**Risk addressed**
When a connection dropped, requests failed with opaque errors and no indication the problem was the user's own network. The banner explains the situation immediately.

**Residual risk / limitations**
`navigator.onLine` is known to be unreliable on some platforms (e.g. captive portals report online while blocking traffic). There is no offline action queueing — mutations attempted offline are lost, not replayed.

**Advantage / benefit**
Users get an unambiguous "you are offline" signal instead of guessing, which reduces duplicate retries and support noise.

---

## Developer Tooling & CI

### 22. Testing & CI pipeline

**Description**
A full lint + unit/integration-test + containerized-test pipeline runs on every push/PR, coverage floors are enforced, and an E2E scaffolding directory with Playwright smoke flows was added. The suite grew to 868 backend and 121 frontend tests on the branch tip.

**Location**
- `.github/workflows/ci.yml` (lint / test / docker jobs); `backend/.eslintrc.cjs`, `frontend/eslint.config.js`; coverage thresholds in `backend/vitest.config.js:11-20` and `frontend/vitest.config.js:28-38`; E2E in `e2e/` (`playwright.config.js`, `tests/verification.spec.js`); `Makefile` (`make citest`, `make format`, `make lint`, `make test`).

**Rules**
- CI job `lint`: ESLint on backend (`--max-warnings 50`) and frontend (`--max-warnings 770`) under Node 25 + pnpm 11.
- CI job `test` (after lint): `vitest run` for backend (with `NODE_ENV=test`) and frontend.
- CI job `docker`: `docker build --target cicd` then `docker run` the image, which runs `make test` inside the container.
- Coverage thresholds (local vitest runs): backend statements 78.5 / branches 65 / functions 83 / lines 78.5; frontend 50 / 40 / 50 / 50 — a below-threshold run fails.
- Backend tests use in-memory MongoDB (`mongodb-memory-server`, booted per run in `backend/tests/helpers/mongoTest.js`) so CI needs no external DB; the Docker `test-base` stage pre-caches the binary to avoid first-run timeouts (`Dockerfile:36-38`).
- E2E scaffolding: Playwright with chromium only, `workers: 1` (state isolation), trace/screenshot/video on failure, and smoke specs asserting role-based logins and zero console/page errors (`e2e/playwright.config.js`, `e2e/tests/verification.spec.js`).

**Risk addressed**
The baseline had no CI enforcement, no lint, no coverage gate and tests that flaked on a shared external MongoDB. Regressions could land silently. The pipeline now gates merges on lint, full test suites and coverage, and tests run hermetically in-memory or in a container.

**Residual risk / limitations**
E2E is scaffolding only — it is not wired into the CI workflow, and its users/port assume a locally running stack (`baseURL http://localhost:5174`). The frontend ESLint allowance (770 warnings) is lenient. Coverage thresholds apply to local `vitest` runs, not as a hard CI check (CI runs tests without `--coverage`). The known mongodb-memory-server first-run race is documented (`CHANGELOG.md` §6).

**Advantage / benefit**
Every PR is now checked for lint, correctness and coverage automatically and identically on a developer's machine and in CI, so regressions are caught before merge instead of in production.

---

## Deployment Infrastructure

### 23. pnpm workspace migration

**Description**
The three separate `package-lock.json` files were replaced by a single workspace lockfile managed with pnpm. CI, Docker and the Makefile all install with `pnpm install --frozen-lockfile` for reproducible builds, and dependency overrides pin two known-vulnerable transitive packages.

**Location**
- `pnpm-workspace.yaml` (workspace packages `"."`, `"backend"`, `"frontend"`; `allowBuilds` for bcrypt/core-js/esbuild/mongodb-memory-server/vue-demi; overrides `brace-expansion >=5.0.8`, `uuid >=11.1.1`); single `pnpm-lock.yaml`; `Dockerfile:9,17-18,29`; `ci.yml:14-21`; `Makefile` (`deploy`, `init`, `pnpmup`).

**Rules**
- One lockfile (`pnpm-lock.yaml`) covers the root, backend and frontend; installs in CI/Docker/Makefile use `--frozen-lockfile` (with a non-frozen fallback in `launch.sh`).
- pnpm version pinned (`pnpm@11.17.0`) in the Dockerfile and `volta` fields.
- Build-script packages (`bcrypt`, `core-js`, `esbuild`, `mongodb-memory-server`, `vue-demi`) are explicitly allowed to run their install scripts.
- Overrides force `brace-expansion >=5.0.8` and `uuid >=11.1.1` to neutralise known high-severity advisories.

**Risk addressed**
Three independent lockfiles could drift out of sync (which actually broke the Docker build in Milestone 1), making installs non-deterministic. One workspace lockfile plus frozen installs makes dependency resolution deterministic across machines, CI and containers, and overrides close two known vulnerabilities that had no clean upgrade path.

**Residual risk / limitations**
Two moderate dev-only advisories remain with no non-breaking fix (`vue-template-compiler` XSS and `showdown` ReDoS, both transitive via documentation tooling) — explicitly acknowledged and pinned in `CHANGELOG.md` §6. The migration is a one-way change; package management tooling is now pnpm-only.

**Advantage / benefit**
Reproducible installs everywhere (developer, CI, Docker), faster installs via the pnpm store, and two high-severity supply-chain findings resolved while the two remaining moderates are documented.

### 24. Multi-stage Docker build & deployment hardening

**Description**
The Dockerfile was split into purpose-built stages (deps, test-base, cicd, build, dev, production), the app container runs as a non-root user with a healthcheck, docker-compose got its ports/volumes corrected, and the `.dockerignore` was expanded so secrets and caches never enter the build context.

**Location**
- `Dockerfile` (whole file); `docker-compose.yml` (whole file); `.dockerignore`; `Makefile` (`citest`, `dev`); deployment docs `DEPLOYMENT.md` + root `README.md`.

**Rules**
- Stages: `deps` installs all deps with a BuildKit cache mount for the pnpm store (`Dockerfile:17-18`); `test-base` adds `make` and pre-caches the mongodb-memory-server binary (`:36-38`); `cicd` copies source and runs `make test` (`:44-47`); `build` runs the frontend production build (`:60-63`); `dev` runs as `appuser` with a `/health/live` healthcheck on port 5010 (`:69-85`); `production` adds `pnpm prune --prod` and the same non-root/healthcheck hardening (`:91-114`).
- Non-root user `appuser` owns the app, `logs/` and `public/uploads/` in both runtime stages.
- `docker-compose.yml`: Mongo on host port `27018` (avoids clashing with a local Mongo on `27017`), app on `5010`, app waits for `mongo` to be healthy, and persistent named volumes (`mongo_data`, `backend_uploads`, `backend_logs`) replace bind mounts.
- `.dockerignore` excludes `node_modules`, `.env*`, coverage/dist and E2E artifacts.
- `make citest` builds the `cicd` image and runs the suite in-container, sidestepping Docker Desktop's "mounts denied" quirk on `/media/...` paths.

**Risk addressed**
The baseline Docker setup had a broken `npm ci`, a port mismatch (5001 vs. the backend default), a root-running container and no healthcheck — an image that was hard to test and dangerous to run. The multi-stage split gives each job a lean, reproducible image, containers no longer run as root, orchestrators get a real health signal, and the port/compose mismatches are gone.

**Residual risk / limitations**
`docker-compose.yml` now supplies an `environment:` block for the app service (`MONGODB_URI: mongodb://mongo:27017/mindfullearning`, `JWT_SECRET` from the host env with a dev-insecure fallback, `CLIENT_URL`, `NODE_ENV: development`, `PORT: 5010`), so `docker compose up` / `make dev` boots and stays up without operator-supplied env — the fallback secret is intentionally not production-safe and must be overridden for anything beyond local dev. The `dev` image sets `NODE_ENV=development`, so it runs in "development" logging mode inside the container. Healthchecks probe `/health/live` (process-alive only), not `/health/ready`.

**Advantage / benefit**
Containers are smaller (prod prunes devDeps), run unprivileged, self-report health to Docker, and `make citest` gives a containerized test run that works even where bind-mounts are unavailable — a reproducible path from build to test to deploy.

---

## Verification notes — review findings and their resolution

The write-up above was cross-checked against the actual code. Ten discrepancies were found; each was fixed in this branch, and the sections above now describe the corrected state:

| # | Finding | Resolution |
|---|---|---|
| 1 | `docker-compose.yml` had no env for the app service, so `make dev` exited on the mandatory-env check | Fixed: app service now has an `environment:` block (`MONGODB_URI`, `JWT_SECRET` with dev fallback, `CLIENT_URL`, `NODE_ENV`, `PORT`); `make dev` boots and passes `/health/ready` |
| 2 | `backend/ecosystem.config.cjs` pinned blocklisted `JWT_SECRET: "jwt_mindful"` and a committed plaintext `GOOGLE_PWD` | Fixed: both are now read from `process.env`; the real credential was removed from git (rotate the Google account password if it ever shipped) |
| 3 | `launch.sh` sentinel (`REPLACE_WITH_GENERATED_SECRET`) mismatched the `.env.example` placeholder (`replace-with-a-strong-random-string`) | Fixed: `.env.example` now ships `REPLACE_WITH_GENERATED_SECRET_MIN_32_CHARS`, matching `launch.sh`; fresh copies auto-fill (verified against the launch logic) |
| 4 | `documentRoutes.js` echoed raw `err.message` on 500 (`:222`) and in the upload-validation `details` (`:164-169`) | Fixed: generic 500 message; the validation branch returns only field-level messages from `error.errors` — no raw message |
| 5 | Disk-based document upload had no extension/MIME blocklist | Fixed: `DANGEROUS_EXTENSIONS` + `text/html*` / `application/x-msdownload` rejection via a multer `fileFilter`; two new integration tests |
| 6 | `courseDetailRateLimiter` (2000 req/min) defined but never mounted | Fixed: mounted on `GET /courses/:courseId` |
| 7 | `winston` still a declared dependency in a pino-only codebase | Fixed: removed from `backend/package.json`; workspace lockfile regenerated; `pnpm install --frozen-lockfile` passes |
| 8 | `/health`/`/metrics` unauthenticated; `/metrics` cache hard-coded `{ size: 0, keys: [] }` | Partly fixed by decision: the cache is now live (`cacheManager.getStats()`); the endpoints stay unauthenticated for the firewalled/VPN topology, and that access-control assumption is documented in `DEPLOYMENT.md` |
| 9 | Duplicate `SIGINT` handler in `performance.js` alongside `index.js`'s | Fixed: single shutdown path — `index.js` owns signals and delegates the DB close to `dbOptimizer.shutdown()`; the duplicate handler was removed (verified with a container `SIGINT` test) |
| 10 | `requestOptimizer` 100-cap vs. per-route limits | Resolved by decision: per-route caps are authoritative (students 500, search 50) and each route now clamps explicitly; the optimiser's 100 cap remains the shared default for routes that don't override |
