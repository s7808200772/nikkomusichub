# Supabase 設定步驟

本專案使用 Supabase 儲存店點（Stores）與系統設定（Settings）。

## 1. 建立 Supabase 專案

- 前往 https://supabase.com 並建立新專案
- 記下 `Project URL` 與 `Service Role Key`（在 Project Settings → API）

## 2. 建立資料表

進入 Supabase SQL Editor，貼上以下 SQL：

```sql
-- 店點資料表
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 系統設定資料表（只有一筆 global 紀錄）
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 告警資料表
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
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_store_id ON alerts(store_id);

-- OTA 更新紀錄
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
CREATE INDEX idx_update_log_store_id ON update_log(store_id);
CREATE INDEX idx_update_log_created_at ON update_log(created_at DESC);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE update_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stores, settings, alerts, update_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stores, settings, alerts, update_log TO service_role;
```

## 3. 部署 Supabase Edge Function

```bash
# 安裝 Supabase CLI 後登入
npm install -g supabase
supabase login

# 連結你的專案（將 <project-ref> 換成 Supabase project reference）
supabase link --project-ref <project-ref>

# 部署 function 與 migration
supabase functions deploy nikko-cloud-db
supabase db push
```

Edge Function 需要的環境變數（在 Supabase Dashboard → Functions → nikko-cloud-db → Settings）：

| 名稱 | 說明 |
|------|------|
| `SUPABASE_URL` | 專案 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `NIKKO_SUPABASE_PROXY_SECRET` | 與 Vercel 共用的隨機密鑰 |

## 4. 設定 Vercel 環境變數

在 Vercel Dashboard → Project Settings → Environment Variables 新增：

| 名稱 | 值 | 環境 |
|------|-----|------|
| `SUPABASE_URL` | `https://<project>.supabase.co` | Production |
| `NIKKO_SUPABASE_PROXY_SECRET` | Supabase Edge Function 與 Vercel 共用的隨機密鑰 | Production |
| `NIKKO_CLOUD_SECRET` | 至少 32 字元的隨機值 | Production |
| `NIKKO_ADMIN_USER` | 管理員帳號 | Production |
| `NIKKO_ADMIN_PASS` | 至少 8 字元的強密碼 | Production |
| `NIKKO_MQTT_COMMAND_SECRET` | 與 Pi 完全相同的 HMAC 密鑰 | Production |
| `NIKKO_MQTT_TOPIC_PREFIX` | 與 Pi 完全相同的私有 topic prefix | Production |
| `NIKKO_MQTT_CA` | PEM 編碼的 broker Root CA | Production |
| `NIKKO_MQTT_TLS_SERVERNAME` | broker TLS SNI 名稱 | Production |
| `NIKKO_MQTT_TLS_VERIFY` | 是否驗證 broker 憑證；設 `0` 可連自簽憑證（僅測試） | Production |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API token（選填） | Production |
| `LINE_USER_ID` | 接收告警的 LINE user ID（選填） | Production |
| `NIKKO_WEBHOOK_URL` | 通用告警 webhook URL（選填） | Production |

## 5. 重新部署

在 Vercel 重新部署後，資料就會寫入 Supabase。

## 備援與限制

若未設定 Supabase，店點可暫存在瀏覽器 localStorage，但遠端 MQTT 指令與連線測試會停用，避免出現資料來源不一致。

## 備份與還原

- 備份：Supabase Dashboard → Database → Backups，或使用 `pg_dump` 匯出 `stores`、`settings`、`alerts`、`update_log`。
- 還原：先還原 schema/migration，再匯入資料；完成後以 Cloud 新增、修改、刪除測試確認。
- `NIKKO_SUPABASE_PROXY_SECRET` 只能放在 Vercel server-side env，禁止使用 `NEXT_PUBLIC_` 前綴。
- Supabase Edge Function `nikko-cloud-db` 代替 Vercel 直接持有 service-role key；資料表仍只允許 service role 存取。
