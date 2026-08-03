# AGENTS.md

## Useful commands
- Run tests: `make citest`
- Run linter: `make format`

## Environment
- Node.js 25+ for the backend
- MongoDB, port 27017, `make dev`

## JS Style Guide
- NEVER introduce polyfills for tests
- NEVER mock module-internal code ONLY mock external dependencies

## Repo layout
- `backend/`: Node/Express API (ESM, Mongoose); entrypoint `backend/index.js`
- `backend/src/config/cookies.js`: Centralized auth cookie config (`AUTH_COOKIE_NAME`, `setAuthCookie`, `clearAuthCookie`)
- `backend/src/router/*.js` has web-facing endpoints.
- `frontend/`: Vue 3 + Vite app (Vuetify); alias `@` -> `frontend/src`, `/api` proxied to `http://localhost:5001`
- `docker-compose.yml`: backend + mongo for local dev & tests
- `Dockerfile`: multi-stage for cicd and local container testing
- `generate-docs.js`: OpenAI-based JSDoc annotator (needs `OPENAI_API_KEY`)
