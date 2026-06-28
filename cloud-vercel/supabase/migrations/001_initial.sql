-- Stores table for NikkoMusicHub Cloud
CREATE TABLE IF NOT EXISTS stores (
    store_id TEXT PRIMARY KEY,
    store_name TEXT NOT NULL,
    device_id TEXT DEFAULT '',
    role TEXT DEFAULT 'store' CHECK (role IN ('store', 'backup', 'test')),
    mqtt_broker TEXT NOT NULL,
    mqtt_port INTEGER NOT NULL DEFAULT 8883,
    mqtt_username TEXT DEFAULT '',
    mqtt_password TEXT DEFAULT '',
    mqtt_tls BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cloud-wide settings key/value table
CREATE TABLE IF NOT EXISTS cloud_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS so no anonymous access
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_settings ENABLE ROW LEVEL SECURITY;

-- Only service-role / Edge Function accesses these tables directly.
-- Application users are authenticated by the Edge Function secret, not Postgres RLS.
CREATE POLICY deny_all_stores ON stores FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY deny_all_settings ON cloud_settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
