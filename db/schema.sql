CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Applied',
  applied_date DATE,
  next_step TEXT NOT NULL DEFAULT '',
  next_date DATE,
  source TEXT NOT NULL DEFAULT '',
  salary TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  sort_key INT8 NOT NULL DEFAULT unique_rowid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_status_idx
  ON applications (status);

CREATE INDEX IF NOT EXISTS applications_sort_key_idx
  ON applications (sort_key DESC);

CREATE INDEX IF NOT EXISTS applications_applied_date_idx
  ON applications (applied_date DESC);

CREATE INDEX IF NOT EXISTS applications_next_date_idx
  ON applications (next_date)
  WHERE next_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS profiles (
  workspace_id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
