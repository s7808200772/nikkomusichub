# NikkoMusicHub Cloud（Vercel 版）

中央管理平台，透過 MQTT 管理各地 Raspberry Pi 音樂節點。

## 功能

- 登入頁面與 JWT 認證
- 左側側邊欄導航（參考 Pi 端介面風格）
- **總覽控制台 `/`**：各店狀態、統計卡片、遠端指令控制台
- **店點管理 `/stores`**：店點列表、MQTT 設定、音樂庫同步、OTA 更新、預設 Broker
- **監控與紀錄 `/monitoring`**：告警中心、遠端 Log
- 遠端執行預定義指令（播放控制、同步、重啟、重開機）

## 運作方式

Cloud 與 Pi 之間透過 MQTT 溝通：

- Cloud 發布簽章指令到 `<private-prefix>/<storeId>/cmd`
- Pi 訂閱指令、執行後回傳結果到 `<private-prefix>/<storeId>/resp`
- Pi 定期發布狀態到 `<private-prefix>/<storeId>/status`

MQTT 使用 HMAC 簽章、時效檢查與 requestId 防重放；Pi 與 Cloud 必須設定相同的 command secret 與 topic prefix。生產環境建議啟用 TLS。

## 本地開發

```bash
cd cloud-vercel
npm install
npm run dev
```

開啟 http://localhost:3000/login。管理帳密只從環境變數讀取，沒有程式碼預設值。

## 部署到 Vercel

```bash
cd cloud-vercel
npx vercel --prod
```

建議設定環境變數：

- `NIKKO_ADMIN_USER`、`NIKKO_ADMIN_PASS`：管理員帳密
- `NIKKO_CLOUD_SECRET`：JWT 簽章金鑰
- `NIKKO_MQTT_COMMAND_SECRET`：與 Pi 相同的 HMAC 密鑰
- `NIKKO_MQTT_BROKER`、`NIKKO_MQTT_PORT`、`NIKKO_MQTT_USERNAME`、`NIKKO_MQTT_PASSWORD`：broker 連線資訊（預設 `114.55.1.51:1883` plaintext）
- `NIKKO_MQTT_CA`、`NIKKO_MQTT_TLS_SERVERNAME`：私有 broker Root CA 與憑證名稱
- `NIKKO_MQTT_TLS_VERIFY`：設 `0` 可暫時關閉 broker 憑證驗證（測試用）
- `NIKKO_MQTT_TOPIC_PREFIX`：與 Pi 相同的私有 topic prefix
- `SUPABASE_URL`、`NIKKO_SUPABASE_PROXY_SECRET`：透過受保護 Edge Function 存取正式資料庫

## 新增店點

1. 各店 Pi 完成 NikkoMusicHub 安裝（上層 `install.sh`）
2. 記下 Pi 的 MQTT Store ID（安裝完成時會顯示，通常是 hostname）
3. 登入 Cloud，到 `/stores` 填入：
   - Store ID（必須與 Pi 的 Store ID 一致）
   - 店名
   - MQTT Broker（預設 `114.55.1.51`，生產環境請換成自己的 broker）
   - MQTT Port（預設 `1883` plaintext；生產環境建議 `8883` TLS）
   - 私有 broker 使用者 / 密碼（若 broker 提供）
4. 點「測試連線」確認 Pi 有回應

## 技術限制

- 未設定 Supabase 時，遠端指令與連線測試會停用。
- 共用 broker 仍必須使用 TLS、私有 topic prefix 與 HMAC；正式營運建議再換成帳密隔離的專用 broker。
- Vercel Serverless Function 每次請求獨立連線 MQTT，指令回應上限約 10~15 秒。

## 檔案結構

```
cloud-vercel/
├── app/
│   ├── api/              # 後端 API（auth、command、stores、settings、ota、logs、alerts...）
│   ├── commands/         # CommandsClient（現由總覽控制台引用）
│   ├── login/
│   ├── monitoring/       # 告警 + Log 整合頁面
│   ├── stores/           # 店點 + Library + OTA + Settings 整合頁面
│   ├── DashboardClient.js
│   ├── globals.css
│   ├── layout.js
│   └── page.js           # 總覽控制台
├── components/
│   ├── AppShell.js       # 側邊欄外殼
│   ├── Sidebar.js        # 左側導航
│   ├── Tabs.js           # 分頁元件
│   └── SupabaseWarning.js
├── lib/
│   ├── auth.js
│   ├── db.js
│   └── mqtt.js
├── next.config.mjs
├── package.json
└── README.md
```
