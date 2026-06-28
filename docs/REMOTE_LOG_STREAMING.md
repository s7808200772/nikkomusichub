# 遠端 log 串流設計

## 現況

- Pi 本地已有 `/logs` 頁面可查看 player / sync / system / audit log。
- Pi MQTT command whitelist 已加入 `get_log`，可透過 MQTT 索取最近 N 行 log。

## 目標

讓 Cloud 管理者不必 SSH 即可查看任意門市最近 log，縮短故障排查時間。

## 通訊協定

### Pi → Cloud（響應）

```json
{
  "requestId": "uuid",
  "storeId": "store-001",
  "ok": true,
  "resultJson": "{\"log_type\":\"player\",\"lines\":100,\"content\":\"...\"}",
  "error": null,
  "timestamp": 1718810000000,
  "signature": "..."
}
```

### Cloud → Pi（指令）

```json
{
  "requestId": "uuid",
  "commandKey": "get_log",
  "log_type": "player",
  "lines": 100,
  "timestamp": 1718810000000,
  "nonce": "uuid",
  "signature": "..."
}
```

- `log_type`: `player`, `sync`, `system`
- `lines`: 1 ~ 500

## Cloud 頁面規劃

1. `/logs` 列出所有店點。
2. 選擇店點與 log 類型，點「載入」。
3. 前端透過 `/api/logs?storeId=...&type=...&lines=...` 發送 MQTT 指令。
4. 結果以 `<pre>` 顯示，每 10 秒可重新整理。
5. 未來可升級為 Server-Sent Events：Pi 主動推送 log 更新到 Cloud。

## 安全考量

- `get_log` 僅讀取 `/srv/nikko-music/logs/` 下白名單檔案，禁止路徑遍歷。
- Log 內容可能包含檔案路徑，不應包含密碼（已確認 rclone password 不寫入 log）。
- 建議限制每次最大行數 500，避免 MQTT payload 過大。

## 後續工作

- [ ] Cloud `/logs` 頁面實作。
- [ ] `/api/logs` API route 實作。
- [ ] 超過 500 行時提供「下載完整 log」連結（直接呼叫 Pi `/logs`）。
