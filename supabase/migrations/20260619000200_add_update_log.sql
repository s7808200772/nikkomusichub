-- OTA update log table
CREATE TABLE IF NOT EXISTS update_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('ota_update', 'rollback')),
    status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
    version_before TEXT,
    version_after TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_update_log_store_id ON update_log(store_id);
CREATE INDEX IF NOT EXISTS idx_update_log_created_at ON update_log(created_at DESC);

ALTER TABLE update_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_update_log ON update_log FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
