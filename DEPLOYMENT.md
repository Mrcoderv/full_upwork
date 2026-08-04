# Deployment Notes

## Environment Variables (Production)

Generate a strong JWT_SECRET:

```sh
openssl rand -base64 48
```

Required variables for `backend/.env.production`:

| Variable | Description | How to set |
|----------|-------------|------------|
| `MONGODB_URI` | MongoDB connection string | Your production MongoDB URI |
| `JWT_SECRET` | JWT signing secret (≥ 32 chars) | `openssl rand -base64 48` |
| `CLIENT_URL` | Frontend origin for CORS | `https://your-domain.com` |
| `NODE_ENV` | Must be `production` | Set in your process manager |

Optional:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5010` | Backend listen port |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests per 15-min window |
| `MAX_FILE_SIZE` | `10mb` | Upload size limit |

## Startup Behavior

The server validates at boot:

1. **Required variables**: `MONGODB_URI` and `JWT_SECRET` must be set
2. **JWT_SECRET strength**: Must be ≥ 32 characters, cannot be a known weak value
3. If validation fails, the process exits immediately with a descriptive log

## Health Endpoints

| Endpoint | Use case |
|----------|----------|
| `GET /health/live` | Liveness probe (always 200 if process is up) |
| `GET /health/ready` | Readiness probe (200 when DB connected, 503 otherwise) |
| `GET /health` | Full diagnostic payload |
| `GET /metrics` | Error stats, DB state, memory usage |

> **Access control assumption**: `/health*` and `/metrics` are intentionally left
> unauthenticated. They expose internal diagnostics (memory, DB state, error
> stats) and MUST only be reachable from trusted networks. Restrict them to the
> internal network / VPN / firewalled subnet in production (e.g. via a reverse
> proxy allowlist or firewall rules). Do not expose these endpoints directly to
> the public internet.

## Docker Deployment

```sh
# Production with docker-compose
make dev          # builds + starts backend + mongo

# CI test suite
make citest       # builds cicd target, runs all tests
```

### Docker Targets

| Target | Purpose | Base |
|--------|---------|------|
| `dev` | Local development server | `node:25-alpine` |
| `cicd` | CI/CD test suite | `node:25-bookworm` |
| `test` | Generic test runner | `node:25-bookworm` |
| `build` | Frontend production build | `node:25-bookworm` (from deps) |
| `production` | Minimal runtime image | `node:25-alpine` |

All targets use pnpm 11.17.0. The `dev` and `production` targets run as non-root (`appuser`) and include a Docker HEALTHCHECK on `/health/live`.

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT`:

1. Stops accepting new connections
2. Waits for in-flight requests (10s timeout)
3. Closes MongoDB connection
4. Exits

## Monitoring

- **Logs**: Pino JSON logger (stdout). Use `pino-pretty` for dev formatting.
- **Metrics**: `GET /metrics` exposes error counts, DB state, memory, uptime
- **Error tracking**: `errorMonitor` records errors in memory; exposed via metrics

## Frontend Build

```sh
cd frontend
VITE_API_URL="" pnpm build   # empty = relative /api paths (proxied)
```

The frontend expects `/api` to be proxied to the backend. Configure this in your reverse proxy (nginx, Caddy, etc.).

## Troubleshooting

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

### Initial System Admin is forced to change the default password

`backend/scripts/createSystemAdmin.js` creates the initial `systemadmin`
account with the known default password (`mindful`) and sets
`mustChangePassword: true` on the account. The first login succeeds but the
frontend redirects to `/change-password` and blocks the rest of the app until
the password is changed. To avoid the forced change entirely, supply your own
password when running the script:

```sh
SYSTEM_ADMIN_PASSWORD="<strong-password>" node backend/scripts/createSystemAdmin.js
```
