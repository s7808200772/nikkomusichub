# NikkoMusicHub 優化與新功能設計方案

> 本文件為規劃案，不會直接修改任何程式碼。目標：在既有 `security-final` 基礎上，提出可落地的優化方向與新功能設計，供評估優先序與資源配置。本文件已根據目前程式碼狀態更新：Phase 0~3 核心項目大多已實作，以下仍保留長期擴展建議。

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
- Cloud 多店管理、測試連線、指令下發、批次指令、告警、OTA、遠端 log。

### 1.3 已發現的痛點

- Cloud 與 Pi 之間的所有狀態都靠輪詢 + MQTT request/response，沒有長連線心跳。
- 沒有集中式「事件/告警」機制；店點離線或 sync/player 異常只能人工發現（已有 Cloud 告警，但規則可擴充）。
- 音樂內容管理在 Pi 本機，Cloud 可瀏覽但無法直接審核/指派歌單。
- 沒有播放時段/排程，無法做到「早上輕音樂、晚上節奏強」這類營運需求。
- 缺乏觀測：log 分散、無 metrics、無 tracing。
- 單一 admin 角色；多使用者/多權限場景未處理。
- 手機版體驗未優化。
- 沒有 PWA，店長無法把手機當作緊急遙控器。

---

## 2. 優化提案

### 2.1 效能優化

#### 2.1.1 Dashboard 輪詢改為事件驅動 / 長輪詢

- **現況**：Dashboard 已引入 `/api/events` long-polling，但部分區塊仍保留輪詢。
- **方案**：擴大 `/api/events` 覆蓋範圍，或改由 MQTT retained status topic 驅動 Cloud UI。
- **影響檔案**：`app/main.py`、`app/static/app.js`、`cloud-vercel/lib/mqtt.js`。

#### 2.1.2 SQLite 連線與索引

- **現況**：已啟用 WAL、indexes、per-thread connection pool。
- **方案**：持續監控 `/api/dashboard` p95 latency，必要時加入 connection cache。
- **影響檔案**：`app/db.py`。

#### 2.1.3 靜態資源與快取策略

- **現況**：已加入 `?v=` cache-busting 與 GZipMiddleware。
- **優化**：Brotli 預壓縮、Service Worker 離線快取（見 PWA 章節）。

### 2.2 可靠性 / 穩定性

#### 2.2.1 MQTT 心跳與離線偵測

- **現況**：Pi 每 30 秒發 retained `nikko/<storeId>/status`。
- **方案**：Cloud 記錄最後心跳時間，超過 90 秒未更新則標記 offline。

#### 2.2.2 指令下發重試與冪等性

- **現況**：Cloud 已實作最多 3 次指數退避重試，Pi 已處理 requestId 去重。
- **方案**：加入指令歷史頁面，顯示每個 requestId 的狀態與 response。

#### 2.2.3 服務健康檢查與看門狗

- **現況**：已有 `/health`、`nikko-music-watchdog.timer`。
- **方案**：進一步整合 Prometheus / node_exporter，或送出 MQTT alert。

### 2.3 安全強化

#### 2.3.1 多角色權限（RBAC）

- **現況**：只有單一 admin。
- **方案**：Cloud admin / operator / viewer；Pi admin / staff。

#### 2.3.2 MFA / TOTP

- **現況**：未實作。
- **方案**：Cloud admin 可選啟用 TOTP。

#### 2.3.3 Secrets 自動輪替

- **現況**：設計文件 `docs/MQTT_CREDENTIAL_MANAGEMENT.md` 已規劃。
- **方案**：Cloud「輪替 Command Secret」按鈕，對在線 Pi 發送更新指令。

#### 2.3.4 網路層安全

- **現況**：repo 預設 plaintext MQTT；生產建議 TLS。
- **方案**：預設強制 MQTT TLS；Pi Web 前方放 Caddy/Nginx 自動 HTTPS。

### 2.4 可維護性 / DevOps

#### 2.4.1 測試與 CI/CD

- **方案**：GitHub Actions 執行 `pytest`、`npm test`、`npm run build`；merge 到 main 後自動 deploy Vercel。
- **影響檔案**：新增 `.github/workflows/ci.yml`、擴充 `tests/`。

#### 2.4.2 結構化日誌與遙測

- **方案**：Python 使用 `structlog` JSON 輸出；Cloud 使用 `pino`；可選 Sentry。

### 2.5 使用者體驗

#### 2.5.1 手機版 / 響應式優化

- **方案**：Dashboard grid 在小螢幕改為單欄；player controls 改為底部固定 bar。

#### 2.5.2 深色模式

- **方案**：CSS variables 根據 `prefers-color-scheme` 切換。

---

## 3. 新功能設計

### 3.1 時段排程（Schedule）

需求：依時段播放不同歌單或音量。
資料模型：Pi SQLite + Cloud Supabase `schedules` 表。
執行器：Pi `app/services/scheduler.py` 由 systemd timer 每分鐘觸發。

### 3.2 中央音樂庫與內容審核

需求：Cloud 管理員瀏覽/審核/禁止各店曲目。
現況：已可在 `/stores` 查看各店音樂與遠端 WebDAV 列表。
擴充：加入 `store_music` 表、搜尋、標籤、`banned` 標記。

### 3.3 即時同步播放（Multi-store Sync Playback）

需求：促銷或整點報時時多店同步播放同一首音樂。
機制：Cloud 發送 `sync_play` 指令，附 `start_at_utc`；Pi 依 NTP 時間啟動。

### 3.4 告警與通知中心

現況：Cloud 已有 alerts table 與規則引擎，LINE/webhook 通知。
擴充：Email 通知、告警靜音/確認、靜音時段。

### 3.5 報表與分析

需求：各店播放時數、熱門曲目、異常次數。
資料收集：Pi 播放事件寫入 SQLite，每小時彙整上傳 Cloud `play_events`。

### 3.6 Progressive Web App（PWA）

需求：店長用手機控制播放與查看狀態。
設計：`manifest.json`、`sw.js`、offline 頁面、Web Push（可選）。

### 3.7 第三方整合 / Webhook

需求：與 POS、門禁、排班系統連動。
設計：Cloud `POST /api/webhook/<storeId>/event`（store_open / store_close / promotion_start / emergency_stop），HMAC 驗證。

---

## 4. 實施路線圖建議

### Phase 1：穩定與效能（2–3 週）

1. 擴大 `/api/events` 覆蓋範圍。
2. MQTT offline detection 上線。
3. 手機版 responsive 優化。
4. GitHub Actions CI/CD。

### Phase 2：核心新功能（4–6 週）

1. 時段排程（Pi + Cloud）。
2. 中央音樂庫搜尋/標籤/banned。
3. 告警 Email / 靜音確認。
4. RBAC（Cloud admin/operator/viewer、Pi admin/staff）。

### Phase 3：進階與擴展（6–8 週）

1. PWA + Push Notification。
2. 多店同步播放。
3. 報表與分析。
4. Webhook / 第三方整合。
5. Secrets 自動輪替 + MFA。

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

1. **Dashboard 事件驅動 + MQTT offline detection**：立即降低輪詢負載，並讓管理員知道店點是否離線。
2. **時段排程**：直接解決營運最痛的「不同時段播放不同音樂/音量」需求。
3. **RBAC**：隨著團隊擴大，區分 admin/operator/viewer 權限至關重要。

---

> 結論：本方案以「先穩定、再自動化、最後擴展」為原則，逐步把 NikkoMusicHub 從單店播放工具升級為可規模化管理、可觀測、可整合的連鎖門市音樂平台。Phase 0~3 核心功能已在 `security-final` 完成，長期項目可視公司資源與營運需求擇優實作。
