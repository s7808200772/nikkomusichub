# NikkoMusicHub Cloud (Vercel 版)

這是中央管理平台的 **Vercel 可部署版本**，讓你可以透過一個網址登入，管理各地 Raspberry Pi。

> ⚠️ 注意：Vercel Serverless Functions 有執行時間限制（Hobby 10 秒、Pro 60 秒），不適合長期保持連線。後期建議遷移到 VPS。此版本是為了「先跑上」而設計的過渡方案。

## 功能

- 網頁登入（JWT + cookie）
- 管理店點（Tailscale IP、SSH 帳號密碼）
- Dashboard 查看各店狀態
- 遠端執行預定義指令（播放控制、同步、重啟、重開機）
- Commands 頁面以圖示卡片列出所有店點
- 全域設定：Dropbox Token、Dropbox 音樂目錄
- 資料儲存：本地開發用 JSON 暫存檔，生產環境建議使用 Vercel KV

## 本地開發

```bash
cd cloud-vercel
npm install
npm run dev
```

開啟 http://localhost:3000

預設帳號：`nikkolh`  
預設密碼：`topup30%off`

## 部署到 Vercel

### 1. 建立 Vercel 專案

```bash
cd cloud-vercel
npx vercel
```

### 2. 設定環境變數

在 Vercel Dashboard → Project Settings → Environment Variables 新增：

| 變數名稱 | 說明 |
|----------|------|
| `NIKKO_ADMIN_USER` | 管理員帳號，建議改為非預設值 |
| `NIKKO_ADMIN_PASS` | 管理員密碼，建議改為強密碼 |
| `NIKKO_CLOUD_SECRET` | JWT 簽章密鑰，使用隨機長字串 |
| `KV_REST_API_URL` | （可選）Vercel KV URL |
| `KV_REST_API_TOKEN` | （可選）Vercel KV Token |

### 3. 關於資料儲存

- **無 KV**：店點資料存在記憶體 / 本地 JSON 暫存檔，每次重新部署或冷啟動會重置。適合 demo。
- **有 KV**：店點資料會持久化。在 Vercel Dashboard 安裝 KV storage 並取得 URL / Token。

### 4. Pi 端準備

1. 各店 Pi 必須完成 NikkoMusicHub 安裝（上層 `install.sh`）
2. 確保 Cloud 平台能透過 Tailscale 連到 Pi 的 Tailscale IP
3. 確保 Pi 的 SSH 允許帳號密碼登入（或 Cloud 平台可連入的使用者帳密）

### 5. 新增店點

登入後到 `/stores`，填入：
- Store ID、店名
- Tailscale IP
- SSH 使用者（預設 pi）
- SSH 密碼

### 6. 設定 Dropbox

到 `/settings` 填入：
- Dropbox Access Token
- Dropbox 音樂目錄路徑（例如 `/Music`）

## 技術限制

- SSH 指令若超過 Vercel timeout 會被中斷
- 不建議用於 30+ 店大規模管理
- 後期請遷移到 `cloud/`（VPS 版）

## 目錄結構

```
cloud-vercel/
├── app/
│   ├── api/
│   │   ├── auth/route.js
│   │   ├── stores/route.js
│   │   ├── command/route.js
│   │   └── settings/route.js
│   ├── commands/
│   ├── login/
│   ├── settings/
│   ├── stores/
│   ├── DashboardClient.js
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/
│   └── Navbar.js
├── lib/
│   ├── auth.js
│   ├── db.js
│   └── ssh.js
├── README.md
├── jsconfig.json
├── next.config.js
└── package.json
```
