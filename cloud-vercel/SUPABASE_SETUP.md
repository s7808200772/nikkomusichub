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

-- 設定 RLS：只允許 service role 存取（已經預設，除非開啟 RLS）
```

## 3. 設定 Vercel 環境變數

在 Vercel Dashboard → Project Settings → Environment Variables 新增：

| 名稱 | 值 | 環境 |
|------|-----|------|
| `SUPABASE_URL` | `https://<project>.supabase.co` | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` | Production |

## 4. 重新部署

在 Vercel 重新部署後，資料就會寫入 Supabase。

## 備援：本機 JSON

若未設定 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`，系統會自動把資料存在專案目錄下的 `.nikko-cloud-db.json`（僅供本機開發用，Vercel 每次部署會重置）。
