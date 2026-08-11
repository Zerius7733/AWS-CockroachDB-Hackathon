# Northstar agentic memory architecture

## Hackathon fit

Northstar is an agentic job-application workspace. A candidate uploads a PDF resume, reviews the extracted career memories, and asks the agent to evaluate a job. The agent retrieves semantically relevant memories before producing an evidence-backed match report.

Required integrations:

1. **CockroachDB Distributed Vector Indexing** stores 1536-dimensional embeddings and retrieves memories using cosine distance.
2. **CockroachDB Cloud MCP Server** lets an agent inspect the live memory schema, query memory counts, and explain retrieval queries with an auditable, read-only tool set.
3. **Amazon ECS** runs the containerized web and agent service on AWS.

OpenAI supplies resume extraction, embeddings, and the reasoning model. It is an additional model provider, not a substitute for the required CockroachDB or AWS integrations.

## Request flow

```text
Browser
  | PDF resume / job description
  v
Northstar on Amazon ECS
  |-- OpenAI Responses API: grounded resume extraction + job evaluation
  |-- OpenAI Embeddings API: resume and job vectors
  v
CockroachDB Cloud
  |-- candidate_profiles: structured candidate summary
  |-- candidate_memories: inspectable facts + VECTOR(1536)
  `-- distributed cosine vector index: relevant memory retrieval

Codex / MCP-compatible agent
  `-- CockroachDB Cloud MCP: schema inspection, SELECT, EXPLAIN, audit
```

## Safety boundary

- Resume facts include a source filename and confidence score.
- The user can inspect and delete individual memories.
- Job matches cite the exact candidate memories used.
- The agent is instructed never to invent qualifications.
- Applying to a job remains a user-approved external action.
- MCP is configured with read-only tools for the demo.

## Storage adapter

`agent/memory-store.js` retains a JSON fallback for isolated module development. The integrated Northstar server requires `DATABASE_URL` because it initializes the application tracker schema at startup. Every runnable local or deployed instance therefore uses CockroachDB for both tracker data and agent memory.
