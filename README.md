# NikkoMusicHub

Raspberry Pi 門市音樂管理系統，透過 MQTT 讓中央平台管理多店播放、同步與狀態。

## 系統組成

- `app/`：Pi 端 FastAPI 本機管理 + MQTT 客戶端
- `cloud/`：VPS 版 FastAPI 中央平台
- `cloud-vercel/`：Vercel 版 Next.js 中央平台

## 主要功能

**Pi 端**
- 瀏覽器登入管理（JWT + cookie）
- 系統 Dashboard、播放控制、QNAP NAS WebDAV 同步
- MQTT 客戶端，接收 Cloud 指令並回傳狀態
- systemd 服務：Web、Player、Sync、MQTT

**Cloud 端**
- 單一網址登入管理所有店點
- 透過 MQTT 發送指令、收集狀態
- 不需要 Tailscale、不需要 SSH

## 安裝 Pi 端

```bash
curl -fsSL https://raw.githubusercontent.com/s7808200772/nikkomusichub/main/install.sh | sudo bash
```

安裝完成後，會顯示：
- Web 登入網址
- MQTT Store ID
- 預設帳號密碼

## 設定 Cloud

1. 部署 `cloud-vercel/` 到 Vercel（或運行 `cloud/` 在 VPS）
2. 在 Cloud 新增店點，Store ID 必須與 Pi 安裝時顯示的 MQTT Store ID 一致
3. 填入 MQTT broker；必須使用 TLS，並讓 Cloud/Pi 共用 HMAC secret 與私有 topic prefix
4. 點測試連線，確認 Pi 有回應

## MQTT Topic

```
nikko/<storeId>/cmd     # Cloud → Pi 指令
nikko/<storeId>/resp    # Pi → Cloud 回應
nikko/<storeId>/status  # Pi 定期狀態
```

## 注意事項

- 生產環境請使用有帳號密碼或 TLS 認證的私有 MQTT broker。
- 預設帳號密碼請在首次登入後立即修改。
