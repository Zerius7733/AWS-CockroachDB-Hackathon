# Northstar

Northstar is a job application tracker with an evidence-backed career-memory agent. Upload a PDF resume, inspect the facts the agent remembers, and evaluate job descriptions using semantically retrieved candidate experience.

## Hackathon integrations

- **CockroachDB Distributed Vector Indexing:** persistent career memories and cosine-similarity retrieval.
- **CockroachDB Cloud MCP Server:** read-only agent inspection of the live memory schema and retrieval queries.
- **Amazon ECS:** containerized deployment of the web application and agent API.
- **OpenAI:** structured resume extraction, embeddings, and job-match reasoning.

See [the architecture](docs/ARCHITECTURE.md) and [MCP setup](docs/MCP_SETUP.md).

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Add `OPENAI_API_KEY` and `DATABASE_URL` to `.env`. Without `DATABASE_URL`, the career agent uses local demo storage; this is useful for development but is not hackathon-compliant.

Open `http://localhost:5173`. Application data is persisted in `data/applications.csv`; editable workspace profile details are stored in `data/profile.csv`.

Open **Career agent** to upload a resume and run a memory-backed job match.

## CockroachDB memory schema

The agent initializes [`db/memory.sql`](db/memory.sql) on the first memory request. It creates `candidate_profiles` and `candidate_memories`, including a user-prefixed cosine vector index. This schema is isolated from the existing application/profile tables so the CSV migration can proceed independently.

## Deploy on AWS ECS

Build the included Dockerfile, push it to Amazon ECR, and run it as an ECS service with these secrets injected into the task:

```text
OPENAI_API_KEY
DATABASE_URL
OPENAI_MODEL (optional)
OPENAI_EMBEDDING_MODEL (optional)
```

Expose container port `3001` through an Application Load Balancer. Do not bake `.env` into the image.

The live CSV files are intentionally excluded from Git because they contain personal information. On a fresh installation, Northstar creates an empty `data/applications.csv` automatically. The `.example.csv` files document the expected columns without publishing real application data.

## Chrome extension

The companion extension reads the job posting in your active tab, pre-fills the details it can find, and flags missing fields for review before anything is saved.

1. Start Northstar with `npm run dev` or `npm start`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `extension` folder in this project.
5. Pin **Northstar Job Capture**, open a job posting, and click the extension.

The first save asks for permission to connect to your Northstar address. This copy defaults to `https://application-tracker-production-2208.up.railway.app`. You can change the destination at any time under **Connection settings** in the extension.

## Deploy to Railway

Connect this repository to Railway. The included `railway.json` builds the Vite client and starts the Express server. Add a Railway volume mounted at `/app/data` if you want the CSV file to survive container replacements and redeploys. Without a volume, it persists only for the lifetime of the current container.
