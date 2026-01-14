# RoboSite

RoboSite is a small web app that generates a client landing page using OpenAI, builds it as a Vite + React + Tailwind project, and uploads the source + build output to S3.

## What it does

- Takes `clientId` and a prompt from the UI.
- Asks OpenAI to return project files (`src/**`, `public/**`) as JSON.
- Builds the project with `vite build`.
- Uploads to S3:
  - `siteid/src/**` (project source)
  - `siteid/build/**` (static build)

## How it works

1. A Vite + React + Tailwind template is copied from `templates/vite-react-tailwind` into a temp folder.
2. OpenAI returns JSON containing the file list and contents.
3. Files are written into the temp project.
4. `npm install` + `npm run build` are executed.
5. The app uploads `src` and `build` folders to S3.

## Quick start

```bash
cp .env.example .env
# fill in values

docker compose up --build
```

Or run locally:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Environment

Required:
- `OPENAI_API_KEY`
- `S3_BUCKET`
- `AWS_REGION` (or `AWS_DEFAULT_REGION`)

S3 / AWS:
- `S3_PUBLIC_BASE_URL` (used for build URL output)
- `S3_ENDPOINT` (S3-compatible endpoint, e.g. MinIO)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` (optional)
- `S3_OBJECT_ACL` (optional, e.g. `public-read`)

OpenAI:
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_API_URL` (default: `https://api.openai.com/v1/chat/completions`)
- `OPENAI_MAX_TOKENS`
- `OPENAI_TIMEOUT_MS` (0 disables timeout)
- `OPENAI_LOG_RESPONSE` (`true` to log full response on error)
- `OPENAI_FALLBACK_MODEL` (retry model if primary fails)
- `OPENAI_ALLOW_FALLBACK` (`true`/`false`)

JSON repair (optional):
- `OPENAI_ENABLE_JSON_REPAIR` (`true`/`false`)
- `OPENAI_JSON_REPAIR_MODEL` (optional override model)
- `OPENAI_JSON_REPAIR_RESPONSE_FORMAT`
- `OPENAI_JSON_REPAIR_MAX_CHARS`

Dev / debug:
- `ROBOSITE_KEEP_WORKDIR` (`true` keeps the temp build folder)

## Outputs

The generator uploads two folders to S3:
- `siteid/src` (the Vite project)
- `siteid/build` (the static build output)
