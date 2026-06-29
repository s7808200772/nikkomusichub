# AGENTS.md

本專案為 Raspberry Pi 門市音樂管理系統，目前實際運作架構：

- `app/`：Pi 端 FastAPI 本機管理 + MQTT 客戶端。
- `cloud-vercel/`：Vercel Next.js 中央管理後台。
- Pi 與 Cloud 透過私有 MQTT broker（EMQX 114.55.1.51:8883，建議 TLS 1.3；TLS 憑證驗證可透過環境變數關閉）溝通。
- Cloud 與 Pi 之間的 MQTT 指令使用 HMAC 簽名、時效、防重放、白名單與危險指令二次確認。

## 技術決策

- Python 3.12+ on Pi；FastAPI + Jinja2 SSR 模板（`app/templates/`）。
- `cloud-vercel/` 使用 Next.js App Router + Serverless Function；介面採用左側側邊欄，與 Pi 端風格一致。
- Cloud 主要頁面：
  - `/`：總覽控制台（含 Dashboard 與遠端指令）
  - `/stores`：店點管理（含 Store 列表、Library 同步、OTA、預設 Broker）
  - `/monitoring`：監控與紀錄（含告警與遠端 Log）
- MQTT topic：
  - 指令：`nikko/<storeId>/cmd`
  - 回應：`nikko/<storeId>/resp`
  - 狀態：`nikko/<storeId>/status`（retain）
- Pi 本機 API 綁定 `127.0.0.1:8080`，僅接受本機存取；外部透過 Tailscale 或反向代理。
- 音樂同步：rclone + QNAP NAS WebDAV over Tailscale；同步先寫入 `music.staging`，成功後原子替換 `music/`。
- 播放器：mpv + IPC socket；音訊裝置可偵測與切換。
- Cloud 資料：Supabase（stores、settings、alerts、update_log），透過 Edge Function `nikko-cloud-db` 存取。
- 若未設定 Supabase，Cloud 僅允許瀏覽器 localStorage 預覽，遠端 MQTT 指令與連線測試停用。

## 開發與部署慣例

- Pi 安裝：`curl -fsSL https://raw.githubusercontent.com/s7808200772/nikkomusichub/security-final/install.sh | sudo bash`（建立目錄、systemd 服務、啟用 timers）。
- Pi 程式碼部署後需重啟服務：`sudo systemctl restart nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service`。
- Cloud 部署：`cd cloud-vercel && vercel --prod`。
- Edge Function 部署：`supabase functions deploy nikko-cloud-db && supabase db push`。
- 自我測試：Pi 執行 `python scripts/test-suite.py`，Cloud 執行 `node cloud-vercel/scripts/test-suite.js`。
- `requirements.txt` 必須使用有預編譯 wheel 的版本，避免在 Raspberry Pi 上編譯 Rust/C 套件。
- 所有密碼、token、secret 禁止寫入 Git；僅存於 `nikko.env`、Vercel env、Supabase Edge Function env。

## 管理帳號

- 預設帳號：`nikkolh`。
- Pi 初始密碼預設為 `topup30%off`（也會寫入 `/srv/nikko-music/data/initial-admin-password`），首次登入後**建議**修改。
- Cloud 帳密與 JWT secret 只允許從 Vercel encrypted environment variables 讀取。
