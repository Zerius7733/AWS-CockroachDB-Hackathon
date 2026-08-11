# Northstar

Northstar is a job application tracker with an evidence-backed career-memory agent. Upload a PDF resume, inspect the facts the agent remembers, and search live public job listings using persistent candidate experience.

## Hackathon integrations

- **CockroachDB Distributed Vector Indexing:** persistent career memories and cosine-similarity retrieval.
- **CockroachDB Cloud MCP Server:** read-only agent inspection of the live memory schema and retrieval queries.
- **Amazon ECS or Lambda:** containerized or serverless deployment with per-user data isolation.
- **OpenAI:** structured resume extraction, embeddings, live web job discovery, and memory-backed ranking.

See [the architecture](docs/ARCHITECTURE.md) and [MCP setup](docs/MCP_SETUP.md).

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Add `DATABASE_URL` and `OPENAI_API_KEY` to `.env`. Use the General connection string from CockroachDB Cloud's **Connect** dialog and keep `sslmode=verify-full` enabled. The npm scripts load `.env` automatically for local development.

Open `http://localhost:5173`. Application and profile data are persisted in CockroachDB. The server creates the required tables and indexes on startup. CSV import/export remains available for backups and portability.

Create an account from the sign-in screen. Credentials and sessions are stored in CockroachDB: passwords are salted and hashed with memory-hard scrypt, while the browser receives only an opaque HTTP-only session cookie. Each application, profile, and career-memory query is constrained by the authenticated user ID. Existing pre-authentication data remains assigned to the `demo-user` database identity and is not exposed to newly registered accounts.

After registering, move your existing local-demo applications and memories into that account once with:

```bash
npm run db:claim-demo -- you@example.com
```

`AUTH_SESSION_DAYS` is optional and defaults to 7 days. Production must run behind HTTPS so the session cookie receives its `Secure` attribute. Password reset and email verification are not yet implemented, so use test accounts until those recovery flows exist.

Open **Career agent** to upload a PDF resume, inspect the durable facts extracted from it, and search current public job listings ranked against that memory. `OPENAI_MODEL` and `OPENAI_EMBEDDING_MODEL` are optional; their defaults are documented in `.env.example`.

Identical job searches are cached per user in CockroachDB. The cache key includes the search preferences and the current résumé-memory contents, so changing memory automatically invalidates prior results. `JOB_SEARCH_CACHE_MINUTES` controls freshness and defaults to 60 minutes; cache hits make no OpenAI or web-search request.

### Migrate existing CSV data

If `data/applications.csv` or `data/profile.csv` exists, migrate it once after setting `DATABASE_URL`:

```bash
npm run db:migrate-csv
```

The migration replaces the applications currently in CockroachDB only when a local applications CSV contains rows. It does not delete the original files.

## CockroachDB memory schema

The agent initializes [`db/memory.sql`](db/memory.sql) on the first memory request. It creates `candidate_profiles`, `candidate_memories`, and `candidate_job_search_cache`, including a user-prefixed cosine vector index. These tables share the application's bounded CockroachDB connection pool while remaining isolated from the application tracker tables in [`db/schema.sql`](db/schema.sql).

## Deploy on AWS ECS

Build the included Dockerfile, push it to Amazon ECR, and run it as an ECS service with these secrets injected into the task:

```text
OPENAI_API_KEY
DATABASE_URL
AUTH_SESSION_DAYS (optional)
OPENAI_MODEL (optional)
OPENAI_EMBEDDING_MODEL (optional)
JOB_SEARCH_CACHE_MINUTES (optional, defaults to 60)
```

Expose container port `3001` through an Application Load Balancer. Do not bake `.env` into the image.

## Chrome extension

The companion extension reads the job posting in your active tab, pre-fills the details it can find, and flags missing fields for review before anything is saved.

1. Start Northstar with `npm run dev` or `npm start`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `extension` folder in this project.
5. Pin **Northstar Job Capture**, open a job posting, and click the extension.

The first save asks for permission to connect to your Northstar address. This copy defaults to `https://application-tracker-production-2208.up.railway.app`. You can change the destination at any time under **Connection settings** in the extension.

## Deploy to Railway

Connect this repository to Railway. The included `railway.json` builds the Vite client and starts the Express server. Add `DATABASE_URL`, `OPENAI_API_KEY`, and optionally the model and pool settings as Railway environment variables. A persistent Railway volume is no longer required.
