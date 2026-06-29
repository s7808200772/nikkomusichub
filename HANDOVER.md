# NikkoMusicHub 專案及接手說明

> 本文件供公司技術團隊快速了解本專案現況、已具備功能與接手注意事項。詳細內容請參閱 `README.md`、`AGENTS.md`、`OPERATIONS_MANUAL.md`、`PROJECT_STATUS_120.md`。

---

## 1. 這是什麼專案？

NikkoMusicHub（Nikko SoundNode）是一個 **Raspberry Pi 門市音樂管理系統**：

- 每間門市放一台 Pi，負責播放背景音樂。
- 總部透過 Cloud 後台（Vercel + Next.js）統一管理所有店點。
- Pi 與 Cloud 之間透過 **私有 MQTT broker** 傳送指令與狀態。
- 音樂來源是 **WebDAV**（預設以 QNAP NAS 為例），同步時先寫入 `music.staging`，驗證成功後原子替換 `music/`；播放永遠讀取本地 SD 卡，確保同步失敗也不中斷。

---

## 2. 目前有哪些東西？

### 2.1 Pi 端（`app/`）

- **FastAPI Web 後台**：登入、Dashboard、系統設定、日誌、版本更新。
- **播放器控制**：mpv + IPC socket，支援播放/暫停/停止/切歌/音量/靜音/shuffle/loop。
- **音訊裝置**：偵測 PulseAudio/ALSA 輸出並可切換。
- **WebDAV 同步**：rclone 同步、dry-run、排程同步、開機後同步、進度顯示、失敗 rollback。
- **MQTT Agent**：訂閱指令、執行、回傳結果、每 30 秒發 retained status。
- **健康檢查**：`/health`、`/api/health/*`、systemd watchdog timer。
- **系統服務**：Web、Player、MQTT、Sync、Boot-sync、Backup、Watchdog、Network-watchdog。
- **備份還原**：每日自動備份 `/srv/nikko-music/data`，`scripts/restore.sh` 可還原到新 Pi。
- **OTA / Rollback**：`POST /api/system/update` 與 `/api/system/rollback`。

### 2.2 Cloud 端（`cloud-vercel/`）

- **Next.js App Router** 中央後台。
- **總覽控制台 `/`**：多店狀態、統計、批次指令控制台。
- **店點管理 `/stores`**：店點 CRUD、MQTT 設定、音樂庫查看、OTA、看門狗操作。
- **監控紀錄 `/monitoring`**：告警中心、遠端 Log。
- **版本更新 `/changelog`**。
- **Supabase 持久化**：stores、settings、alerts、update_log、jobs。
- **LINE / webhook 告警通知**。

### 2.3 其他

- `install.sh`：Pi 一鍵安裝腳本。
- `scripts/`：測試、診斷、備份、還原、Linear 進度更新、MQTT 安全驗證。
- `supabase/`：Edge Function `nikko-cloud-db` 與 migrations。
- 文件：`README.md`、`AGENTS.md`、`OPERATIONS_MANUAL.md`、`PROJECT_STATUS_120.md`、`PROPOSAL.md`、`SECURITY_FINAL_REPORT.md`、`docs/*.md`。

---

## 3. 已部署環境

- **GitHub**：`https://github.com/s7808200772/nikkomusichub`，工作分支 `security-final`。
- **Vercel Production**：`https://cloud-vercel-xi.vercel.app`。
- **Pi 實機**：Tailscale `100.69.3.7`，systemd 服務運作中。
- **Linear**：專案 `NikkoMusicHub`，狀態 `completed`，進度 `100%`。

---

## 4. 接手時優先確認的事

### 4.1 環境變數與憑證

所有密碼、token、secret **都不在 Git**，請確認以下位置都有正確設定：

- Pi：`/srv/nikko-music/data/nikko.env`、`/srv/nikko-music/data/rclone.conf`
- Vercel：`NIKKO_CLOUD_SECRET`、`NIKKO_ADMIN_USER/PASS`、MQTT 相關、Supabase 相關、LINE 相關
- Supabase Edge Function：`SUPABASE_SERVICE_ROLE_KEY`、`NIKKO_SUPABASE_PROXY_SECRET`

### 4.2 MQTT broker

- repo 預設是 `114.55.1.51:1883` plaintext，方便首次安裝。
- **生產環境請務必啟用 TLS**（程式碼支援 TLS 1.3），並換成自己的私有 broker。
- Pi 與 Cloud 必須共用相同的 `NIKKO_MQTT_COMMAND_SECRET` 與 `NIKKO_MQTT_TOPIC_PREFIX`。

### 4.3 Supabase

- Cloud 多店管理、告警、OTA 紀錄、批次任務都依賴 Supabase。
- 未設定 Supabase 時，Cloud 只能 localStorage 預覽，遠端指令與連線測試會停用。
- 部署後請執行 `supabase functions deploy nikko-cloud-db && supabase db push`。

### 4.4 Tailscale / WebDAV

- Pi 與 WebDAV 主機建議走 Tailscale 內網。
- 預設 rclone remote 名稱為 `qnapmusic`（保留以相容既有安裝）；新案可改為通用名稱。

---

## 5. 已知限制與未實作項目

| 項目 | 狀態 |
|---|---|
| `device_id` / `role` 欄位 | 設計文件有，但 Pi/Cloud 資料表與 UI 尚未實作 |
| Email 告警通知 | 未實作，目前只有 LINE + webhook |
| Pi Dashboard「立即備份」按鈕 | 未實作，目前只有 API `/api/backup/create` |
| 完整 CI/CD（GitHub Actions） | 未實作 |
| 時段排程 / PWA / 報表分析 / RBAC / MFA | 未實作，規劃於 `PROPOSAL.md` |
| Cloud `/library`、`/commands` | 已 redirect 到 `/stores`、`/` |

---

## 6. 常用指令

```bash
# 安裝 Pi（在 Pi 上執行）
curl -fsSL https://raw.githubusercontent.com/s7808200772/nikkomusichub/security-final/install.sh | sudo bash

# 重啟 Pi 服務
sudo systemctl restart nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service

# 部署 Cloud
cd cloud-vercel && vercel --prod

# 部署 Supabase
supabase functions deploy nikko-cloud-db && supabase db push

# Pi 自我測試
python scripts/test-suite.py

# Cloud 自我測試
node cloud-vercel/scripts/test-suite.js
```

---

## 7. 聯絡與紀錄

- 最新移交紀錄：`record/260630_00.md`
- 前一次修復紀錄：`record/260629_16.md`
- 安全驗收報告：`SECURITY_FINAL_REPORT.md`
- 120 項目總覽：`PROJECT_STATUS_120.md`

---

> 祝接手順利。如有疑問，請先確認 `OPERATIONS_MANUAL.md` 與 `AGENTS.md`。
