# NikkoMusicHub

Raspberry Pi 門市音樂管理系統，透過私有 MQTT broker 讓中央平台管理多店播放、同步與狀態。

## 系統組成

- `app/`：Pi 端 FastAPI 本機管理 + MQTT 客戶端
- `cloud-vercel/`：Vercel Next.js 中央管理平台
- `supabase/`：Supabase Edge Function 與 migrations

## 主要功能

**Pi 端**
- 瀏覽器登入管理（session + cookie）
- Dashboard、播放控制、QNAP NAS WebDAV 同步、音訊裝置選擇
- MQTT 客戶端，接收 Cloud 指令並回傳狀態
- systemd 服務：Web、Player、Sync、MQTT，以及 Watchdog / Boot-sync / Backup timers
- 自我測試：`python scripts/test-suite.py`

**Cloud 端**
- 單一網址登入管理所有店點
- 批次指令、告警中心、中央音樂庫、遠端 log、OTA 更新
- LINE / webhook 告警通知

## 安裝 Pi 端

```bash
curl -fsSL https://raw.githubusercontent.com/s7808200772/nikkomusichub/security-final/install.sh | sudo bash
```

安裝完成後，會顯示：
- Web 登入網址
- MQTT Store ID
- 預設帳號密碼

後續操作：
1. 用瀏覽器開啟上述網址並登入。
2. 進入 Settings 頁面確認 rclone 與 mpv 設定正確（已無 Setup Wizard）。
3. 進入 NAS WebDAV Sync 設定 QNAP WebDAV 帳號密碼並測試連線。
4. 同步音樂後即可播放。

## 設定 Cloud

1. 部署 `cloud-vercel/` 到 Vercel：`cd cloud-vercel && vercel --prod`
2. 部署 Supabase Edge Function：`supabase functions deploy nikko-cloud-db && supabase db push`
3. 在 Cloud 新增店點，Store ID 必須與 Pi 安裝時顯示的 MQTT Store ID 一致
4. 填入 MQTT broker；預設為 `114.55.1.51:1883` plaintext，生產環境建議使用 TLS，並讓 Cloud/Pi 共用 HMAC secret 與私有 topic prefix（若憑證暫時無法驗證，可設 `NIKKO_MQTT_TLS_VERIFY=0`）
5. 點測試連線，確認 Pi 有回應

詳細設定請見 `cloud-vercel/SUPABASE_SETUP.md`。

## MQTT Topic

```
nikko/<storeId>/cmd     # Cloud → Pi 指令
nikko/<storeId>/resp    # Pi → Cloud 回應
nikko/<storeId>/status  # Pi 定期狀態（retain）
```

## 注意事項

- 生產環境請使用有帳號密碼或 TLS 認證的私有 MQTT broker。
- 預設帳號密碼請在首次登入後立即修改。
- 所有密碼、token、secret 禁止寫入 Git。
