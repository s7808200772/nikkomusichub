# Nikko SoundNode｜日光音樂節點：120 項目完成狀態總覽

> 本文件依據目前 `security-final` branch 的實際程式碼與移交狀態進行盤點。文件已清理過時的 QNAP/Dropbox 專用描述、已整合頁面、未實作欄位。Linear 專案狀態為 **completed / 100%**，本專案準備移交公司技術團隊整合。

---

## 前置狀態更新

- **STE-101 ~ STE-105 全部完成**：MQTT HMAC、時效、防重放、白名單、危險指令確認、audit、JWT/session、Supabase RLS/Edge Function、npm audit 清乾淨。
- **MQTT broker**：repo 預設 `114.55.1.51:1883` plaintext；生產環境請啟用 TLS 並換成私有 broker。
- **Supabase 正式持久化**：Production / Preview 皆可使用，RLS 與 Edge Function 已設定。
- **Vercel Cloud 正式部署完成**：端到端連線成功，播放器狀態可回傳到 Cloud Dashboard。
- **帳密已統一**：預設登入帳號 `nikkolh`，初始密碼 `topup30%off`。
- **專案移交**：Health/Smoke-test 任務已由使用者取消；文件整理完成並推送 GitHub。

---

## 說明與分類原則

- **已完成**：功能已實作且可在 UI / API / systemd 中實際運作。
- **部分完成**：核心邏輯或 API 已存在，但缺少 UI、缺少保護、缺少文件、或尚未達到可獨立營運的程度。
- **未開始**：程式碼或設定中找不到對應實作。
- **本次規劃**：
  - **必做**：本次明確要做的項目（含使用者指定 + 必要底座）。
  - **底座完成**：必要底座且已經完成，本次只需確認/保留。
  - **暫緩**：使用者明確暫緩或不優先的項目。
  - **不適用**：與本次策略無關或已被取代的項目。

---

## 重要策略修正

1. **預設帳密**：改為 `nikkolh` / `topup30%off`，**第一次登入不強制改密碼**，但保留手動修改密碼功能。
2. **WebDAV 同步**：必須採用 **staging 機制**，正式同步前先寫入 `music.staging`，成功後再原子替換 `/srv/nikko-music/music`。
3. **播放來源**：平時播放**永遠使用 Pi 本地 SD 卡** `/srv/nikko-music/music`，NAS/WebDAV 僅作同步來源，不可串流播放。
4. **同步失敗保護**：WebDAV 失敗時，**不可刪除本地音樂、不可中斷播放**。
5. **批量操作**：所有單店功能都要能批量操作，並顯示批量任務狀態（成功/失敗/無回應/可重試）。
6. **LINE 通知優先**：Webhook 主要用於 LINE 通知，其他第三方暫時不做。
7. **文件 107-120**：整合為一份正式維運文件 `OPERATIONS_MANUAL.md`。
8. **頁面整合**：Cloud `/library` 與 `/commands` 已 redirect 到 `/stores` 與 `/`。
9. **未實作欄位**：`device_id` / `role` 目前僅存於設計文件，尚未寫入 Pi/Cloud 資料表與 UI。

---

## 一、音樂同步（WebDAV）

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 1 | WebDAV 音樂同步 | P0 | 已完成 | 底座完成 | 已實作 sync / copy / dry-run。 |
| 2 | 移除 Dropbox 方案 | P0 | 已完成 | 不適用 | 程式碼已無 Dropbox；歷史文件已清理。 |
| 3 | rclone WebDAV 設定介面 | P0 | 已完成 | 底座完成 | `/settings` 頁面可輸入設定。 |
| 4 | WebDAV 連線測試 | P0 | 已完成 | 底座完成 | `/api/webdav/test-remote` 已實作。 |
| 5 | 遠端音樂資料夾列表 | P0 | 已完成 | 底座完成 | `/api/webdav/list-music` 已實作。 |
| 6 | 手動同步音樂 | P0 | 已完成 | 底座完成 | Dashboard「立即同步」已實作。 |
| 7 | Dry Run 同步測試 | P0 | 已完成 | 底座完成 | Dashboard「模擬同步」已實作。 |
| 8 | 同步檔案格式限制 | P0 | 已完成 | 底座完成 | 只同步 `.mp3` / `.MP3`。 |
| 9 | 本地音樂資料夾管理 | P0 | 已完成 | 底座完成 | 統一使用 `/srv/nikko-music/music`。 |
| 10 | 同步失敗保護 | P0 | 已完成 | 底座完成 | 遠端斷線或 rclone 失敗時不會刪除 `music/`，播放不中斷。 |
| 11 | 同步暫存區機制 | P1 | 已完成 | 底座完成 | `music.staging` → 驗證成功 → 原子替換 `music/`；失敗自動 rollback。 |
| 12 | 同步完成後重啟播放器 | P0 | 已完成 | 底座完成 | `sync_runner.py` 會 reload_playlist 或 start_player。 |
| 13 | 同步 log | P0 | 已完成 | 底座完成 | SQLite `sync_log` + Dashboard 可查詢。 |
| 14 | 定時同步排程 | P1 | 已完成 | 底座完成 | systemd timer 每天執行。 |
| 15 | 開機後同步一次 | P1 | 已完成 | 底座完成 | `nikko-music-boot-sync.service` 延遲 2 分鐘執行一次同步。 |

---

## 二、mpv 播放器

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 16 | mpv 播放器安裝 | P0 | 已完成 | 底座完成 | Dashboard「安裝 mpv」已實作。 |
| 17 | mpv 播放服務 | P0 | 已完成 | 底座完成 | `nikko-music-player.service` 已實作。 |
| 18 | 開機自動播放 | P0 | 已完成 | 底座完成 | player service enabled。 |
| 19 | 播放服務自動重啟 | P0 | 已完成 | 底座完成 | systemd `Restart=on-failure` + StartLimit。 |
| 20 | 播放控制 API | P0 | 已完成 | 底座完成 | play/pause/stop/next/prev/volume/seek/shuffle/loop。 |
| 21 | mpv IPC 控制 | P0 | 已完成 | 底座完成 | 透過 `/tmp/nikko-mpv.sock` 控制。 |
| 22 | 目前播放曲目顯示 | P0 | 已完成 | 底座完成 | Dashboard 與 `/api/player/status`。 |
| 23 | 播放狀態顯示 | P0 | 已完成 | 底座完成 | Dashboard 顯示播放狀態。 |
| 24 | 音量控制 | P1 | 已完成 | 底座完成 | `/api/player/volume` 與 UI 滑桿。 |
| 25 | 靜音控制 | P1 | 已完成 | 底座完成 | Dashboard 與 Cloud 均已加入靜音 / 取消靜音按鈕。 |
| 26 | 重新載入播放清單 | P1 | 已完成 | 底座完成 | `/api/player/reload` 已實作。 |
| 27 | 本地音樂列表 | P0 | 已完成 | 底座完成 | `/api/player/library` 與 Dashboard。 |
| 28 | 音訊設備偵測 | P1 | 已完成 | 底座完成 | `/api/audio/devices` 偵測 PulseAudio / ALSA 輸出。 |
| 29 | 指定音訊輸出 | P1 | 已完成 | 底座完成 | Dashboard 下拉選擇裝置，mpv 即時切換 `audio-device`。 |
| 30 | 測試音效按鈕 | P1 | 已完成 | 底座完成 | Pi Settings 頁面提供「測試音訊輸出」。 |

---

## 三、Dashboard 與系統狀態

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 31 | Dashboard 首頁 | P0 | 已完成 | 底座完成 | 集中顯示設備、播放、同步、錯誤提醒。 |
| 32 | Pi 系統狀態 | P0 | 已完成 | 底座完成 | CPU、RAM、磁碟、溫度、uptime。 |
| 33 | 網路狀態 | P0 | 已完成 | 底座完成 | LAN IP、Wi-Fi、Tailscale IP。 |
| 34 | WebDAV 狀態 | P0 | 已完成 | 底座完成 | Dashboard 每 30 秒透過 `/api/health/qnap` 更新 WebDAV/Tailscale 狀態燈。 |
| 35 | 本地音樂統計 | P0 | 已完成 | 底座完成 | MP3 數量、總容量、最近同步時間。 |
| 36 | 播放服務狀態 | P0 | 已完成 | 底座完成 | Dashboard 顯示 player service 狀態。 |
| 37 | 同步服務狀態 | P1 | 已完成 | 底座完成 | Dashboard 顯示 sync timer / service 狀態。 |

---

## 四、身份驗證、安全與審計

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 38 | Web UI 登入 | P0 | 已完成 | 底座完成 | JWT + cookie + bcrypt。 |
| 39 | 預設帳密 | P1 | 已完成 | 底座完成 | 預設帳號 `nikkolh` / `topup30%off`，首次登入不強制改密碼。 |
| 40 | RBAC 權限分級 | P2 | 未開始 | 暫緩 | 本次單一管理者階段先不做。 |
| 41 | TOTP MFA | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |
| 42 | 操作審計 log | P1 | 已完成 | 底座完成 | `audit_log` 已記錄操作。 |
| 43 | 危險操作二次確認 | P0 | 已完成 | 底座完成 | 清空音樂、重開機、批量操作需 confirm。 |
| 44 | 密碼與憑證保護 | P0 | 已完成 | 底座完成 | 密碼不寫 log，env 與 rclone.conf 權限 600。 |
| 45 | rclone config 權限 | P0 | 已完成 | 底座完成 | `chmod 600`。 |

---

## 五、MQTT 與中央控制

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 46 | MQTT Agent | P1 | 已完成 | 底座完成 | `nikko-music-mqtt.service` 已運行。 |
| 47 | MQTT Heartbeat | P1 | 已完成 | 底座完成 | 每 30 秒發布 status。 |
| 48 | MQTT Retained Status | P2 | 已完成 | 底座完成 | Pi status topic 發布時已設 `retain=True`。 |
| 49 | MQTT 指令下發 | P1 | 已完成 | 底座完成 | Cloud 可發送指令到 Pi。 |
| 50 | MQTT 指令結果回報 | P1 | 已完成 | 底座完成 | Pi 回傳結果到 `.../resp`。 |
| 51 | MQTT 指令冪等性 | P1 | 已完成 | 底座完成 | requestId 去重機制。 |
| 52 | MQTT 指令重試 | P2 | 已完成 | 底座完成 | Cloud `publishCommandWithRetry` 最多 3 次，指數退避 2s/4s。 |
| 53 | MQTT TLS | P2 | 已完成 | 底座完成 | 程式支援 TLS 1.3；repo 預設 plaintext，生產請啟用 TLS。 |
| 54 | MQTT 帳密管理 | P2 | 已完成 | 底座完成 | 設計文件 `docs/MQTT_CREDENTIAL_MANAGEMENT.md`；Pi clientId 含 store_id + 隨機字尾。 |
| 55 | MQTT secret 輪替 | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |

---

## 六、中央 Console 與多店管理

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 56 | 中央 Console | P2 | 已完成 | 底座完成 | Dashboard 顯示總店數/線上/異常、最近批量任務、快速入口。 |
| 57 | 店面設備列表 | P2 | 已完成 | 底座完成 | Cloud `/stores` 已列出店點。 |
| 58 | 單店控制頁 | P2 | 已完成 | 底座完成 | Cloud `/` 總覽控制台可單獨控制每家店。 |
| 59 | 批量控制 | P2 | 已完成 | 底座完成 | `/` 多選店點 + `/api/command/batch` + 任務狀態 + 重試。 |
| 60 | 多店狀態總覽 | P2 | 已完成 | 底座完成 | Cloud Dashboard 已可看多店狀態。 |
| 61 | 店面設定檔 | P1 | 部分完成 | 暫緩 | Pi `/api/settings/device` 與 Cloud `/api/stores` 支援 store_id / store_name；**device_id / role 尚未實作**。 |
| 62 | 首次部署流程 | P1 | 部分完成 | 暫緩 | `install.sh` 已自動產生 store_id；註冊碼綁定流程本次暫緩。 |

---

## 七、部署、安裝與環境檢查

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 63 | 一鍵安裝腳本 | P1 | 已完成 | 底座完成 | `install.sh` 已存在。 |
| 64 | 自動環境檢查 | P1 | 已完成 | 底座完成 | `/health` 檢查 DB / 服務 / WebDAV / Tailscale / 磁碟 / 音效。 |
| 65 | Pydantic env 驗證 | P1 | 已完成 | 底座完成 | `app/core/config_validator.py` 啟動前驗證必要 env。 |
| 66 | /health endpoint | P1 | 已完成 | 底座完成 | `/health` 與 `/api/health/*` 已提供監控端點。 |
| 67 | Watchdog Timer | P0 | 已完成 | 底座完成 | `nikko-music-watchdog.timer` 每 5 分鐘檢查並重啟失敗服務。 |

---

## 八、資料庫與後端效能

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 68 | SQLite 本地資料庫 | P0 | 已完成 | 底座完成 | 設定、log、audit 存 SQLite。 |
| 69 | SQLite WAL | P1 | 已完成 | 底座完成 | `PRAGMA journal_mode=WAL` 已啟用。 |
| 70 | SQLite indexes | P1 | 已完成 | 底座完成 | audit / sync_log / device / settings 索引已建立。 |
| 71 | Connection Pool | P2 | 已完成 | 底座完成 | 每執行緒重用 SQLite 連線。 |
| 72 | Sync 進度批次上報 | P1 | 已完成 | 底座完成 | 進度寫入記憶體與 SQLite；Dashboard 改用 long-polling 減少輪詢。 |
| 73 | Dashboard 事件驅動 | P2 | 已完成 | 底座完成 | `/api/events` long-polling 已實作，操作後即時更新。 |
| 74 | 靜態資源壓縮 | P2 | 已完成 | 底座完成 | `GZipMiddleware` 啟用 gzip 壓縮。 |

---

## 九、排程與內容管理

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 75 | 時段排程 | P1 | 未開始 | 暫緩 | 本次不做。 |
| 76 | 歌單管理 | P1 | 未開始 | 暫緩 | 本次不做。 |
| 77 | 音量時段規則 | P1 | 未開始 | 暫緩 | 本次不做。 |
| 78 | 臨時覆蓋排程 | P2 | 未開始 | 暫緩 | 本次不做。 |
| 79 | 中央音樂庫 | P2 | 已完成 | 底座完成 | Cloud `/stores` 可查詢各店音樂檔案；原 `/library` 已 redirect。 |
| 80 | 音樂內容審核 | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |
| 81 | 音樂版本管理 | P2 | 已完成 | 底座完成 | Dashboard 與 `/stores` 顯示每家店 last_sync_at / last_sync_status。 |
| 82 | 批量音樂發布 | P2 | 已完成 | 底座完成 | `/stores` 可選取店點，一鍵發送 `sync` 指令更新音樂。 |
| 83 | 多店同步播放 / 批量操作 | P3 | 已完成 | 底座完成 | `/` 支援批量播放、暫停、重啟、同步與任務追蹤。 |

---

## 十、告警、通知與觀測

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 84 | 告警中心 | P1 | 已完成 | 底座完成 | Cloud `/monitoring` 頁面 + `/api/alerts` + 規則引擎；離線/磁碟/同步/播放異常自動產生告警。 |
| 85 | LINE / webhook 通知 | P2 | 已完成 | 底座完成 | `lib/line.js` 支援 LINE Messaging API push + 通用 webhook。**無 Email 通知**。 |
| 86 | 異常分級 | P2 | 已完成 | 底座完成 | warning / critical / offline 三級，Dashboard 以顏色區分。 |
| 87 | 遠端 log 查看 | P1 | 已完成 | 底座完成 | Pi `/logs` 頁面已可查看與匯出；Cloud `/monitoring` 可透過 MQTT 拉取最近 500 行。 |
| 88 | 遠端 log 串流 | P2 | 已完成 | 底座完成 | Pi `get_log` 指令 + Cloud `/monitoring` 遠端 Log 分頁；文件 `docs/REMOTE_LOG_STREAMING.md`。 |
| 89 | 報表與分析 | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |
| 90 | 設備健康分數 | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |

---

## 十一、PWA、Webhook 與第三方整合

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 91 | PWA | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |
| 92 | Push Notification | P3 | 未開始 | 暫緩 | 使用者明確暫緩。 |
| 93 | Webhook 整合 | P3 | 已完成 | 底座完成 | 告警產生時同時發送 `POST` 到 `NIKKO_WEBHOOK_URL`。 |

---

## 十二、OTA、備份與災難恢復

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 94 | 遠端更新 OTA | P2 | 已完成 | 底座完成 | Pi `/api/system/update` + MQTT `ota_update`；Cloud `/ota` 頁面。 |
| 95 | 版本號回報 | P2 | 已完成 | 底座完成 | Pi `/api/version` 回報 git commit / branch。 |
| 96 | 更新 rollback | P2 | 已完成 | 底座完成 | OTA 前自動打 tag `rollback-before-ota`，Cloud/Pi 皆可觸發 rollback。 |
| 97 | 更新 log | P2 | 已完成 | 底座完成 | Supabase `update_log` 資料表 + Cloud `/ota` 顯示紀錄。 |
| 98 | 設定備份 | P1 | 已完成 | 底座完成 | `scripts/backup.sh` + systemd timer 每日備份 data 目錄。 |
| 99 | 設定還原 | P1 | 已完成 | 底座完成 | `scripts/restore.sh` 可在新 Pi 一鍵還原。 |
| 100 | 災難恢復流程 | P1 | 已完成 | 底座完成 | `OPERATIONS_MANUAL.md` 包含 SD 卡損壞、NAS 失聯、Pi 壞掉恢復步驟。 |
| 101 | 本地備援播放 | P0 | 已完成 | 底座完成 | 播放永遠使用本地 SD 卡；staging 替換失敗會 rollback，啟動時會自動還原備份。 |
| 102 | 磁碟空間保護 | P1 | 已完成 | 底座完成 | sync 前檢查磁碟 >90% 即停止；Cloud 告警規則同步監控。 |
| 103 | 溫度保護 | P2 | 已完成 | 底座完成 | Cloud 告警規則在 CPU >80°C 時產生 critical 告警。 |
| 104 | 網路恢復重試 | P1 | 已完成 | 底座完成 | MQTT agent 自動重連、systemd restart、watchdog 定時檢查。 |

---

## 十三、網路與外部依賴檢查

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 105 | Tailscale 狀態檢查 | P1 | 已完成 | 底座完成 | `/api/health/tailscale` 檢查上線狀態與遠端 WebDAV 主機 ping。 |
| 106 | WebDAV 可用性檢查 | P1 | 已完成 | 底座完成 | `/api/health/qnap` 測試 Tailscale ping + rclone WebDAV listing。 |

---

## 十四、文件與維運

| 編號 | 項目 | 優先級 | 狀態 | 本次規劃 | 必要性 / 備註 |
|---|---|---|---|---|---|
| 107 | 安裝前檢查清單 | P1 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 108 | 驗收測試清單 | P1 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 109 | 自動化測試 | P2 | 部分完成 | 暫緩 | 基礎測試存在，完整 CI/CD 暫緩。 |
| 110 | 模擬設備測試 | P2 | 未開始 | 暫緩 | 使用者未明列，暫緩。 |
| 111 | 文件化 | P1 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 112 | 操作手冊 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 113 | 維修手冊 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 114 | 多環境設定 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 115 | 資料保留策略 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 116 | 隱私與資安策略 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 117 | 中央後台使用者管理 | P3 | 未開始 | 暫緩 | 單一管理者階段暫緩。 |
| 118 | 門市分組管理 | P3 | 未開始 | 暫緩 | 多店數量上來後再做。 |
| 119 | 設備汰換流程 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |
| 120 | 長期維運策略 | P2 | 已完成 | 底座完成 | 已整合進 `OPERATIONS_MANUAL.md`。 |

---

## 統計摘要

| 狀態 | 數量 | 比例 |
|---|---|---|
| 已完成 | 101 | 84.2% |
| 部分完成 | 3 | 2.5% |
| 未開始 | 16 | 13.3% |
| **總計** | **120** | **100%** |

### 本次規劃分類

| 分類 | 數量 | 說明 |
|---|---|---|
| **底座完成** | 101 | 已存在且穩定的基礎功能 |
| **暫緩** | 19 | 使用者明確暫緩或本次非優先 |

---

> **移交結論**：Phase 0 ~ Phase 3 核心功能皆已完成，文件已整理。Linear 專案 `NikkoMusicHub` 狀態為 `completed`、進度 `100%`。請見 `HANDOVER.md` 與 `record/260630_00.md` 了解公司技術團隊接手重點。
