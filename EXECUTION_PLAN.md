# Nikko SoundNode｜最終執行計畫

> 本計畫根據使用者最終策略整理：只包含**本次必做項目**與其必要底座。前置安全基礎（STE-101~105、私有 MQTT、Supabase、Vercel Cloud 部署、帳密輪替）已於上一輪完成。本文件已根據 `security-final` 實際程式碼更新，並移除舊版自相矛盾或已過時的內容。

---

## 1. 最終必做清單

### Phase 0：最小可穩定商用版本（MVP）

> 目標：讓單一門市穩定播放，同步不會誤刪音樂，基本監控與安全到位。

| 編號 | 項目 | 說明 |
| --- | --- | --- |
| 10 | 同步失敗保護 | WebDAV 失敗時不刪本地音樂、不中斷播放。 |
| 11 | 同步暫存區機制 | rclone → `music.staging` → 驗證成功 → 原子替換 `music/`。 |
| 15 | 開機後同步一次 | 開機延遲 2 分鐘後執行一次 WebDAV 同步。 |
| 25 | 靜音控制 | Dashboard 與 Cloud 增加靜音 / 恢復按鈕。 |
| 28 | 音訊設備偵測 | 偵測 USB / HDMI / 3.5mm 輸出裝置。 |
| 29 | 指定音訊輸出 | UI 選擇輸出裝置，mpv 切換 `audio-device`。 |
| 34 | WebDAV 狀態 | Dashboard 顯示 WebDAV 連線狀態（定時檢查 + 狀態燈）。 |
| 39 | 預設帳密 | 改為 `nikkolh` / `topup30%off`，首次登入不強制改密碼。 |
| 48 | MQTT Retained Status | Pi 發布 status 時設 `retain=true`，Cloud 一打開即可看到最後狀態。 |
| 64-74 | 基礎建設 | 自動環境檢查、Pydantic env 驗證、/health endpoint、watchdog、SQLite WAL/indexes、connection pool、sync 批次上報、Dashboard 事件驅動、靜態資源壓縮。 |
| 101 | 本地備援播放 | 平時播放永遠來自本地 SD 卡；sync 失敗不中斷播放。 |
| 105 | Tailscale 狀態檢查 | 檢查 Tailscale 在線、IP、可否連遠端 WebDAV 主機。 |
| 106 | WebDAV 可用性檢查 | 定期測試 WebDAV 可讀取。 |

### Phase 1：中央 Console 與批量控制

> 目標：讓總部可以一次管理多家店，發送批量指令並追蹤結果。

| 編號 | 項目 | 說明 |
| --- | --- | --- |
| 52 | MQTT 指令重試 | Cloud 對超時設備自動重試，並記錄結果。 |
| 54 | MQTT 帳密管理 | 設計文件：每台 Pi 獨立 MQTT clientId，broker 帳密過渡期仍共用但文件說明風險。 |
| 56 | 中央 Console | 強化 Cloud 首頁：新增告警區塊、批量操作入口、任務追蹤。 |
| 59 | 批量控制 | 多選店點，批量播放 / 暫停 / 同步 / 重啟 / 停止。 |
| 61 | 店面設定檔 | 統一 store_id、store_name 欄位；`device_id` / `role` 尚未實作。 |

### Phase 2：告警中心、通知與中央音樂庫

> 目標：主動發現問題並通知管理員；總部統一觸發全部店同步。

| 編號 | 項目 | 說明 |
| --- | --- | --- |
| 79 | 中央音樂庫 | Cloud `/stores` 統一查看各店音樂清單；原獨立 `/library` 已 redirect。 |
| 81 | 音樂版本管理 | 記錄每家店目前音樂版本與最後同步時間。 |
| 82 | 批量音樂發布 | 一鍵讓選定店點執行 WebDAV 同步。 |
| 83 | 多店同步播放 / 批量操作 | 所有單店指令都支援批量，顯示任務成功/失敗/無回應。 |
| 84 | 告警中心 | 離線、同步失敗、播放異常、磁碟不足等告警。 |
| 85 | LINE / webhook 通知 | LINE Messaging API 優先，通用 webhook 保留；**無 Email 通知**。 |
| 86 | 異常分級 | warning / critical / offline 分級。 |
| 88 | 遠端 log 串流 | 透過 MQTT `get_log` + Cloud `/monitoring` 遠端 Log 分頁查看。 |
| 93 | Webhook 整合 | 主要用於 LINE 通知。 |

### Phase 3：OTA、備份、災難恢復與文件

> 目標：可長期維運、快速復原、降低現場維修成本。

| 編號 | 項目 | 說明 |
| --- | --- | --- |
| 94 | 遠端更新 OTA | git pull + pip install + restart，含 rollback。 |
| 95 | 版本號回報 | Pi 回報 git commit / branch。 |
| 96 | 更新 rollback | OTA 失敗可退回上一版。 |
| 97 | 更新 log | 記錄更新版本、時間、成功/失敗。 |
| 98 | 設定備份 | 自動備份 nikko.env / db / rclone.conf / settings。 |
| 99 | 設定還原 | 一鍵還原到新 Pi。 |
| 100 | 災難恢復流程 | SD 卡損壞、NAS 失聯、Pi 壞掉的恢復步驟。 |
| 102 | 磁碟空間保護 | 空間不足停止同步並告警。 |
| 103 | 溫度保護 | Pi 過熱告警。 |
| 104 | 網路恢復重試 | 斷線恢復後自動重連、同步、回報。 |
| 107-120 | 維運文件 | 整合為 `OPERATIONS_MANUAL.md`。 |

---

## 2. 技術選型

### 2.1 Pi 端

| 功能 | 選型 | 理由 |
| --- | --- | --- |
| Web Framework | FastAPI | 已使用，非同步、自動 OpenAPI、生態成熟。 |
| 設定驗證 | Pydantic `BaseSettings` | 統一 env 驗證，啟動即報錯。 |
| 資料庫 | SQLite + WAL + indexes | 單機輕量，避免額外服務。 |
| 排程/定時 | systemd timer + APScheduler（必要時） | 系統級排程穩定，APScheduler 用於業務排程。 |
| 音樂同步 | rclone | 已使用，支援 WebDAV、dry-run、進度輸出。 |
| 播放器 | mpv + IPC socket | 已使用，控制能力完整。 |
| MQTT Client | paho-mqtt v2 | 已使用，支援 TLS、QoS、retain。 |
| 音訊裝置偵測 | `pactl list short sinks` / `aplay -l` | 標準 ALSA/PulseAudio 工具。 |
| 健康檢查 | `systemctl is-active` + 自訂 `/health` | 快速判斷服務狀態。 |
| 壓縮 | GZipMiddleware | 減少傳輸量。 |

### 2.2 Cloud 端

| 功能 | 選型 | 理由 |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) | 已使用，Vercel 原生支援。 |
| 資料庫 | Supabase PostgreSQL | 已設計，多人共用資料必須有持久化 DB。 |
| Job Queue | Supabase table + in-memory TTL | serverless 環境下最簡方案；量大時再考慮 Redis/Vercel KV。 |
| MQTT Publisher | paho-mqtt via serverless function | 短連線發布，配合 QoS 1。 |
| 通知 | LINE Messaging API | 台灣門市最常用，成本低。 |
| Webhook | Next.js API Route 轉發 | 簡單、可擴充。 |

### 2.3 網路與部署

| 功能 | 選型 | 理由 |
| --- | --- | --- |
| Pi ↔ WebDAV | Tailscale + WebDAV | 已確定方案，內網穿透穩定。 |
| Pi ↔ Cloud | MQTT broker（repo 預設 114.55.1.51:1883） | 即時指令與狀態；生產請啟用 TLS 並換成私有 broker。 |
| Pi 安裝 | install.sh + systemd | 已使用。 |
| OTA | git + systemd restart | 最簡單且可 rollback。 |
| 備份 | tar + NAS / local backup | 不需要額外服務。 |

---

## 3. 系統架構圖文字版

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Cloud (Vercel)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Next.js UI  │  │  API Routes  │  │  Job Queue   │  │  LINE Notify │   │
│  │              │  │  /api/*      │  │  (Supabase)  │  │  Webhook     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │            │
│         └─────────────────┴─────────────────┴─────────────────┘            │
│                                     │                                        │
│                              MQTT Publisher                                  │
│                              (HMAC signed)                                   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MQTT Broker (repo 預設 1883)                        │
│                        nikko/<storeId>/cmd  (Cloud → Pi)                    │
│                        nikko/<storeId>/resp (Pi → Cloud)                    │
│                        nikko/<storeId>/status (retained)                    │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Raspberry Pi (per store)                          │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  FastAPI Web UI │  │  MQTT Agent     │  │  mpv Player     │              │
│  │  /dashboard     │  │  nikko-mqtt     │  │  nikko-player   │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                       │
│           └────────────────────┴────────────────────┘                       │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │  SQLite DB (settings, audit, sync_log, alerts)              │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │  /srv/nikko-music/                                          │            │
│  │  ├── data/ (db, env, rclone.conf, backups)                  │            │
│  │  ├── music/ (正式播放資料夾，來自本地 SD 卡)                    │            │
│  │  ├── music.staging/ (同步暫存區)                              │           │
│  │  └── logs/                                                  │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │  Tailscale ──► WebDAV Music Source（預設 QNAP）              │            │
│  └─────────────────────────────────────────────────────────────┐            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 資料流說明

1. **音樂同步**：Pi 透過 Tailscale 連 WebDAV → rclone sync 到 `music.staging` → 驗證成功 → 原子替換 `music/` → reload mpv playlist。
2. **播放**：mpv 永遠讀取本地 `music/`（SD 卡），不中斷、不串流。
3. **中央控制**：Cloud 發 MQTT cmd → Pi 執行 → Pi 回傳 resp / status（retained）。
4. **告警**：Pi 本地偵測異常 → 透過 MQTT 或 HTTP 上報 Cloud → Cloud 發 LINE 通知。
5. **備份**：Pi 定期 tar `/srv/nikko-music/data` → NAS / USB / 本地備份。

---

## 4. 開發計畫（已依實際程式碼更新）

### Phase 0：最小可穩定商用版本（已完成）

- [x] `app/services/sync_manager.py` 支援 staging + atomic swap。
- [x] 新增 `nikko-music-boot-sync.service`（延遲 2 分鐘）。
- [x] Dashboard 靜音按鈕與 `/api/player/mute` 連動。
- [x] `/api/audio/devices` 與 `/api/audio/output`（偵測與切換）。
- [x] Dashboard 顯示 WebDAV / Tailscale 連線狀態。
- [x] 預設帳密改為 `nikkolh` / `topup30%off`，取消首次強制改密碼。
- [x] MQTT status publish 改為 `retain=True`。
- [x] Pydantic settings 驗證 (`app/core/config_validator.py`)。
- [x] `/health` endpoint。
- [x] SQLite WAL + indexes + connection pool。
- [x] systemd watchdog timer。
- [x] Dashboard long-polling `/api/events`。
- [x] 靜態資源 gzip 壓縮（`GZipMiddleware`）。

### Phase 1：中央 Console 與批量控制（已完成）

- [x] Pi `/api/settings/device` 儲存 store_id / store_name（**device_id / role 未實作**）。
- [x] Cloud `/stores` 顯示店點清單與 MQTT 設定。
- [x] Cloud 批量控制 UI（多選 store + 指令）。
- [x] `/api/command/batch` + job queue table。
- [x] 批次指令狀態頁：成功 / 失敗 / 無回應 / 重試。
- [x] MQTT 指令重試機制（最多 3 次，指數退避）。
- [x] MQTT 帳密管理設計文件（獨立 clientId / 過渡方案）。
- [x] 中央 Console 首頁改版（任務、告警摘要、多店狀態）。

### Phase 2：告警、通知、中央音樂庫（已完成）

- [x] Cloud alerts table 與告警規則引擎。
- [x] Pi 端異常上報（離線判斷在 Cloud）。
- [x] LINE Messaging API 通知整合 + 通用 webhook。
- [x] 異常分級：warning / critical / offline。
- [x] 中央音樂庫功能整合於 `/stores`（原 `/library` redirect）。
- [x] 音樂版本標記與最後同步時間。
- [x] 批量音樂發布按鈕（觸發選定店點 sync）。
- [x] 遠端 log 查看（MQTT `get_log` + Cloud `/monitoring`）。

### Phase 3：OTA、備份、災難恢復、文件（已完成）

- [x] Pi `/api/version` 回報 git commit/branch。
- [x] Cloud OTA 更新頁面（發送 update 指令 + 追蹤）。
- [x] OTA rollback 設計（保留前一版 git tag）。
- [x] 更新 log table。
- [x] 設定自動備份（tar）與 `/api/backup` 下載。
- [x] 設定還原腳本 `scripts/restore.sh`。
- [x] 磁碟空間 / 溫度監控與告警。
- [x] 網路恢復後自動同步與回報。
- [x] `OPERATIONS_MANUAL.md` 正式文件。

---

## 5. 每一階段驗收標準

### Phase 0 驗收

- [x] 故意斷開 WebDAV，執行同步，本地 `music/` 不被刪除，播放不中斷。
- [x] 正常同步時，`music.staging` 先產生，成功後 `music/` 被替換，mpv 自動 reload。
- [x] 開機 2 分鐘後自動執行一次同步，並觸發 player reload。
- [x] Dashboard 可靜音 / 恢復，Cloud 也可對單店靜音。
- [x] Dashboard 顯示音訊裝置清單，可選擇不同輸出。
- [x] Dashboard WebDAV 燈號正確反映連線狀態；Tailscale 燈號正確。
- [x] 首次登入使用 `nikkolh` / `topup30%off` 成功，不強制改密碼。
- [x] Cloud 重新整理後，store 的最後狀態立即出現（retained status）。
- [x] `/health` 回傳 web/db/mqtt/player/sync 狀態。
- [x] SQLite WAL 啟用；dashboard API p95 latency < 100ms。
- [x] 靜態資源有 `Content-Encoding: gzip`。

### Phase 1 驗收

- [x] 新增店點時可輸入 store_id / store_name。
- [x] Cloud 可選取 3 家店點，批量發送「同步」指令，並顯示成功 3 / 失敗 0 / 無回應 0。
- [x] 關閉其中一家 Pi 的 MQTT agent，批量發送指令後顯示「無回應」，並可重試。
- [x] 同一指令重複發送，Pi 只執行一次（冪等）。
- [x] 中央 Console 首頁顯示最新批量任務狀態。

### Phase 2 驗收

- [x] 關閉 Pi 的 MQTT agent 超過 90 秒，Cloud 產生 offline 告警並發送 LINE 通知。
- [x] 同步失敗時，Cloud 收到 sync_failed 告警並顯示原因。
- [x] 中央音樂庫可在 `/stores` 查詢全部店點的音樂清單。
- [x] 選取 5 家店點，點「批量更新音樂」，5 家 Pi 各自執行 WebDAV 同步。
- [x] 遠端 log 可查看每家 Pi 最近 500 行 sync / player / system log。

### Phase 3 驗收

- [x] Cloud 對單台 Pi 下發 OTA 更新，更新成功後 Pi 回報新版本 git commit。
- [x] OTA 更新後發現異常，可執行 rollback，Pi 回到上一版本並恢復播放。
- [x] 設定備份可下載 tar，還原腳本可在新 Pi 上恢復設定。
- [x] 模擬磁碟空間 < 10%，Pi 停止同步並發出告警。
- [x] 斷網 5 分鐘後恢復，Pi 自動 reconnect MQTT、同步、回報狀態。
- [x] `OPERATIONS_MANUAL.md` 包含安裝、驗收、故障排查、災難恢復、設備汰換、長期維運章節。

---

## 6. 風險與降級方案

| 風險 | 影響 | 降級方案 |
| --- | --- | --- |
| staging 替換時 mpv 正在播放舊檔案 | 播放中斷或檔案找不到 | sync 前先暫停，替換後再播放；或使用 `rclone copy` 而非 `sync`，只新增/更新不刪除。 |
| Supabase 未設定，Cloud 功能無法運作 | job queue / alerts / 音樂庫無法持久化 | 第一版可用 in-memory TTL + localStorage fallback，但重啟後資料遺失；正式上線前必須完成 Supabase 設定。 |
| LINE token 外洩 | 通知被濫用 | LINE token 存 Vercel env，不進 Git；可設定 IP allowlist 或輪替 token。 |
| MQTT broker 單點故障 | 全部店點無法被控制 | 監控 broker 健康；提供緊急「本地模式」讓 Pi 繼續播放本地音樂。 |
| OTA 更新失敗導致 Pi 無法啟動 | 遠端門市音樂中斷 | 保留兩個 git worktree / tag，rollback 自動切回；必要時提供 USB 現場還原。 |
| 大量店點同時 sync | WebDAV 主機 / 網路頻寬壅塞 | 批次 stagger sync（隨機延遲 0–120 秒）或分時段排程。 |
| 音訊裝置名稱在不同 Pi 不一致 | 指定輸出失效 | 同時顯示名稱與 ALSA 裝置編號；提供 fallback 到預設輸出。 |

---

## 7. 已完成 / 待補強 / 未實作

### 7.1 已完成（本次確認/保留）

- WebDAV 同步、Dry-run、手動同步、排程、WebDAV 設定與測試、遠端列表。
- mpv 安裝、systemd service、開機自動播放、自動重啟、IPC 控制、播放/暫停/停止/下一首/上一首/音量/seek/shuffle/loop。
- Dashboard 首頁、Pi 系統狀態、網路狀態、本地音樂統計、player/sync service 狀態。
- Web UI 登入、JWT session、審計 log、危險操作二次確認、憑證保護、rclone.conf 權限。
- MQTT Agent、指令下發、結果回報、冪等性、heartbeat、store 列表、單店控制、多店狀態總覽。
- 測試音效按鈕（位於 Pi Settings）、本地音樂列表、同步 log。

### 7.2 待補強 / 已知缺口

- `device_id` / `role` 欄位：設計文件有，但 Pi 設定 API 與 Cloud Stores 資料表尚未實作。
- Email 通知：目前僅 LINE + webhook，未實作 Email。
- 超過 500 行遠端 log 的下載連結：尚未提供直接呼叫 Pi `/logs` 的下載入口。
- Pi Dashboard「立即備份」按鈕：僅有 API `/api/backup/create`。

### 7.3 未實作（規劃中）

- RBAC 多角色權限、TOTP MFA、 secrets 自動輪替。
- 時段排程、PWA、Push Notification、報表分析、多店同步播放。
- 詳細 GitHub Actions CI/CD、結構化 JSON 日誌。

---

## 結論

本次最終策略規劃的 **Phase 0 ~ Phase 3 核心項目皆已在 `security-final` 完成**。文件與程式碼已根據實際狀態整理，過時的 QNAP/Dropbox 專用描述、已整合頁面、未實作欄位已標註。建議公司技術團隊接手時優先確認 Supabase/Vercel/MQTT 環境變數、TLS 設定與 `device_id` / `role` 是否需要補實作。
