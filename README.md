# RoboSite

Monorepo that powers RoboSite: a web app that generates Vite + React + Tailwind landing pages using OpenAI, builds them, and uploads both source and build output to S3.

## Architecture

- **Web** (`apps/web`): UI for submitting prompts and tracking job status.
- **API** (`apps/api`): creates jobs and exposes status endpoints.
- **Worker** (`apps/worker`): generates files, runs `vite build`, and uploads to S3.
- **Redis**: queue backend for BullMQ.
- **Postgres**: reserved for future metadata storage (optional right now).

## Flow

1. Web authenticates via API and stores a JWT.
2. Web submits `{ clientId, prompt }` to API with the JWT.
3. API saves the job in Postgres, enqueues it in Redis, and returns `jobId`.
4. Worker consumes the job:
   - copies a Vite + React + Tailwind template
   - asks OpenAI for `src/**` + `public/**` files
   - builds the project
   - uploads `siteid/src/**` and `siteid/build/**` to S3
5. Web polls `/api/jobs/:id` for status and result (from Postgres).

## Quick start (Docker, dev mode)

```bash
cp .env.example .env
# fill in your keys

docker compose up --build
```

Open:
- Web: `http://localhost:3000`
- API: `http://localhost:3001/health`

## Local development (without Docker)

```bash
npm install
npm run api
npm run worker
npm run web
```

## Environment variables

Shared values live in `.env` and are loaded by Docker Compose.

**Web**
- `NEXT_PUBLIC_API_URL`

**API**
- `API_PORT`
- `CORS_ORIGIN`
- `REDIS_URL`
- `QUEUE_NAME`
- `JOB_ATTEMPTS`
- `MAX_PROMPT_LENGTH`
- `JWT_SECRET`
- `JWT_TTL`

**Worker**
- `WORKER_CONCURRENCY`
- `ROBOSITE_KEEP_WORKDIR`

**OpenAI**
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_URL`
- `OPENAI_MAX_TOKENS`
- `OPENAI_TIMEOUT_MS`
- `OPENAI_LOG_RESPONSE`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_RESPONSE_FORMAT`
- `OPENAI_ENABLE_JSON_REPAIR`
- `OPENAI_JSON_REPAIR_MODEL`
- `OPENAI_JSON_REPAIR_RESPONSE_FORMAT`
- `OPENAI_JSON_REPAIR_MAX_CHARS`
- `OPENAI_FALLBACK_MODEL`
- `OPENAI_ALLOW_FALLBACK`

**S3 / AWS**
- `S3_BUCKET`
- `S3_PUBLIC_BASE_URL`
- `S3_ENDPOINT`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `AWS_URL_PASSPORTS`, `AWS_BUCKET_PASSPORTS`, `AWS_ENDPOINT_CDN`, `AWS_ENDPOINT`
- `S3_OBJECT_ACL`

**Postgres (required)**
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL`

## Outputs in S3

- `siteid/src/**` — the Vite project source
- `siteid/build/**` — the static build output

## Auth endpoints (API)

- `POST /api/auth/register` → `{ email, password }`
- `POST /api/auth/login` → `{ email, password }`
- `GET /api/me` → `Authorization: Bearer <token>`
