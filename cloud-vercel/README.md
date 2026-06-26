# NikkoMusicHub Cloud (Vercel 版)

中央管理平台，透過 MQTT 管理各地 Raspberry Pi 音樂節點。

## 功能

- 登入頁面與 JWT 認證
- 店點管理（Store ID、店名、MQTT broker 設定）
- Dashboard 查看各店狀態
- 遠端執行預定義指令（播放控制、同步、重啟、重開機）
- Commands 頁面以圖示卡片列出所有店點
- 全域設定：預設 MQTT broker

## 運作方式

Cloud 與 Pi 之間透過 MQTT 溝通：

- Cloud 發布指令到 `nikko/<storeId>/cmd`
- Pi 訂閱指令、執行後回傳結果到 `nikko/<storeId>/resp`
- Pi 定期發布狀態到 `nikko/<storeId>/status`

不需要 Tailscale、不需要 SSH，只要 Pi 與 Cloud 都能連到同一個 MQTT broker 即可。

## 本地開發

```bash
cd cloud-vercel
npm install
npm run dev
```

開啟 http://localhost:3000/login，預設帳號密碼請看專案 `app/config.py`。

## 部署到 Vercel

```bash
cd cloud-vercel
npx vercel --prod
```

建議設定環境變數：

- `NIKKO_ADMIN_USER`：管理員帳號（預設 nikkolh）
- `NIKKO_ADMIN_PASSWORD`：管理員密碼
- `NIKKO_JWT_SECRET`：JWT 簽章金鑰
- `KV_REST_API_URL`、`KV_REST_API_TOKEN`：Vercel KV（生產環境建議）

## 新增店點

1. 各店 Pi 完成 NikkoMusicHub 安裝（上層 `install.sh`）
2. 記下 Pi 的 MQTT Store ID（安裝完成時會顯示，通常是 hostname）
3. 登入 Cloud，到 `/stores` 填入：
   - Store ID（必須與 Pi 的 Store ID 一致）
   - 店名
   - MQTT Broker（預設 `broker.hivemq.com`，生產環境請換成自己的 broker）
   - MQTT Port（預設 `1883`）
   - MQTT 使用者 / 密碼（公開測試 broker 可留空）
4. 點「測試連線」確認 Pi 有回應

## 技術限制

- 未設定 Vercel KV 時，店點與設定存在記憶體 / 本地 JSON 暫存檔，每次重新部署會重置。
- 公開 MQTT broker 僅供測試，生產環境請使用有認證的私有 broker。
- Vercel Serverless Function 每次請求獨立連線 MQTT，指令回應上限約 10~15 秒。

## 檔案結構

```
cloud-vercel/
├── app/
│   ├── api/
│   │   ├── auth/route.js
│   │   ├── command/route.js
│   │   ├── settings/route.js
│   │   ├── stores/route.js
│   │   └── test-connection/route.js
│   ├── commands/
│   ├── login/
│   ├── settings/
│   ├── stores/
│   ├── DashboardClient.js
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/Navbar.js
├── lib/
│   ├── auth.js
│   ├── db.js
│   └── mqtt.js
├── next.config.js
├── package.json
└── README.md
```
