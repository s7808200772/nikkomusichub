# NikkoMusicHub Agent Guide

## 專案定位

這是一個面向 Raspberry Pi 門市音樂播放的本地 Web 管理系統。目標是「安裝一次後，所有操作都在瀏覽器完成」，不需要使用者再 SSH 下指令。

## 開發原則

- **簡單優先**：不要引入 React/Vue 等前端框架，用原生 HTML/CSS/JS。
- **輕量穩定**：Raspberry Pi 資源有限，避免過度設計。
- **安全優先**：所有 shell 指令白名單化；路徑驗證；token 不落地前端。
- **冪等設計**：安裝、同步、啟動等按鈕可重複點擊而不會搞壞系統。

## 常用路徑

- 程式碼：`/srv/nikko-music/app`
- 音樂：`/srv/nikko-music/music`
- 紀錄：`/srv/nikko-music/logs`
- 資料庫：`/srv/nikko-music/data/nikkomusichub.db`
- rclone 設定：`/srv/nikko-music/data/rclone.conf`
- mpv IPC socket：`/tmp/nikko-mpv.sock`

## 新增 API 時的注意事項

1. 使用 `get_current_user(request)` 確認登入。
2. 若要執行 shell，呼叫 `app.services.system.run()` 並傳入 list，不要拼接字串。
3. 使用者輸入的路徑必須經過 `safe_path_validate()`。
4. 危險操作記得寫 `audit()`。

## 新增前端頁面

1. 在 `app/templates/` 建立繼承 `base.html` 的模板。
2. 在 `app/routes/` 建立對應 route 並註冊到 `app/main.py`。
3. 共用 JS 函式在 `app/static/app.js`。

## 中央管理平台 Cloud

- 程式碼在 `cloud/` 目錄，是獨立的 FastAPI 應用。
- Cloud 透過 SSH + Tailscale 主動連入 Pi，並呼叫 Pi 本地 API（只接受 127.0.0.1）。
- Cloud 不適合部署在 Vercel，請使用 VPS。

## 測試

- Pi 本地開發：`cd /srv/nikko-music/app && ../venv/bin/uvicorn app.main:app --reload --port 8080`
- Cloud 本地開發：`cd cloud && ../venv/bin/uvicorn cloud.app.main:app --reload --port 8000`
- 語法檢查：`python -m compileall app/ cloud/`

## 部署

修改 Pi 的 systemd unit 後：

```bash
sudo systemctl daemon-reload
sudo systemctl restart nikko-music-hub-web.service
```

Cloud 平台部署請參考 `cloud/README.md`。
