# NikkoMusicHub｜日光音樂節點

把 Raspberry Pi 變成門市用的「雲端更新、本地播放、可遠端管理」音樂節點。

## 核心特色

- 透過瀏覽器完成所有操作，無需 SSH
- Dropbox 作為母音樂庫，rclone 自動同步
- mpv IPC 播放控制（播放、暫停、下一首、音量…）
- systemd 服務化：Web、播放器、定時同步三個單元
- Tailscale 限定存取，不開放公網
- 預留 store_id / device_id 多店擴充欄位

## 技術架構

| 層級 | 技術 |
|------|------|
| 後端 | Python 3 + FastAPI |
| 前端 | 原生 HTML + CSS + JS |
| 資料庫 | SQLite |
| 雲端同步 | rclone |
| 音樂播放 | mpv + IPC socket |
| 服務管理 | systemd |
| 遠端存取 | Tailscale |

## 專案目錄結構

```
nikkomusichub/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 常數與路徑
│   ├── db.py                # SQLite 工具
│   ├── routes/              # API + 頁面路由
│   ├── services/            # 系統、rclone、mpv 業務邏輯
│   ├── templates/           # Jinja2 HTML 模板
│   └── static/              # CSS / JS
├── scripts/                 # 輔助腳本
├── systemd/                 # systemd unit 檔案
├── requirements.txt
├── install.sh               # 一鍵安裝腳本
└── README.md
```

## 快速安裝

在全新 Raspberry Pi OS（已安裝 Tailscale 並可連線）上：

```bash
curl -fsSL https://raw.githubusercontent.com/s7808200772/nikkomusichub/main/install.sh | sudo bash
```

或手動：

```bash
git clone https://github.com/YOUR_USERNAME/nikkomusichub.git
cd nikkomusichub
sudo bash install.sh
```

安裝完成後，用瀏覽器開啟 Tailscale IP:8080：

```
http://100.x.x.x:8080
```

預設帳號：`nikkolh`  
預設密碼：`topup30%off`

## 第一次使用

1. 登入後到 **Settings** 修改預設密碼。
2. 進入 **Setup Wizard**：
   - apt update + upgrade
   - 安裝 rclone、mpv
   - 建立音樂資料夾
   - 貼上 Dropbox rclone token JSON
   - 測試 Dropbox 連線
   - 同步音樂
3. 進入 **Player Control** 開始播放。
4. 到 **Dropbox Sync** 設定每日同步時間，預設 03:00。

## systemd 服務

| 服務 | 說明 |
|------|------|
| `nikko-music-hub-web.service` | Web 管理介面 |
| `nikko-music-player.service` | mpv 音樂播放 |
| `nikko-music-sync.timer` | 定時觸發 Dropbox 同步 |

常用指令：

```bash
sudo systemctl status nikko-music-hub-web.service
sudo systemctl restart nikko-music-player.service
sudo systemctl status nikko-music-sync.timer
```

## 安全注意事項

- 預設只透過 Tailscale IP 存取，不做 port forwarding。
- Web 介面需要登入，JWT token 儲存在 httpOnly cookie。
- Dropbox token 只儲存在後端 SQLite 與 `rclone.conf`，不透過前端回傳。
- `rclone.conf` 權限設為 `600`。
- 所有 shell 指令採用白名單列表，不接受任意命令。
- 本地路徑會檢查是否在 `/srv/nikko-music` 下，防止路徑遍歷。
- 重開機、清空音樂等危險操作需要二次確認。
- 所有操作寫入 audit log。

## 測試步驟

1. 安裝完成後確認三個服務狀態正常。
2. 瀏覽器登入，確認 Dashboard 顯示 IP、CPU、RAM、磁碟。
3. Setup Wizard 安裝 rclone、mpv 後顯示版本號。
4. 貼上 Dropbox token，測試連線成功。
5. 同步音樂後，Music Library 顯示 MP3 列表。
6. Player Control 點播放，確認音訊輸出。
7. 測試暫停、繼續、下一首、音量調整。
8. 重開機後確認 mpv 自動播放。
9. 手動 kill mpv 程序，確認 systemd 自動重啟。

## 中央管理平台（Cloud）

本專案現已包含 `cloud/` 目錄，是一個可獨立部署的中央管理平台。它透過 **SSH + Tailscale** 主動連入各店 Raspberry Pi，統一監控與操作。

### 運作方式

1. 各店 Pi 安裝 NikkoMusicHub 後，中央平台記錄每間店的 Tailscale IP、SSH private key。
2. 中央平台透過 SSH 連到 Pi，執行預定義命令（白名單），例如：
   - `curl -s http://localhost:8080/api/dashboard`
   - `sudo systemctl restart nikko-music-player.service`

### 部署中央平台

請參考 `cloud/README.md`。

## 後續擴展：中央管理平台

本版已預留以下欄位，方便未來對接中央管理：

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

擴展方案：

1. 在雲端架設一個中央 FastAPI 管理後台。
2. 每台 Pi 的 Web 服務定期向中央報告心跳（heartbeat）。
3. 中央平台可透過 Tailscale IP 呼叫各店 Pi 的 API。
4. 新增一個「中央指令佇列」讓 Pi 輪詢或接收 Webhook，實現批量同步、播放、重啟。
5. Dashboard 可視化 30~100 間店的線上狀態、播放狀態、最近同步時間。

## License

MIT
