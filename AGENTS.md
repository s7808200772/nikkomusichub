# AGENTS.md

本專案為 Raspberry Pi 門市音樂管理系統，包含三個子系統：

- `app/`：Pi 端 FastAPI 本機管理 + MQTT 客戶端
- `cloud/`：VPS 版 FastAPI 中央管理平台
- `cloud-vercel/`：Vercel 版 Next.js 中央管理平台

## 技術決策

- Python 3.12+ on Pi；FastAPI + Jinja2 傳統 SSR 模板。
- `cloud-vercel/` 使用 Next.js App Router + Serverless Function。
- Cloud 與 Pi 之間使用 MQTT 溝通：
  - Cloud 發布指令到 `nikko/<storeId>/cmd`
  - Pi 回傳結果到 `nikko/<storeId>/resp`
  - Pi 定期發布狀態到 `nikko/<storeId>/status`
- 不再需要 Tailscale、不再需要 SSH。
- Pi 本機 API 仍綁定 `127.0.0.1:8080`，只接受本機存取。
- 音樂同步使用 rclone + QNAP NAS WebDAV（經 Tailscale 內網）。
- 預設 WebDAV URL：`http://100.106.208.65:5005/`，remote：`qnapmusic:NikkoMusic`，本地：`/srv/nikko-music/music`。
- 播放器使用 mpv + IPC socket。

## 開發與部署慣例

- Pi Web UI 使用 HTMX 做 SPA 式導覽，左側邊欄包含選單與系統狀態面板，切換頁面時不會重新載入。
- Pi 安裝腳本為 `install.sh`，會建立 systemd 服務。
- `requirements.txt` 必須使用有預編譯 wheel 的版本，避免在 Raspberry Pi 上編譯 Rust/C 套件。
- `cloud-vercel/` 的 `lib/db.js` 使用 Supabase 作為正式資料庫；若未設定，僅允許瀏覽器 localStorage 預覽，遠端 MQTT 指令與連線測試必須停用。
- MQTT 正式路徑必須啟用 TLS，並使用 Cloud/Pi 共用的 HMAC command secret、私有 topic prefix、時效檢查與防重放。

## 管理帳號

- 帳號預設為 `nikkolh`，密碼不得寫入 Git 或文件。
- Pi 初始密碼預設為 `topup30%off`（也會寫入 `/srv/nikko-music/data/initial-admin-password`），首次登入後必須修改。
- Cloud 帳密與 JWT secret 只允許從 Vercel encrypted environment variables 讀取。
