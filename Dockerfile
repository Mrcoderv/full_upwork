# ----------------------------
# deps (backend only — enough for dev target)
# ----------------------------
FROM node:25-alpine AS deps
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

COPY package*.json ./
COPY backend/package*.json backend/
RUN npm ci --prefix backend --no-audit --no-fund

COPY frontend/package*.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund


# ----------------------------
# test-base
# ----------------------------
FROM node:25-alpine AS test-base
RUN apk add --no-cache make
RUN npm install -g npm@10
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

COPY --from=deps $APP_HOME ./
COPY package*.json ./
COPY Makefile ./
RUN npm ci --no-audit --no-fund


# ----------------------------
# cicd
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
# development backend server
# ----------------------------
FROM node:25-alpine AS dev
RUN npm install -g npm@10
ENV APP_HOME=/app NODE_ENV=test
WORKDIR $APP_HOME

RUN mkdir -p logs public/uploads
COPY --from=deps $APP_HOME ./

EXPOSE 5001
CMD ["node", "backend/index.js"]
