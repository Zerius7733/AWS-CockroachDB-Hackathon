# Northstar

Northstar is an evidence-backed career agent and job application workspace. A candidate uploads a PDF résumé, reviews the facts the agent remembers, and searches live public job listings ranked against their actual experience. Applications, career memories, search feedback, and user sessions are isolated per account in CockroachDB.

This repository is a complete hackathon submission. It includes the React client, Express API, CockroachDB schemas and migrations, AI agent services, automated tests, sample CSV data, a Chrome extension, container deployment files, and the documentation needed to configure and run the project.

## Why Northstar

Job searches are fragmented across spreadsheets, browser tabs, job boards, and repeated résumé edits. Generic matching tools also forget why a role fits. Northstar creates a durable, user-controlled career memory and uses it to:

- track applications from discovery through offer or rejection;
- extract inspectable skills, experience, achievements, education, and preferences from a résumé;
- retrieve relevant evidence using CockroachDB vector search;
- discover current public openings and explain each match;
- learn from explicit feedback such as interested, applied, wrong seniority, or hidden company;
- cache identical searches to reduce latency and model usage; and
- keep every user's applications, memories, feedback, and sessions isolated.

Northstar never applies to a job automatically. The candidate reviews memories, results, and external actions.

## Hackathon integrations

| Integration | How Northstar uses it |
| --- | --- |
| CockroachDB Distributed Vector Indexing | Stores 1,536-dimensional career-memory embeddings and retrieves relevant evidence with cosine distance. |
| CockroachDB Cloud | Persists users, sessions, profiles, applications, memories, search caches, and job feedback. |
| CockroachDB Cloud MCP Server | Gives an MCP-compatible agent read-only schema, query, and `EXPLAIN` access for an auditable demo. |
| AWS Lambda Web Adapter / Amazon ECS | Runs the built React client and Express API as one containerized service. |
| OpenAI Responses API | Extracts structured résumé evidence and performs live, grounded job discovery. |
| OpenAI Embeddings API | Converts résumé evidence into vectors stored in CockroachDB. |

See [Architecture](docs/ARCHITECTURE.md) for the request and data flow and [CockroachDB MCP setup](docs/MCP_SETUP.md) for the read-only MCP demo.

## What is included

| Path | Contents |
| --- | --- |
| `src/` | React interface for the tracker, pipeline, insights, profile, and Career agent. |
| `server.js` | Express API, authentication boundary, agent endpoints, and production static hosting. |
| `agent/` | Résumé extraction, embeddings, vector-backed memory, search caching, and job feedback. |
| `lib/` | CockroachDB access, authentication, CSV utilities, and structured logging. |
| `db/` | Application, authentication, vector-memory, cache, and feedback schemas. |
| `scripts/` | Database migration, CSV migration, demo-data claiming, and isolation verification. |
| `test/` | Node test suite covering auth, API errors, CSV handling, caching, feedback, and OpenAI request contracts. |
| `data/` | Example profile and application CSV formats for imports and demos. |
| `extension/` | Unpacked Chrome extension for capturing a job posting into Northstar. |
| `Dockerfile` | Multi-stage production image with AWS Lambda Web Adapter. |
| `railway.json` | Alternative Railway build and start configuration. |
| `.env.example` | Complete environment variable template with safe placeholders. |
| `docs/` | Architecture and CockroachDB MCP documentation. |

Generated dependencies and build output are intentionally excluded. `npm ci` restores the exact dependency tree from `package-lock.json`, and `npm run build` recreates `dist/`.

## Technology stack

- Node.js 22.12–22.x and npm
- React and Vite
- Express
- CockroachDB Cloud with `pg`
- OpenAI Responses and Embeddings APIs
- Lucide React and D3 Sankey
- Node's built-in test runner and Playwright
- Docker, AWS Lambda Web Adapter, Amazon ECR, and AWS Lambda or ECS

## Prerequisites

Required for the full application:

1. Node.js `>=22.12.0 <23` and npm.
2. A CockroachDB Cloud cluster and General connection string.
3. An OpenAI API key with access to the configured response and embedding models.

Optional:

- Docker for container builds.
- AWS CLI and an AWS account for Lambda or ECS deployment.
- Chrome or Chromium for the companion extension.
- An MCP-compatible client for the CockroachDB MCP demonstration.

## Quick start

### 1. Install dependencies

```bash
git clone <repository-url>
cd <repository-directory>
npm ci
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Open `.env` and provide at least:

```dotenv
DATABASE_URL=postgresql://username:password@host:26257/defaultdb?sslmode=verify-full
OPENAI_API_KEY=your_openai_api_key
```

Use the General connection string from CockroachDB Cloud's **Connect** dialog. Keep `sslmode=verify-full` enabled outside disposable local environments. Never commit `.env`; it is ignored by Git.

### 3. Start Northstar

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves the client on port `5173` and proxies `/api` to Express on port `3001`. On first startup, Northstar creates the required CockroachDB tables and indexes.

Create a test account from the sign-in screen. Passwords must contain at least 12 characters.

## Environment variables

All supported values are present in `.env.example`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | CockroachDB General connection string. |
| `OPENAI_API_KEY` | Yes for Career agent AI | — | Server-side credential for résumé extraction, embeddings, and live job search. |
| `DATABASE_POOL_SIZE` | No | `5` in the example | Maximum CockroachDB pool size; keep small for serverless deployments. |
| `RUN_DB_MIGRATIONS` | No | `true` in the example | Creates or updates schemas when the server starts. |
| `OPENAI_MODEL` | No | `gpt-5.6-terra` | Responses model for extraction and job discovery. |
| `OPENAI_EMBEDDING_MODEL` | No | `text-embedding-3-small` | Embedding model matching the `VECTOR(1536)` schema. |
| `OPENAI_TIMEOUT_MS` | No | `90000` | Upstream AI request timeout in milliseconds. |
| `JOB_SEARCH_CACHE_MINUTES` | No | `60` | Freshness window for identical per-user searches. |
| `AUTH_SESSION_DAYS` | No | `7` | Session duration, clamped to 1–30 days. |
| `PORT` | No | `3001` | Express port; the container sets it to `8080`. |

If `OPENAI_API_KEY` is omitted, the tracker remains available but résumé extraction and live job discovery cannot run. The integrated server requires `DATABASE_URL`.

## Demo walkthrough

Use this sequence for a reproducible hackathon demo:

1. Register a test account and open the dashboard.
2. Add an application manually or import an applications CSV.
3. Open **Career agent**. It starts on **Overview**.
4. Upload a PDF résumé smaller than 4 MB.
5. Open **Memory** and inspect the extracted evidence, source filename, and confidence values.
6. Delete one memory to demonstrate user control, if desired.
7. Open **Job search**, choose a location and work mode, and run a live search.
8. Review the match score, evidence-backed reason, source, and direct job URL.
9. Use **Teach agent** on a result, then run a fresh search to demonstrate durable feedback.
10. Show **Applications**, **Pipeline**, and **Insights** to demonstrate the end-to-end workflow.

Fresh searches target ten distinct verified jobs. Northstar performs one broader expansion pass when too few direct public URLs survive validation, but it does not invent listings to fill the result count. Repeating an identical search within the configured freshness window returns the CockroachDB cache without another AI or web-search request.

## Example data and CSV import

The repository includes safe templates:

- `data/applications.example.csv` documents the application import columns.
- `data/profile.example.csv` contains a sample candidate profile.

To import applications through the interface, copy the example file, add rows, sign in, and use **Import CSV**. Imports replace the signed-in user's current application list only after a valid non-empty file is submitted. **Export CSV** creates a portable backup.

For legacy repository CSV data, create `data/applications.csv` and optionally `data/profile.csv`, configure `DATABASE_URL`, then run:

```bash
npm run db:migrate-csv
```

This migration writes to the legacy `demo-user` identity and does not delete the source files. After registering the intended account, claim that demo data once with:

```bash
npm run db:claim-demo -- you@example.com
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Runs Express in watch mode and Vite with API proxying. |
| `npm run build` | Creates the production React bundle in `dist/`. |
| `npm start` | Starts Express, which serves the API and the built `dist/` client. |
| `npm run preview` | Previews an existing Vite production build. |
| `npm test` | Runs all automated Node and extension tests. |
| `npm run test:extension` | Runs only the Chrome extraction tests. |
| `npm run db:migrate` | Initializes the application and career-memory schemas explicitly. |
| `npm run db:migrate-csv` | Migrates legacy CSV files into the `demo-user` workspace. |
| `npm run db:claim-demo -- <email>` | Assigns legacy demo data to a registered account. |
| `npm run db:verify-isolation` | Verifies per-user data isolation against the configured database. |

## Validate the submission

Run the same checks used during development:

```bash
npm ci
npm test
npm run build
```

A successful build produces `dist/index.html` and versioned assets. For a production-style local check:

```bash
npm start
```

Then open [http://localhost:3001](http://localhost:3001) and verify [http://localhost:3001/health](http://localhost:3001/health) returns `{"ok":true}`.

## Data and agent architecture

Northstar uses one bounded CockroachDB connection pool. `db/schema.sql` defines application, profile, user, and session storage. `db/memory.sql` defines:

- `candidate_profiles` for the extracted candidate summary;
- `candidate_memories` for inspectable facts and 1,536-dimensional embeddings;
- `candidate_job_search_cache` for per-user freshness caching; and
- `candidate_job_feedback` for durable search preferences.

The memory schema includes a user-prefixed cosine vector index. Every application, memory, cache, feedback, profile, and session query is constrained by the authenticated user identity.

## Chrome extension

The included extension reads a job posting in the active tab, pre-fills the details it can identify, and asks the user to review missing fields before saving.

1. Start Northstar with `npm run dev` or `npm start`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository's `extension/` directory.
5. Pin **Northstar Job Capture**, open a job posting, and select the extension.
6. In **Connection settings**, set the Northstar address to your local or deployed application.

Chrome requests host permission before the first save to a new Northstar address.

## Container and AWS deployment

The multi-stage `Dockerfile` builds the React client and packages it with Express. AWS Lambda Web Adapter exposes the server through a Lambda Function URL on port `8080`, so the submission does not require separate frontend hosting or API Gateway.

### 1. Run migrations once

From a trusted environment with `DATABASE_URL` configured:

```bash
npm run db:migrate
```

### 2. Build the image

Match the image architecture to the Lambda or ECS target:

```bash
docker build --platform linux/amd64 -t northstar .
```

Push the image to Amazon ECR and create an image-based Lambda function or ECS service. Do not copy `.env` into the image; provide secrets through the deployment environment or a managed secret service.

For Lambda, configure at least 2 GB memory, a 120-second timeout, and a Function URL. The image provides `PORT=8080`, `AWS_LWA_PORT=8080`, `DATABASE_POOL_SIZE=1`, and `RUN_DB_MIGRATIONS=false`. Add `DATABASE_URL`, `OPENAI_API_KEY`, and any optional model, cache, or session settings in the function configuration.

The same image runs on ECS or another container platform by routing traffic to port `8080`. Set `RUN_DB_MIGRATIONS=true` only when startup-time schema changes are intentional.

## Railway deployment

As an alternative hosted demo, connect the repository to Railway. `railway.json` runs `npm run build` and `npm start`. Configure `DATABASE_URL`, `OPENAI_API_KEY`, and any optional environment values in Railway. No persistent filesystem volume is required because durable state lives in CockroachDB.

## Security and current limitations

- Passwords are salted and hashed with memory-hard `scrypt`.
- The browser receives an opaque HTTP-only session cookie; production cookies are secure behind HTTPS.
- All user-owned database operations are scoped by authenticated user ID.
- Uploaded résumés must be PDFs smaller than 4 MB.
- Résumé facts retain source and confidence metadata and can be deleted by the user.
- Job discovery is limited to direct public HTTP(S) URLs returned by live search.
- MCP tools should remain read-only for the hackathon demonstration.
- Password reset and email verification are not implemented; use test accounts for the demo.
- Job application submission remains a user-controlled action outside Northstar.

## Additional documentation

- [Agentic memory architecture](docs/ARCHITECTURE.md)
- [CockroachDB Cloud MCP setup](docs/MCP_SETUP.md)
- [Environment template](.env.example)
- [Application CSV template](data/applications.example.csv)
- [Profile CSV template](data/profile.example.csv)
