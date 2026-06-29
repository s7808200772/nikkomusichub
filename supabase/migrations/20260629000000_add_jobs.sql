-- Async job state table (OTA / batch commands)
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_key TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    pending INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    no_response INTEGER NOT NULL DEFAULT 0,
    stores JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_jobs ON jobs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
