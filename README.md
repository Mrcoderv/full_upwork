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

### 1. Start MongoDB

**Option A — Docker (recommended):**

```sh
make dev
```

This starts MongoDB on `localhost:27017` via Docker Compose. Press `Ctrl+C` to stop.

**Option B — Local MongoDB:**

Ensure `mongod` is running on port 27017.

### 2. Install dependencies

```sh
pnpm install
```

### 3. Configure environment

```sh
cp backend/.env.example backend/.env.development
```

Edit `backend/.env.development` — the only _required_ values are:

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/mindfullearning` |
| `JWT_SECRET` | Secret for signing JWTs (≥ 32 chars) | `openssl rand -base64 48` |

### 4. Start the app

```sh
# Backend (port 5010)
cd backend && pnpm dev

# Frontend (port 5173, separate terminal)
cd frontend && pnpm dev
```

Open http://localhost:5173.

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
