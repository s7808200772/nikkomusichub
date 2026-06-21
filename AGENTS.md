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
- 音樂同步使用 rclone + Dropbox。
- 播放器使用 mpv + IPC socket。

## 開發與部署慣例

- Pi 安裝腳本為 `install.sh`，會建立 systemd 服務。
- `requirements.txt` 必須使用有預編譯 wheel 的版本，避免在 Raspberry Pi 上編譯 Rust/C 套件。
- `cloud-vercel/` 的 `lib/db.js` 同時支援 Vercel KV 與本地 JSON 暫存檔。
- 修改程式碼後請同步更新相關 README。

## 預設帳號

- Pi Web UI：`nikkolh` / `topup30%off`
- Cloud Web UI：`nikkolh` / `topup30%off`

首次登入後應立即修改密碼。
