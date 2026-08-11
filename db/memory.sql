CREATE TABLE IF NOT EXISTS candidate_profiles (
  user_id STRING PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  summary STRING NOT NULL,
  target_roles STRING[] NOT NULL DEFAULT ARRAY[]::STRING[],
  years_experience DECIMAL NOT NULL DEFAULT 0,
  source_name STRING NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidate_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id STRING NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category STRING NOT NULL,
  title STRING NOT NULL,
  content STRING NOT NULL,
  source_name STRING NOT NULL,
  confidence DECIMAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  verified BOOL NOT NULL DEFAULT false,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX candidate_memories_user_idx (user_id),
  VECTOR INDEX candidate_memories_embedding_idx (user_id, embedding vector_cosine_ops)
);

CREATE TABLE IF NOT EXISTS candidate_job_search_cache (
  user_id STRING NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  search_key STRING NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, search_key),
  INDEX candidate_job_search_cache_created_idx (user_id, created_at DESC)
);
