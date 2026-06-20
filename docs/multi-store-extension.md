# 後續多店中央管理平台擴展方案

## 現有預留欄位

每台 Pi 已經儲存：

- `store_id`
- `store_name`
- `device_id`
- `hostname`
- `tailscale_ip`
- `location_note`
- `music_profile`
- `last_seen`
- `last_sync_at`
- `last_error`

## 中央平台架構

```
中央管理後台 (Cloud/VPS)
    │
    ├── 接收各店 heartbeat
    ├── 發送指令 (sync, play, pause, reboot)
    └── 彙總狀態 Dashboard

各店 NikkoMusicHub (Pi)
    │
    ├── 定期回報狀態到中央
    └── 輪詢/接收 Webhook 指令
```

## 實作步驟

1. **Heartbeat 模組**
   - 新增 `nikko-heartbeat.timer` / `nikko-heartbeat.service`。
   - 每 5 分鐘 POST 到中央 `/api/edge/heartbeat`。
   - 內容包含 store_id、device_id、tailscale_ip、player_status、last_sync_at。

2. **中央 API**
   - `/api/edge/heartbeat`：接收心跳。
   - `/api/edge/command`：讓 Pi 輪詢待執行指令。
   - `/api/stores`：列出所有店。
   - `/api/stores/<id>/sync`：對單店或批量下達同步指令。
   - `/api/stores/<id>/play` / `/api/stores/<id>/pause` / `/api/stores/<id>/reboot`

3. **Pi 端指令輪詢**
   - 在 Web 服務中加入背景 thread / APScheduler。
   - 定期從中央拉取指令並執行對應服務函式。
   - 執行後回報結果。

4. **WebSocket / SSE 即時狀態**
   - 中央平台可用 SSE 推送各店狀態變化。

5. **Dashboard 多店視圖**
   - 一覽 30~100 間店的線上狀態、播放狀態、同步時間、磁碟空間。
   - 紅/黃/綠燈快速識別異常店點。

## 部署建議

- 中央後台使用 Docker Compose：FastAPI + PostgreSQL + Redis。
- 使用 Tailscale 連線，中央伺服器也加入同一個 Tailscale network。
- 對於大量門市，指令佇列可用 Redis Streams 或 RabbitMQ。
