# Connect CockroachDB Cloud MCP

Northstar uses the CockroachDB Cloud MCP server as its second required CockroachDB tool. The project configuration deliberately enables only read and inspection tools so the agent can demonstrate the memory layer without silently changing user data.

## 1. Get the cluster ID

Open the CockroachDB Cloud cluster. Copy the ID from the URL:

```text
https://cockroachlabs.cloud/cluster/CLUSTER_ID/overview
```

## 2. Configure authentication

OAuth is preferred because its tokens are short-lived:

```bash
export COCKROACH_CLUSTER_ID="your-cluster-id"
codex mcp login cockroachdb-cloud
```

For a service account instead, create one in CockroachDB Cloud, grant only the role needed for the staging cluster, create an API key, and export both values before starting Codex:

```bash
export COCKROACH_CLUSTER_ID="your-cluster-id"
export COCKROACH_MCP_API_KEY="your-service-account-secret"
```

Never commit the service-account secret. `.codex/config.toml` reads it from the environment.

## 3. Restart and verify Codex

Restart the Codex app or IDE extension from an environment containing those variables. Then check:

```bash
codex mcp list
```

In an interactive Codex session, enter `/mcp`. `cockroachdb-cloud` should be connected.

Useful demo prompts:

```text
List the tables that store Northstar candidate memory.
Show the schema of candidate_memories.
Count memories by category for demo-user.
Explain the vector search query used to retrieve memories for a job match.
```

## Configuration

The active local configuration is `.codex/config.toml`. A shareable template is committed as `.codex/config.example.toml`.

The Cloud MCP endpoint requires both an authorization mechanism and the `mcp-cluster-id` header. Codex supports both through `bearer_token_env_var` and `env_http_headers`.
