# 後端 API 設計

## 認證

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/login` | 登入頁面 |
| POST | `/login` | 登入（form: username, password） |
| GET | `/logout` | 登出 |
| GET | `/api/me` | 目前使用者資訊 |
| POST | `/api/change-password` | 修改密碼 |

## Dashboard

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/` | Dashboard 頁面 |
| GET | `/api/dashboard` | Dashboard 資料 |

## Setup Wizard

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/setup` | 設定頁面 |
| POST | `/api/setup/apt-update` | apt update + upgrade |
| POST | `/api/setup/install-rclone` | 安裝 rclone |
| POST | `/api/setup/install-mpv` | 安裝 mpv |
| POST | `/api/setup/create-folders` | 建立資料夾 |
| POST | `/api/setup/dropbox` | 設定 Dropbox token |
| POST | `/api/setup/test-dropbox` | 測試 Dropbox 連線 |
| POST | `/api/setup/sync` | 手動同步 |
| POST | `/api/setup/install-service` | 重新載入 systemd |
| POST | `/api/setup/enable-player` | 啟用開機自動播放 |
| POST | `/api/setup/disable-player` | 停用開機自動播放 |

## Dropbox Sync

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/dropbox` | 同步設定頁面 |
| GET | `/api/dropbox/settings` | 取得同步設定 |
| POST | `/api/dropbox/settings` | 儲存同步設定 |
| POST | `/api/dropbox/dry-run` | Dry-run 同步 |
| POST | `/api/dropbox/sync` | 立即同步 |
| GET | `/api/dropbox/sync-logs` | 同步紀錄 |

## Player Control

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/player` | 播放控制頁面 |
| GET | `/api/player/status` | 播放狀態 |
| POST | `/api/player/play` | 開始播放 |
| POST | `/api/player/pause` | 暫停 |
| POST | `/api/player/resume` | 繼續 |
| POST | `/api/player/stop` | 停止 |
| POST | `/api/player/next` | 下一首 |
| POST | `/api/player/prev` | 上一首 |
| POST | `/api/player/volume` | 設定音量 |
| POST | `/api/player/mute` | 靜音 |
| POST | `/api/player/shuffle` | 隨機播放 |
| POST | `/api/player/loop` | 循環播放 |
| POST | `/api/player/reload` | 重新載入清單 |
| GET | `/api/player/playlist` | 目前清單 |
| GET | `/api/player/library` | 本地音樂庫 |

## System & Maintenance

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/system` | 系統狀態頁面 |
| GET | `/api/system/info` | 系統資訊 |
| GET | `/api/system/logs` | 系統/同步/播放 log |
| POST | `/api/system/start-player` | 啟動播放服務 |
| POST | `/api/system/stop-player` | 停止播放服務 |
| POST | `/api/system/restart-player` | 重啟播放服務 |
| POST | `/api/system/reboot` | 重開機 |
| POST | `/api/system/rescan` | 重新掃描音樂 |
| POST | `/api/system/test-audio` | 測試音訊 |
| POST | `/api/system/clear-music` | 清空本地音樂 |

## Logs & Settings

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/logs` | Log 頁面 |
| GET | `/api/logs/all` | 所有 log |
| GET | `/settings` | 設定頁面 |
| GET | `/api/settings/device` | 裝置設定 |
| POST | `/api/settings/device` | 儲存裝置設定 |
