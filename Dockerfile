#syntax=docker/dockerfile:1
# ----------------------------
# deps — install all deps (cached layer)
# ----------------------------
FROM node:25-bookworm AS deps
ENV APP_HOME=/app
WORKDIR $APP_HOME

RUN npm install -g pnpm@11.17.0

# Copy only manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Use BuildKit cache mount for the pnpm store
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile


# ----------------------------
# test-base — full node image with make + MMS binary pre-cached
# ----------------------------
FROM node:25-bookworm AS test-base
RUN apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

RUN npm install -g pnpm@11.17.0

COPY --from=deps $APP_HOME ./
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY Makefile ./

# Pre-download MongoDB binary for MMS so tests don't time out in Docker
ENV MONGOMS_DOWNLOAD_DIR=/root/.cache/mongodb-binaries
RUN mkdir -p /root/.cache/mongodb-binaries
RUN cd /app/backend && node --input-type=commonjs -e 'var MMS = require("mongodb-memory-server"); MMS.MongoMemoryServer.create().then(function(s){console.log("MMS ready");s.stop()}).catch(function(e){console.error("fail:",e.message)})' || true


# ----------------------------
# cicd — source + tests (used by make citest)
# ----------------------------
FROM test-base AS cicd
COPY backend ./backend
COPY frontend ./frontend
CMD ["make", "test"]


# ----------------------------
# test runner
# ----------------------------
FROM test-base AS test
CMD ["make", "test"]


# ----------------------------
# build — frontend production build
# ----------------------------
FROM deps AS build
WORKDIR $APP_HOME
COPY frontend ./frontend
RUN cd frontend && pnpm run build


# ----------------------------
# development backend server (alpine, non-root, healthcheck)
# ----------------------------
FROM node:25-alpine AS dev
RUN npm install -g pnpm@11.17.0
ENV APP_HOME=/app
WORKDIR $APP_HOME

RUN mkdir -p logs public/uploads
COPY --from=deps $APP_HOME ./
COPY backend ./backend

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup $APP_HOME
USER appuser

EXPOSE 5010
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5010/health/live || exit 1
CMD ["node", "backend/index.js"]


# ----------------------------
# production — minimal runtime image
# ----------------------------
FROM node:25-alpine AS production
RUN npm install -g pnpm@11.17.0
ENV APP_HOME=/app NODE_ENV=production
WORKDIR $APP_HOME

# Copy full workspace from deps (preserves pnpm symlinks)
COPY --from=deps $APP_HOME ./
COPY backend ./backend
COPY --from=build $APP_HOME/frontend/dist ./frontend/dist
COPY frontend/package.json ./frontend/

# Prune devDependencies to slim the image
RUN pnpm prune --prod

RUN mkdir -p logs public/uploads

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup $APP_HOME
USER appuser

EXPOSE 5010
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5010/health/live || exit 1
CMD ["node", "backend/index.js"]
