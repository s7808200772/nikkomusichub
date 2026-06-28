# NikkoMusicHub 優化與新功能設計方案

> 本文件為規劃案，**不會直接修改任何程式碼**。  
> 目標：在既有 `security-final` 基礎上，提出可落地的優化方向與新功能設計，供評估優先序與資源配置。

---

## 1. 現況總覽

### 1.1 架構

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud (Vercel Next.js)                                     │
│  ├─ Admin 登入 (NIKKO_CLOUD_SECRET + admin pass)            │
│  ├─ Stores / Settings / Commands / Dashboard                │
│  ├─ Supabase persistence (optional)                         │
│  └─ MQTT publisher (HMAC signed commands)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ MQTT over TLS/plain
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Pi (Raspberry Pi)                                          │
│  ├─ FastAPI Web UI + API (nikko-music-hub-web.service)      │
│  ├─ MQTT client (nikko-music-mqtt.service)                  │
│  ├─ mpv player (nikko-music-player.service)                 │
│  ├─ WebDAV sync runner (nikko-music-sync.service)            │
│  └─ SQLite + local music cache                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 已具備基礎

- JWT/session 認證、bcrypt、密碼強度檢查、session 失效。
- MQTT HMAC 簽名、時效、nonce、command whitelist、危險指令 confirm。
- WebDAV/rclone 同步、Dry-run、排程、自動重啟 player。
- systemd 服務、StartLimit 防止重啟風暴。
- Cloud 多店管理、測試連線、指令下發。

### 1.3 已發現的痛點

- Cloud 與 Pi 之間的所有狀態都靠輪詢 + MQTT request/response，沒有長連線心跳。
- 沒有集中式「事件/告警」機制；店點離線或 sync/player 異常只能人工發現。
- 音樂內容管理在 Pi 本機，Cloud 無法直接瀏覽/審核/指派歌單。
- 沒有播放時段/排程，無法做到「早上輕音樂、晚上節奏強」這類營運需求。
- 缺乏觀測：log 分散、無 metrics、無 tracing。
- 單一 admin 角色；多使用者/多權限場景未處理。
- 手機版體驗未優化。
- 沒有 PWA，店長無法把手機當作緊急遙控器。

---

## 2. 優化提案

### 2.1 效能優化

#### 2.1.1 Dashboard 輪詢改為事件驅動 / 長輪詢

- **現況**：Dashboard 每 5 秒 `/api/dashboard`、player 每 3 秒、library/playlist 每 10 秒。
- **問題**：無更新時也持續打 API，浪費頻寬與 CPU，且 status 更新有延遲。
- **方案**：
  1. 短期：引入 **HTTP long-polling** `/api/events`（30s timeout），Pi 端維護一個 `asyncio.Queue`，當 player 狀態、system 狀態、sync 進度變化時 push 事件。
  2. 長期：Pi 與 Cloud 間建立 **WebSocket over MQTT** 或 **MQTT retained status topic**，Cloud 直接訂閱 `nikko/<storeId>/status/+` 取得即時變化。
- **影響檔案**：`app/main.py`、新增 `app/routes/events.py`、`app/static/app.js`、`cloud-vercel/lib/mqtt.js`。
- **驗收指標**：無事件時 Dashboard 每秒請求數趨近於 0；事件延遲 < 1s。

#### 2.1.2 SQLite 連線與索引

- **現況**：每次 `get_setting`/`set_setting` 都開新連線，沒有 connection pool 也沒有索引。
- **問題**：高頻輪詢下 SQLite 反覆開檔；設定表無 primary key 約束。
- **方案**：
  1. 啟動時建立 `sqlite3.Connection` 並註冊 PRAGMA：`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`。
  2. 設定表加 `UNIQUE(key)` 與索引；audit_log 按 `created_at` 索引以利查詢與清理。
  3. 引入 `sqlite3.Row` factory 與 prepared statement cache。
- **影響檔案**：`app/db.py`、新增 migration script `scripts/migrate_001_indexes.py`。
- **驗收指標**：`/api/dashboard` p95 latency < 50ms（目前本機觀察約 100–200ms）。

#### 2.1.3 靜態資源與快取策略

- **現況**：已加入 `?v=` cache-busting 與 no-cache headers。
- **優化**：
  1. CSS/JS 進行 gzip/Brotli 預壓縮，Nginx/Caddy 前端或 uvicorn middleware 提供 `Content-Encoding`。
  2. 音樂封面/縮圖使用 `ETag` 與 `Cache-Control: max-age=86400`，避免重複傳輸。
  3. 引入 Service Worker 做離線快取（見 4.2 PWA）。
- **影響檔案**：新增 `app/middleware/compression.py`、調整 `app/main.py` static 設定。

#### 2.1.4 Sync 狀態批次上報

- **現況**：sync 進度透過 API 輪詢取得。
- **方案**：sync runner 將進度寫入 SQLite，web 透過事件佇列即時推送；Cloud 訂閱 MQTT status topic 取得 sync 摘要。
- **影響檔案**：`app/services/sync_manager.py`、`app/services/sync_runner.py`。

---

### 2.2 可靠性 / 穩定性

#### 2.2.1 MQTT 心跳與離線偵測

- **方案**：
  1. Pi 端每 30 秒發布 retained `nikko/<storeId>/status/heartbeat`（含 timestamp、uptime、storeId）。
  2. Cloud 端記錄最後心跳時間；超過 90 秒未更新則標記店點為 offline。
  3. MQTT client 啟用 `clean_session=False`（QoS 1），確保短暫斷線時指令不遺失。
- **影響檔案**：`app/mqtt_client.py`、`cloud-vercel/lib/mqtt.js`、新增 `cloud-vercel/lib/storeHeartbeat.js`。

#### 2.2.2 指令下發重試與冪等性

- **現況**：Cloud 發送指令後等 10 秒，超時即失敗，不會重試。
- **方案**：
  1. 引入 requestId 冪等表（in-memory + TTL）。Pi 已處理過的 requestId 直接回傳 cached response。
  2. Cloud 對重要指令（sync、restart_player）進行最多 3 次指數退避重試。
  3. 提供指令歷史頁面，顯示每個 requestId 的狀態與 response。
- **影響檔案**：`app/mqtt_client.py`、`cloud-vercel/lib/mqtt.js`、新增 `cloud-vercel/app/commands/CommandHistory.js`。

#### 2.2.3 服務健康檢查與看門狗

- **方案**：
  1. Pi 新增 `/health` endpoint 回傳 web/db/mqtt/player/sync 健康狀態。
  2. 新增 `nikko-music-watchdog.timer` 每 5 分鐘執行 `app/services/health_check.py`；若 player/web 異常則發出 MQTT alert 並嘗試重啟。
  3. systemd units 加入 `ExecStartPost` 與 `ExecStopPost` 發送 lifecycle 事件。
- **影響檔案**：新增 `app/routes/health.py`、`app/services/health_check.py`、`app/systemd/nikko-music-watchdog.*`。

#### 2.2.4 設定檔與 env 驗證

- **方案**：啟動時使用 Pydantic `BaseSettings` 驗證所有 env，缺值或格式錯誤立即啟動失敗並給出清楚錯誤訊息。
- **影響檔案**：新增 `app/settings.py`（Pydantic model），改寫 `app/config.py` 為其 wrapper。

---

### 2.3 安全強化

#### 2.3.1 多角色權限（RBAC）

- **現況**：只有單一 admin；Cloud 與 Pi 皆無角色區分。
- **方案**：
  - Cloud：admin / operator / viewer。
    - admin：可改設定、發送危險指令、管理帳號。
    - operator：可發送播放/同步指令，不可改 MQTT secret/重開機。
    - viewer：唯讀。
  - Pi：本地 admin / staff。staff 只能控制播放，不能改設定或發送系統指令。
- **影響檔案**：`app/routes/auth.py`、新增 `app/models/role.py`、Cloud `lib/auth.js`、資料表新增 `roles`。

#### 2.3.2 MFA / TOTP

- **方案**：Cloud admin 可選啟用 TOTP；登入時除帳密外驗證 6 位數 token。
- **影響檔案**：新增 `cloud-vercel/lib/totp.js`、新增 `/api/setup-mfa`、`/api/login-mfa`。

#### 2.3.3 Secrets 自動輪替

- **方案**：
  1. `NIKKO_MQTT_COMMAND_SECRET` 支援兩組 key：`CURRENT` 與 `PREVIOUS`，輪替期間新舊都接受簽名。
  2. Cloud 提供「輪替 MQTT Secret」按鈕，輪替後 Pi 自動重新載入 env 並重啟 MQTT client。
- **影響檔案**：`app/services/mqtt_auth.py`、`app/mqtt_client.py`、Cloud settings。

#### 2.3.4 網路層安全

- **方案**：
  1. 預設強制 MQTT TLS；提供 `MQTT_ALLOW_PLAINTEXT=1` 開關僅供內網測試。
  2. Pi Web 建議前方放 Caddy/Nginx 自動 Let's Encrypt，終止 HTTPS 後反向代理到 uvicorn。
  3. Cloud API 加上 IP allowlist（可選）與 CORS 嚴格限制。

---

### 2.4 可維護性 / DevOps

#### 2.4.1 測試與 CI/CD

- **方案**：
  1. Pi 端引入 `pytest` + `httpx.AsyncClient` + `testcontainers`（可選 SQLite in-memory）。
  2. Cloud 端保留 `node --test`，並加入 `playwright` E2E 測試登入/新增店點/發送指令。
  3. GitHub Actions：push 時執行 `pytest`、`npm test`、`npm run build`；merge 到 main 後自動 deploy Vercel；Pi 部署仍維持手動觸發或 rsync。
- **影響檔案**：新增 `.github/workflows/ci.yml`、新增 `tests/` 測試。

#### 2.4.2 結構化日誌與遙測

- **方案**：
  1. Python 端統一使用 `structlog` JSON 輸出；Cloud 使用 `pino`。
  2. 可選整合 Sentry / Axiom / Datadog，收集錯誤與效能指標。
  3. audit log 加上 `ip`、`user_agent`、指令結果摘要，保留 90 天後歸檔。
- **影響檔案**：`app/main.py`、middleware、Cloud middleware。

#### 2.4.3 版本與 OTA

- **方案**：
  1. Pi `/api/version` 回傳 git commit hash 與 branch。
  2. Cloud 顯示各店點版本，並標記「需更新」提示。
  3. 長期可透過 MQTT 下發 `update` 指令，Pi 執行 `git pull` + `pip install -r requirements.txt` + `systemctl restart`（需謹慎設計簽名與 rollback）。

---

### 2.5 使用者體驗

#### 2.5.1 手機版 / 響應式優化

- **方案**：
  1. Dashboard grid 在小螢幕改為單欄；player controls 改為底部固定 bar。
  2. 增加 touch gesture：左滑下一首、右滑暫停。
  3. 表單輸入放大 tap target 至 44px。
- **影響檔案**：`app/static/style.css`、`app/templates/dashboard.html`。

#### 2.5.2 深色模式

- **方案**：CSS variables 定義 light/dark palette，根據 `prefers-color-scheme` 切換，並提供手動 toggle。
- **影響檔案**：`app/static/style.css`。

#### 2.5.3 鍵盤快速鍵

- **方案**：Dashboard 支援 `Space` 播放/暫停、`→` 下一首、`↑/↓` 音量、`M` 靜音。
- **影響檔案**：`app/static/app.js`。

---

## 3. 新功能設計

### 3.1 時段排程（Schedule）

#### 需求

門市需要依時段播放不同歌單或音量，例如：
- 08:00–11:00 輕音樂，音量 60
- 11:00–14:00 熱鬧歌單，音量 80
- 14:00–17:00 輕音樂，音量 65
- 17:00–22:00 熱鬧歌單，音量 85

#### 設計

- **資料模型**（Pi SQLite + Cloud Supabase）：
  ```sql
  CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL,
    name TEXT,
    start_time TEXT NOT NULL,   -- HH:MM
    end_time TEXT NOT NULL,     -- HH:MM
    days_of_week TEXT,          -- 1,2,3,4,5,6,7
    playlist_path TEXT,         -- 可指向資料夾或 .m3u
    volume INTEGER,
    shuffle INTEGER,
    loop INTEGER,
    enabled INTEGER DEFAULT 1
  );
  ```
- **排程執行器**：
  - Pi 新增 `app/services/scheduler.py`，由 systemd timer 每分鐘觸發，或 web 啟動 background task 監控。
  - 比對目前時間與生效 schedule，若需要切換則呼叫 mpv 載入對應 playlist 並調整音量。
- **UI**：
  - Pi Dashboard 新增「排程」區塊，以時間軸呈現。
  - Cloud 提供全店排程模板：可一次指派給多家店，或各店獨立。
- **API**：
  - `GET/POST/PUT/DELETE /api/schedules`
  - `GET /api/schedules/active`

#### 驗收標準

- 到達 schedule 開始時間 30 秒內自動切換歌單與音量。
- Cloud 可對單店或多店套用/移除排程。
- 排程衝突時優先採用「結束時間最近」的規則，並在 UI 顯示警告。

---

### 3.2 中央音樂庫與內容審核

#### 需求

Cloud 管理員需要知道每個 Pi 有哪些音樂，並能遠端指派/禁止特定曲目。

#### 設計

- **音樂清單上報**：
  - Pi 定期將本地音樂清單（path、size、duration、metadata）透過 MQTT status topic 或 HTTP 上傳到 Cloud。
  - Cloud 存到 Supabase `store_music` 表，建立全域/各店音樂索引。
- **音樂搜尋與標籤**：
  - 支援依店點、曲風、語言、年份標籤搜尋。
  - 可設定 `banned` 標籤，Pi 收到後自動從 playlist 移除。
- **指派歌單（Playlist）**：
  - Cloud 建立 playlist（資料夾 + 順序），下發到指定店點。
  - Pi 收到後產生 `.m3u` 並重新載入 player。
- **同步狀態追蹤**：
  - 每首歌顯示「已同步 / 同步中 / 缺失」狀態。

#### 驗收標準

- Cloud 能在 10 秒內搜尋到所有店點的音樂。
- 禁止曲目在 1 分鐘內從所有生效 playlist 移除。
- 下發 playlist 後 Pi 自動重新載入並回傳確認。

---

### 3.3 即時同步播放（Multi-store Sync Playback）

#### 需求

連鎖店促銷或整點報時時，希望多店同步播放同一首音樂。

#### 設計

- **機制**：
  - Cloud 發送 `sync_play` 指令，附 `track_url`、`start_at_utc`（例如 5 秒後）。
  - Pi 收到後預載音樂，並在 `start_at_utc` 時間戳啟動播放，利用 NTP 同步時鐘。
- **精度**：
  - 要求 Pi 啟用 NTP；預期誤差 < 200ms。
  - 可選使用 mpv `--start` 參數做偏移補償。
- **UI**：
  - Cloud Dashboard 提供「群組播放」按鈕，選取店點群組後選曲播放。

#### 驗收標準

- 3 家以上店點在同一 UTC 時間啟動播放，誤差 < 500ms。

---

### 3.4 告警與通知中心

#### 需求

當店點離線、同步失敗、player 異常、磁碟空間不足時，主動通知管理員。

#### 設計

- **告警規則引擎**（Cloud）：
  - store offline：心跳逾時 90 秒。
  - sync failed：sync status = failed。
  - player stopped unexpectedly：狀態從 active 變為 failed/stopped。
  - disk low：可用空間 < 10%。
- **通知渠道**：
  - 站內通知（Cloud UI badge）。
  - Email（SMTP / Resend）。
  - Line / Slack webhook（可選）。
  - MQTT alert topic：Pi 也可接收 alert 並在本地 dashboard 顯示。
- **靜音與確認**：
  - 每條告警可標記 acknowledged；可設定靜音時段。

#### 驗收標準

- 觸發條件後 30 秒內產生告警。
- 管理員可在 Cloud 看到所有店點告警歷史。

---

### 3.5 報表與分析

#### 需求

總部希望了解各店播放狀況、熱門曲目、異常次數。

#### 設計

- **資料收集**：
  - Pi 播放事件（track start/end）寫入 SQLite，每小時彙整後上傳 Cloud。
  - Cloud 存到 Supabase `play_events`。
- **報表**：
  - 各店每日播放時數、曲目次數、音量分布。
  - 熱門曲目排行。
  - sync/player 異常次數趨勢。
- **匯出**：CSV / PDF。

#### 驗收標準

- 報表可查詢過去 30 天資料。
- 匯出 CSV 在 3 秒內完成。

---

### 3.6 Progressive Web App（PWA）

#### 需求

店長或管理員不需安裝 App，就能用手機控制播放與查看狀態。

#### 設計

- **manifest.json**：定義 name、icons、theme、start_url。
- **Service Worker**：
  - 快取 static assets、offline 頁面。
  - 背景同步：離線時的操作在下一次連線時補發。
- **Push Notification**：Cloud 透過 Web Push 發送告警到手機。
- **影響檔案**：新增 `app/static/manifest.json`、`app/static/sw.js`、`app/templates/offline.html`。

#### 驗收標準

- Android/iPhone 可「加入主畫面」。
- 離線時可看到最近狀態與基本控制按鈕。

---

### 3.7 第三方整合 / Webhook

#### 需求

與 POS、門禁、排班系統連動，例如開店自動播放、打烊自動停止。

#### 設計

- **Cloud Webhook API**：
  - `POST /api/webhook/<storeId>/event`
  - 支援事件：`store_open`、`store_close`、`promotion_start`、`emergency_stop`。
  - 驗證：HMAC signature 或 static token。
- **Pi 本地 webhook**（可選）：
  - 直接接收門店設備事件，減少 Cloud 延遲。
- **動作對應**：
  - 事件 → 規則引擎 → 播放/暫停/切換歌單/調整音量。

#### 驗收標準

- Webhook 觸發後 2 秒內 Pi 執行對應動作。

---

### 3.8 遠端診斷與 Log 串流

#### 需求

管理員在 Cloud 就能看 Pi 的 log，不用 SSH。

#### 設計

- **Log 上傳**：
  - Pi `app/routes/logs.py` 已有 `/api/logs/all`、`/api/logs/export`。
  - 新增 `/api/logs/stream` SSE，持續推送最新 journal 內容。
- **Cloud 整合**：
  - Cloud 透過 MQTT 請求 `logs_tail`，Pi 回傳最後 N 行；或透過 HTTPS SSE 串流（若 Pi 有 public IP/Tailscale）。
  - 在 Cloud Store detail 頁新增「Remote Logs」區塊。

#### 驗收標準

- Cloud 可在 5 秒內查看 Pi 最近 100 行 log。

---

## 4. 實施路線圖

### Phase 1：穩定與效能（2–3 週）

1. SQLite WAL + connection pool + indexes。
2. Dashboard long-polling / events endpoint。
3. MQTT heartbeat + offline detection。
4. Health check endpoint + watchdog timer。
5. 手機版 responsive 優化。
6. CI/CD（pytest + npm test + build）。

### Phase 2：核心新功能（4–6 週）

1. 時段排程（Pi + Cloud）。
2. 中央音樂庫與 playlist 指派。
3. 告警與通知中心（email + 站內）。
4. 指令重試與指令歷史。
5. RBAC（Cloud admin/operator/viewer、Pi admin/staff）。

### Phase 3：進階與擴展（6–8 週）

1. PWA + Push Notification。
2. 多店同步播放。
3. 報表與分析。
4. Webhook / 第三方整合。
5. 遠端 log 串流。
6. Secrets 自動輪替 + MFA。

---

## 5. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| 長輪詢/SSE 增加 Pi 連線數 | 中 | 設定連線上限與 timeout；必要時用 MQTT retained status 替代。 |
| 排程切換頻繁造成 player 閃斷 | 中 | 排程重疊時給予冷卻時間；提供預覽與衝突警告。 |
| 中央音樂庫資料量大 | 中 | 只上傳 metadata；音檔仍由 Pi 本地/WebDAV 持有。 |
| Webhook 暴露被濫用 | 高 | HMAC 驗證 + IP allowlist + rate limit。 |
| MFA / RBAC 增加登入流程複雜度 | 低 | 可選開啟，viewer/operator 權限明確。 |
| OTA 更新失敗導致遠端門市無法運作 | 高 | 保留舊版本 slot + rollback 機制；灰階更新。 |

---

## 6. 建議優先採用的 3 項

若資源有限，建議先做這三項，ROI 最高：

1. **Dashboard 事件驅動 + MQTT heartbeat**：立即降低輪詢負載，並讓管理員知道店點是否離線。
2. **SQLite WAL + indexes**：立竿見影降低 API latency，為後續功能打好基礎。
3. **時段排程**：直接解決營運最痛的「不同時段播放不同音樂/音量」需求。

---

## 7. 預估影響的主要檔案

| 類別 | 檔案 |
|---|---|
| Pi 核心 | `app/main.py`、`app/db.py`、`app/config.py`（Pydantic settings） |
| Pi API | `app/routes/events.py`、`app/routes/health.py`、`app/routes/schedules.py`、`app/routes/logs.py` |
| Pi 業務 | `app/services/scheduler.py`、`app/services/health_check.py`、`app/services/sync_manager.py`、`app/mqtt_client.py` |
| Pi UI | `app/static/style.css`、`app/static/app.js`、`app/templates/dashboard.html`、`app/templates/schedules.html` |
| Pi systemd | `app/systemd/nikko-music-watchdog.service`、`app/systemd/*.service` |
| Cloud | `cloud-vercel/lib/mqtt.js`、`cloud-vercel/lib/storeHeartbeat.js`、`cloud-vercel/app/schedules/*`、`cloud-vercel/app/alerts/*` |
| 測試/CI | `.github/workflows/ci.yml`、`tests/`、`cloud-vercel/test/` |

---

> 結論：本方案以「先穩定、再自動化、最後擴展」為原則，逐步把 NikkoMusicHub 從單店播放工具升級為可規模化管理、可觀測、可整合的連鎖門市音樂平台。
