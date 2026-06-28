-- Alerts table for NikkoMusicHub Cloud
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical', 'offline')),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_store_id ON alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged_at);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_alerts ON alerts FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
