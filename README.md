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
- systemd 服務：Web、Player、Sync、MQTT、Watchdog、Boot-sync、Backup
- 自我測試：`python scripts/test-suite.py`

**Cloud 端**
- 單一網址登入管理所有店點
- 批次指令、告警中心、中央音樂庫、遠端 log、OTA 更新
- LINE / webhook 告警通知

## 安裝 Pi 端

```bash
curl -fsSL https://raw.githubusercontent.com/s7808200772/nikkomusichub/main/install.sh | sudo bash
```

安裝完成後，會顯示：
- Web 登入網址
- MQTT Store ID
- 預設帳號密碼

## 設定 Cloud

1. 部署 `cloud-vercel/` 到 Vercel：`cd cloud-vercel && vercel --prod`
2. 部署 Supabase Edge Function：`supabase functions deploy nikko-cloud-db && supabase db push`
3. 在 Cloud 新增店點，Store ID 必須與 Pi 安裝時顯示的 MQTT Store ID 一致
4. 填入 MQTT broker；必須使用 TLS，並讓 Cloud/Pi 共用 HMAC secret 與私有 topic prefix
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
