#!/usr/bin/env bash
set -euo pipefail

# ── Colours ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✘]${NC} $*"; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=5010
FRONTEND_PORT=5173
MONGO_PORT=27017

# ── 0. Generate JWT_SECRET if placeholder ───────────
ENV_FILE="$ROOT/backend/.env.development"
if [ -f "$ENV_FILE" ]; then
  if grep -q "REPLACE_WITH_GENERATED_SECRET" "$ENV_FILE"; then
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sed -i "s|REPLACE_WITH_GENERATED_SECRET_MIN_32_CHARS|$SECRET|" "$ENV_FILE"
    log "Generated new JWT_SECRET"
  fi
fi

# ── 1. Check / start MongoDB ────────────────────────
if command -v mongod &>/dev/null; then
  if pgrep -x mongod &>/dev/null; then
    log "MongoDB already running on port $MONGO_PORT"
  else
    warn "Starting MongoDB..."
    mongod --dbpath /data/db --bind_ip_all --fork --logpath /tmp/mongod.log 2>/dev/null || \
    mongod --dbpath "$HOME/mongo-data" --bind_ip_all --fork --logpath /tmp/mongod.log 2>/dev/null || \
    mongod --bind_ip_all --fork --logpath /tmp/mongod.log 2>/dev/null || {
      err "Failed to start MongoDB. Install mongod or start it manually."
      exit 1
    }
    sleep 2
    log "MongoDB started on port $MONGO_PORT"
  fi
elif docker info &>/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q mindful_mongo; then
    log "MongoDB container already running"
  else
    warn "Starting MongoDB via Docker..."
    docker compose -f "$ROOT/docker-compose.yml" up -d mongo
    sleep 3
    log "MongoDB started via Docker"
  fi
  MONGO_PORT=27018
else
  err "No mongod binary or Docker found. Install one and retry."
  exit 1
fi

# ── 2. Install dependencies ─────────────────────────
log "Checking dependencies..."
if [ ! -d "$ROOT/node_modules" ]; then
  warn "Installing root dependencies..."
  (cd "$ROOT" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
fi
if [ ! -d "$ROOT/backend/node_modules" ]; then
  warn "Installing backend dependencies..."
  (cd "$ROOT/backend" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  warn "Installing frontend dependencies..."
  (cd "$ROOT/frontend" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
fi
log "Dependencies ready"

# ── 3. Kill any existing processes on our ports ──────
for port in $BACKEND_PORT $FRONTEND_PORT; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "Killing process on port $port (PID $pid)"
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
done

# ── 4. Start backend ────────────────────────────────
log "Starting backend on port $BACKEND_PORT..."
(cd "$ROOT/backend" && node index.js &>"$ROOT/backend.log") &
BACKEND_PID=$!
sleep 3

if kill -0 $BACKEND_PID 2>/dev/null; then
  if curl -sf "http://localhost:$BACKEND_PORT/health/live" &>/dev/null; then
    log "Backend running (PID $BACKEND_PID) → http://localhost:$BACKEND_PORT"
  else
    warn "Backend started but health check pending..."
  fi
else
  err "Backend failed to start. Check $ROOT/backend.log"
  tail -20 "$ROOT/backend.log" 2>/dev/null
  exit 1
fi

# ── 5. Start frontend ───────────────────────────────
log "Starting frontend on port $FRONTEND_PORT..."
(cd "$ROOT/frontend" && npx vite --host &>"$ROOT/frontend.log") &
FRONTEND_PID=$!
sleep 4

if kill -0 $FRONTEND_PID 2>/dev/null; then
  if curl -sf "http://localhost:$FRONTEND_PORT" &>/dev/null; then
    log "Frontend running (PID $FRONTEND_PID) → http://localhost:$FRONTEND_PORT"
  else
    warn "Frontend started but still compiling..."
  fi
else
  err "Frontend failed to start. Check $ROOT/frontend.log"
  tail -20 "$ROOT/frontend.log" 2>/dev/null
  exit 1
fi

# ── 6. Print summary ────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Mindful Learning — App is running!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Frontend:  ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  Backend:   ${GREEN}http://localhost:$BACKEND_PORT${NC}"
echo -e "  MongoDB:   ${GREEN}localhost:$MONGO_PORT${NC}"
echo ""
echo -e "  ${YELLOW}Test Accounts:${NC}"
echo -e "  ┌──────────────┬────────────────────┬──────────────┐"
echo -e "  │ Role         │ Email              │ Password     │"
echo -e "  ├──────────────┼────────────────────┼──────────────┤"
echo -e "  │ Admin        │ admin@mindful.se   │ Admin123!    │"
echo -e "  │ Teacher      │ teacher@mindful.se │ Teacher123!  │"
echo -e "  │ User         │ user@mindful.se    │ User12345!   │"
echo -e "  └──────────────┴────────────────────┴──────────────┘"
echo ""
echo -e "  Logs:      $ROOT/backend.log"
echo -e "             $ROOT/frontend.log"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ── 7. Cleanup on exit ──────────────────────────────
cleanup() {
  echo ""
  warn "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  log "Stopped"
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
