# Security Hardening Report

**Date:** 2026-07-25
**Scope:** Backend API + Frontend client hardening

## Changes Made

### JWT & Authentication

| Change | File | Risk |
|--------|------|------|
| Removed hardcoded `test-secret` JWT fallback | `authController.js` | High — fallback meant production could run with weak secret |
| Added JWT_SECRET strength validation at startup | `index.js` | High — rejects weak/short secrets (< 32 chars), known values |
| `.env.production` / `.env.development`: secrets replaced with placeholders | `.env.production`, `.env.development` | Medium — prevents accidental commit of real secrets |

### Input Validation & Injection

| Change | File | Risk |
|--------|------|------|
| Fixed ReDoS in 4 regex patterns | `searchRoutes.js` | High — catastrophic backtracking on adversarial input |
| Mass assignment blocked on 4 routes | `studentRoutes.js`, `examRoutes.js`, `searchRoutes.js`, `actionPlanRoutes.js` | High — users could set arbitrary fields (`role`, `isApproved`, etc.) |
| Created `escapeRegExp` utility | `utils/escapeRegExp.js` | N/A — supports the ReDoS fix |

### Authorization on Open Routes

| Change | File | Risk |
|--------|------|------|
| `PUT /notifications/resolve/:studentId` now requires auth + staff role | `notificationRoutes.js` | Medium — was writable by anyone |
| `GET /documents/:id` now requires auth + student ownership check | `documentRoutes.js` | Medium — documents were publicly accessible |
| `GET /stats/courses-per-month` now requires auth | `statsRoutes.js` | Low — internal stats endpoint |

### Security Headers & CORS

| Change | File | Risk |
|--------|------|------|
| Null origin rejected in production | `security.js` | Low — prevents some CSRF vectors |
| CSP `upgradeInsecureRequests` directive added | `security.js` | Low — upgrades HTTP to HTTPS in browsers |

### Error Sanitization & Logging

| Change | File | Risk |
|--------|------|------|
| Production 500 errors return generic message | `errorHandler.js` | Medium — prevents stack trace leakage |
| `err.message` removed from document/upload 500 responses | `documentRoutes.js`, `uploadRoutes.js` | Medium — prevents internal path/DB error leakage |
| `req.body` logging replaced with `Object.keys(req.body)` | 4 route files | Low — prevents logging PII/secrets |

### Upload Security

| Change | File | Risk |
|--------|------|------|
| Filename sanitized on document download | `documentRoutes.js` | Medium — prevents path traversal via crafted filenames |
| 100-char filename length limit | `documentRoutes.js` | Low — prevents DoS via long names |

## Test Coverage

- 21 new security-focused unit tests (`tests/unit/securityHardening.test.js`)
- 16 new regex escaping tests (`tests/unit/escapeRegExp.test.js`)
- Full test suite: **817 backend tests** across 51 files, **121 frontend tests** across 8 files

## Recommendations for Follow-up

1. **Rotate secrets**: Generate new JWT_SECRET with `openssl rand -base64 48`
2. **HTTPS**: Ensure production uses TLS termination (reverse proxy or load balancer)
3. **Audit dependencies**: Run `pnpm audit` in both backend and frontend
4. **Session management**: Consider adding JWT token expiry/refresh rotation
5. **Rate limiting**: Review per-route limits for sensitive endpoints (login, registration)

---

## Docker Optimization & Audit (2026-07-25)

### pnpm Migration

- All package management converted from npm to pnpm 11.17.0
- Workspace setup with `pnpm-workspace.yaml` (root + backend + frontend)
- Lockfiles: single `pnpm-lock.yaml` at root (replaces 3 separate `package-lock.json`)
- Build scripts: `pnpm install --frozen-lockfile` in CI and Docker
- Overrides in `pnpm-workspace.yaml` for transitive dependency fixes

### Multi-stage Dockerfile

| Stage | Base | Purpose |
|-------|------|---------|
| `deps` | `node:25-bookworm` | Install all deps with BuildKit cache mount for pnpm store |
| `test-base` | `node:25-bookworm` | Make + MMS binary pre-cache for fast test startup |
| `cicd` | `test-base` | Source + tests (used by `make citest`) |
| `build` | `deps` | Frontend production build (`pnpm run build`) |
| `dev` | `node:25-alpine` | Development server, non-root user, healthcheck |
| `production` | `node:25-alpine` | Minimal runtime with `pnpm prune --prod`, non-root, healthcheck |

### .dockerignore

Excludes: `node_modules`, `.git`, `dist/`, `coverage/`, `.env*`, editor/OS cruft, markdown reports, `Dockerfile`, `docker-compose.yml`.

### Image Size

| Metric | Before (npm) | After (pnpm) | Change |
|--------|-------------|--------------|--------|
| cicd image | 3.17 GB | 2.96 GB | -6.6% |

Source-only rebuild: **~7 seconds** (deps layer fully cached via BuildKit).

### Vulnerability Audit

| Metric | Before | After |
|--------|--------|-------|
| Total vulnerabilities | 5 (npm) | 2 (pnpm) |
| Critical | 1 (vitest) | 0 |
| High | 1 (brace-expansion) | 0 |
| Moderate | 3 (vue-template-compiler, showdown, uuid) | 2 (vue-template-compiler, showdown) |

**Resolved:**
- **vitest critical**: Upgraded 4.0.16 → 4.1.10 (arbitrary file read via UI server)
- **brace-expansion high**: Override to >=5.0.8 (DoS via unbounded expansion)
- **uuid moderate**: Override to >=11.1.1 (buffer bounds check) via exceljs
- **exceljs**: Upgraded 3.x → 4.x (transitive uuid vulnerability)

**Remaining (dev-only, not actionable):**
- `vue-template-compiler` (moderate XSS) — transitive via `documentation` devDependency; Vue 2.x component, no fix without replacing the doc tool
- `showdown` (moderate ReDoS) — transitive via `clean-jsdoc-theme` devDependency; no upstream fix available
