# MQTT 帳密管理設計

## 現況

- 所有 Pi 目前共用同一組 MQTT broker 帳密（`NIKKO_MQTT_USERNAME` / `NIKKO_MQTT_PASSWORD`）。
- 每台 Pi 使用獨立的 `clientId`（由 `store_id` + 隨機字串組成），避免互相踢線。
- Command Secret（`NIKKO_MQTT_COMMAND_SECRET`）全域共用，用於 HMAC 簽署 Cloud → Pi 指令。

## 風險

1. 單一組帳密外洩，所有門市都可能被控制。
2. 離職人員或外洩後難以只撤銷單一門市權限。
3. 長期營運下憑證輪替困難。

## 目標

過渡期內（店點數 < 20）：
- 維持共用 broker 帳密，但文件化輪替流程。
- 每台 Pi 獨立 `clientId`，broker 可藉此識別與斷線。
- 提供「一鍵輪替 Command Secret」機制，降低單點外洩風險。

成熟期（店點數 > 20 或上市前）：
- 評估 EMQX ACL + 每店獨立帳密（透過 EMQX HTTP API 或 JWT auth）。
- 或改用 EMQX 的 Webhook authentication，讓 Pi 開機時向 Cloud 註冊並取得短期憑證。

## 過渡方案細節

### 1. clientId 規則

```
nikko-<store_id>-<device_id>-<random>
```

- `store_id`：Cloud 設定的 Store ID。
- `device_id`：Pi 本地設定的裝置 ID（例如 `pi-001`）。
- `random`：啟動時產生的 8 碼亂數，避免同一台 Pi 重啟後被 broker 視為重複連線。

### 2. 帳密儲存

- Pi：`nikko.env` 中 `NIKKO_MQTT_USERNAME`、`NIKKO_MQTT_PASSWORD`。
- Cloud：`stores` 資料表 `mqtt_username`、`mqtt_password`。
- 兩者皆不寫入 Git，Cloud 端透過 Vercel / Supabase 環境變數管理。

### 3. Command Secret 輪替

- Cloud 管理者在 Settings 頁點「輪替 Command Secret」。
- Cloud 產生新 Secret，寫入 `cloud_settings`。
- 對所有在線 Pi 發送 `update_command_secret` 指令（HMAC 仍用舊 Secret 簽署）。
- Pi 收到後更新 `nikko.env` 並重啟 MQTT agent。
- 輪替完成後，舊 Secret 保留 24 小時容忍時鐘誤差與重送攻擊。

### 4. 權限最小化

- EMQX ACL 規則：
  - 每個帳號只能 publish 到 `nikko/<store_id>/resp`。
  - 每個帳號只能 subscribe `nikko/<store_id>/cmd`。
  - Cloud 服務帳號可 publish 到所有 `nikko/+/cmd` 並 subscribe 所有 `nikko/+/resp`。

## 為何不現在實作獨立帳密

- 需要 broker 主機管理權限（EMQX API / 憑證產生）。
- 門市數量尚少，共用帳密 + 定期輪替的風險可控。
- 優先完成批量控制、告警、OTA 等營運功能，成熟後再升級憑證架構。

## 驗收標準

- [ ] 每台 Pi 的 MQTT clientId 包含 store_id 與 device_id。
- [ ] Command Secret 可在 Cloud 端一鍵輪替並通知所有在線 Pi。
- [ ] 文件化輪替步驟與緊急撤銷流程。
