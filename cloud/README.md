# NikkoMusicHub Cloud｜中央管理平台

透過 **SSH + Tailscale** 主動連入各店 Raspberry Pi，統一監控所有 NikkoMusicHub 節點。

## 適用場景

- 管理 30~100 間門市音樂節點
- 從單一網頁查看各店狀態、最近同步時間、播放狀態
- 遠端執行預定義指令（同步、播放控制、重啟等）

## 技術架構

| 層級 | 技術 |
|------|------|
| 後端 | Python 3 + FastAPI |
| 前端 | 原生 HTML + CSS + JS |
| 資料庫 | SQLite |
| SSH 連線 | paramiko |
| 部署 | VPS / Docker / systemd |

## 目錄結構

```
cloud/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── ssh.py
│   ├── routes/
│   ├── templates/
│   └── static/
├── systemd/
│   └── nikko-music-hub-cloud.service
├── install.sh
├── requirements.txt
└── README.md
```

## 安裝與執行

### 方式一：一鍵安裝腳本（推薦）

```bash
cd cloud
sudo bash install.sh
```

### 方式二：VPS 手動部署

從專案根目錄執行：

```bash
cd cloud
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
uvicorn cloud.app.main:app --host 0.0.0.0 --port 8000
```

### 方式三：systemd 服務

`cloud/systemd/nikko-music-hub-cloud.service` 已提供。複製後啟用：

```bash
sudo cp cloud/systemd/nikko-music-hub-cloud.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nikko-music-hub-cloud.service
```

## 首次登入

預設帳號：`nikkolh`  
預設密碼：`topup30%off`

登入後請立即修改密碼。

## 新增店點

1. 在各店 Pi 上安裝 NikkoMusicHub（上層 `install.sh`）。
2. 確保中央平台伺服器能透過 Tailscale 連到 Pi 的 Tailscale IP。
3. 確保 Pi 已加入你的 SSH public key（通常是 cloud 平台的 SSH key pair）。
4. 到 Cloud 平台的 **Stores** 頁面，填入：
   - Store ID、店名
   - Tailscale IP
   - SSH 使用者（預設 pi）
   - SSH Private Key（cloud 平台的 private key）

## 遠端指令白名單

所有可執行指令已定義在 `app/config.py` 的 `REMOTE_COMMANDS`，不允許任意命令注入。

目前支援：

- 取得 Dashboard / System / Player 狀態
- 播放、暫停、繼續、下一首
- 手動同步 Dropbox
- 重新掃描音樂
- 重啟播放服務
- 重開機 Raspberry Pi

## 安全注意事項

- 中央平台應部署在受控環境（VPS），並只對管理員開放。
- 建議使用 HTTPS + 反向代理（如 Nginx / Caddy）。
- SSH private key 儲存在 SQLite 中，請確保資料庫檔案權限 (`cloud/data/nikko-cloud.db`) 限制為 600。
- 本地 API 只接受來自 `127.0.0.1` 的請求，無法從外部直接呼叫。
- 所有遠端指令寫入 audit log。

## Vercel 不適用聲明

Cloud 平台需要長期運行、建立 SSH 連線、儲存金鑰與 SQLite，**不適合部署到 Vercel**。請使用 VPS 或專屬伺服器。
