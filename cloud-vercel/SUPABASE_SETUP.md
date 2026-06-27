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

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stores, settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stores, settings TO service_role;
```

## 3. 設定 Vercel 環境變數

在 Vercel Dashboard → Project Settings → Environment Variables 新增：

| 名稱 | 值 | 環境 |
|------|-----|------|
| `SUPABASE_URL` | `https://<project>.supabase.co` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` | Production |
| `NIKKO_CLOUD_SECRET` | 至少 32 字元的隨機值 | Production |
| `NIKKO_ADMIN_USER` | 管理員帳號 | Production |
| `NIKKO_ADMIN_PASS` | 至少 12 字元的強密碼 | Production |
| `NIKKO_MQTT_COMMAND_SECRET` | 與 Pi 完全相同的 HMAC 密鑰 | Production |
| `NIKKO_MQTT_TOPIC_PREFIX` | 與 Pi 完全相同的私有 topic prefix | Production |

## 4. 重新部署

在 Vercel 重新部署後，資料就會寫入 Supabase。

## 備援與限制

若未設定 Supabase，店點可暫存在瀏覽器 localStorage，但遠端 MQTT 指令與連線測試會停用，避免出現資料來源不一致。

## 備份與還原

- 備份：Supabase Dashboard → Database → Backups，或使用 `pg_dump` 匯出 `stores`、`settings`。
- 還原：先還原 schema/migration，再匯入資料；完成後以 Cloud 新增、修改、刪除測試確認。
- `SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel server-side env，禁止使用 `NEXT_PUBLIC_` 前綴。
