# NikkoMusicHub 收尾驗收報告

> Branch: `security-final`  
> 報告時間：2026-06-28  
> 執行範圍：STE-101 ~ STE-105、全按鈕測試、安全加固、systemd/mpv 穩定性、Cloud 端整理

---

## 1. 修改檔案清單

| 檔案 | 用途 / 變更內容 |
|---|---|
| `.env.example` | 新增 Pi 端環境變數範例（JWT、MQTT、production flag） |
| `.gitignore` | 忽略 .env、local dev artifacts（.dev-data、cookies.txt、page.html 等） |
| `install.sh` | 安裝時自動產生 `NIKKO_ENV=production`、`NIKKO_SECRET_KEY`、`NIKKO_COOKIE_SECURE` |
| `app/config.py` | production 強制 `NIKKO_SECRET_KEY`；`COOKIE_SECURE` production 預設開啟；支援 `NIKKO_BASE_DIR` env |
| `app/routes/auth.py` | （既有）bcrypt、pwdv session 失效、登入速率限制；本階段未更動，已確認符合要求 |
| `app/routes/system.py` | systemctl start/stop/restart 改為回傳真實執行結果，不再假成功 |
| `app/routes/player.py` | `play-file` / `delete-file` 將相對路徑正確解析為 `MUSIC_DIR` 下的絕對路徑 |
| `app/services/mqtt_auth.py` | 加入 `ALLOWED_COMMANDS` 白名單、`DANGEROUS_COMMANDS`、危險指令需 `confirm`、簽名納入 `confirm` |
| `app/mqtt_client.py` | 簽名驗證後再檢查白名單與危險指令確認；非法/危險指令寫入 audit log；錯誤訊息不洩漏 secret |
| `app/services/system.py` | 加入 systemd service name allowlist；`count/list_music_files` 統一 `.mp3`/`.MP3` |
| `app/services/rclone.py` | `pwd` import 改為 try/except，提升 Windows 開發相容性（Pi Linux 不受影響） |
| `app/services/mpv.py` | 避免 `.mp3` / `.MP3` 在不分大小寫檔案系統上重複計數 |
| `app/services/mpv_check.py` | 同上，播放清單去重 |
| `app/systemd/*.service` / `*.timer` | 加入 `StartLimitIntervalSec`、`StartLimitBurst`、`RestartSec`；Web/Sync service 載入 `nikko.env` |
| `cloud-vercel/.env.example` | 補齊 Cloud 必要 env（NODE_ENV、JWT、admin、Supabase proxy、MQTT secret） |
| `cloud-vercel/lib/db.js` | 新增 `requireSupabase()`；寫入操作在未設定 Supabase 時拋錯 |
| `cloud-vercel/lib/localStorage.js` | 標記為 dev-only fallback |
| `cloud-vercel/lib/mqttAuth.js` | 簽名訊息納入 `confirm`，與 Pi 端對齊 |
| `cloud-vercel/lib/mqtt.js` | 危險指令自動帶 `confirm: true`；指令清單與 Pi 白名單一致 |
| `cloud-vercel/app/api/stores/route.js` | GET 在未設定 Supabase 時回 503 |
| `cloud-vercel/app/api/settings/route.js` | POST/GET 在未設定 Supabase 時回 503 |
| `tests/test_mqtt_auth.py` | 更新 cross-language 簽名向量、新增白名單與危險指令測試 |
| `cloud-vercel/test/mqttAuth.test.mjs` | 更新 cross-language 簽名向量 |

---

## 2. STE-101 到 STE-105 完成狀態

| 編號 | 任務 | 狀態 | 說明 |
|---|---|---|---|
| STE-101 | 封鎖未驗證 MQTT 指令 | 完成 | HMAC 簽名 + 60 秒時效 + nonce/requestId 防重放 + command 白名單 + 危險指令需 `confirm` + audit log |
| STE-102 | 移除預設帳密與固定 secret | 完成 | production 強制 `NIKKO_SECRET_KEY`；初始密碼 per-device 隨機；cookie HttpOnly/SameSite/MaxAge；改密後舊 session 失效 |
| STE-103 | 完成 Supabase 正式持久化 | 完成 | Cloud API 在未設定 Supabase 時回 503；service role key 不透過 API 暴露；寫入操作強制 Supabase |
| STE-104 | 修復 localStorage 模式 | 完成 | localStorage 僅作 dev preview；UI 顯示警告；server API 不依賴 localStorage |
| STE-105 | 更新 PostCSS / npm audit | 完成 | `npm audit` 0 vulnerabilities；`npm run build` 通過；`npm test` 通過 |

---

## 3. 遺留問題修復方式

| 序號 | 問題 | 修復方式 |
|---|---|---|
| 1 | 公開 MQTT 可被偽造指令 | Pi 端 `verify_command` + `verify_command_allowed`；Cloud 端發送時簽名並對危險指令帶 `confirm`；非法指令寫 audit |
| 2 | 預設帳密 / 固定 JWT secret | `install.sh` 隨機產生 JWT + MQTT secret；`config.py` production 缺少 secret 直接啟動失敗 |
| 3 | Supabase 未確認正式設定 | Cloud API 未設定 Supabase 時回 503；寫入操作必須 Supabase；client 顯示 `<SupabaseWarning />` |
| 4 | localStorage 無法讓 Server API 找到店點 | localStorage 降級為 dev-only；server API 只讀 Supabase；遠端指令在未設定 Supabase 時禁用 |
| 5 | npm audit PostCSS 警告 | 目前 `npm audit` 已無警告；`overrides` 保留，build/test 通過 |

---

## 4. 所有按鈕測試結果

> 測試環境：本機 Windows + Python venv，`NIKKO_ENV=development`。因 Windows 無 systemd/mpv，部分播放/系統指令會回傳預期中的「找不到 mpv socket / systemctl 錯誤」，重點驗證 API 權限、參數傳遞、UI loading/success/error、audit log 紀錄。

| 按鈕 | API / 功能 | 測試結果 | UI 回饋 | 操作紀錄 | 備註 |
|---|---|---|---|---|---|
| 登入 | `POST /login` | 成功（303 → dashboard） | 設定 cookie | audit 無 | cookie HttpOnly/SameSite |
| 修改密碼 | `POST /api/change-password` | 成功 | JSON `{"ok":true}` | audit `change_password` | 舊 session 失效 |
| 儲存店家資訊 | `POST /api/settings/device` | 成功 | 回傳 ok/warning | audit `save_device_settings` | Windows 無法重啟 MQTT，符合預期 |
| 儲存 WebDAV 設定 | `POST /api/webdav/settings` | 成功 | JSON ok | audit `save_webdav_settings` | 參數經 sanitize |
| 測試 WebDAV 連線 | `POST /api/webdav/test-remote` | 失敗（401） | 回傳 stderr | audit `test_webdav_remote` | 使用假帳密，預期 |
| 列出 NAS 音樂 | `POST /api/webdav/list-music` | 失敗（401） | 回傳 stderr | audit `list_webdav_music` | 預期 |
| 儲存同步設定 | `POST /api/webdav/sync-settings` | 成功 | JSON ok | audit `save_sync_settings` | sync_time 正規檢查 |
| Dry-run 同步 | `POST /api/webdav/dry-run` | 啟動成功，結果失敗 | progress API 回傳狀態 | sync_log | 認證失敗，預期 |
| 立即同步 | `POST /api/webdav/sync` | 啟動成功 | progress API 回傳狀態 | sync_log | 同上 |
| 清空本地音樂 | `POST /api/system/clear-music` | 成功（confirm=DELETE） | JSON ok | audit `clear_music` | 二次確認在 UI + server |
| 啟動播放服務 | `POST /api/system/start-player` | 失敗 | 回傳 stderr/returncode | audit `start_player_service` | Windows 無 systemctl |
| 停止播放服務 | `POST /api/system/stop-player` | 失敗 | 回傳 stderr | audit `stop_player_service` | 同上 |
| 重啟播放服務 | `POST /api/system/restart-player` | 失敗 | 回傳 stderr | audit `restart_player` | 同上 |
| 重新掃描音樂 | `POST /api/system/rescan` | 成功 | JSON ok | audit `rescan_music` | 去重後 count 正確 |
| 測試音訊輸出 | `POST /api/system/test-audio` | 未於本機測試 | — | — | Pi 上執行實際測試 |
| 重開機 Raspberry Pi | `POST /api/system/reboot` | 未於本機測試 | — | — | 僅於 Pi 實機由管理員觸發 |
| 播放 | `POST /api/player/play` | 失敗（No MP3 files） | 回傳 stderr | audit `player_play` | 無實際 mp3 時合理 |
| 暫停 / 繼續 / 停止 / 上下首 | player API | 失敗（mpv socket not found） | 回傳 error | audit | 需 mpv 運行 |
| 音量 / seek / shuffle / loop | player API | 失敗（mpv socket not found） | 回傳 error | audit | 需 mpv 運行 |
| 重新載入播放清單 | `POST /api/player/reload` | 成功 | JSON ok | audit `player_reload` | count 正確 |
| 啟用 / 停用開機播放 | `POST /api/player/enable-service` | 失敗 | 回傳 returncode | audit | Windows 無 systemctl |
| 音樂庫搜尋 | client-side filter | 成功 | 即時篩選 | 無 | 前端已實作 |
| 音樂檔播放 / 刪除 | `POST /api/player/play-file` / `delete-file` | 刪除成功；播放失敗（mpv socket） | toast | audit | 路徑解析已修正 |
| 播放清單載入 | `GET /api/player/playlist` | 成功 | 回傳陣列 | 無 | 物件會讀 filename/title/name |
| 日誌篩選 / 匯出 | `GET /api/logs/stats` / `all` / `export` | 成功 | 回傳 JSON/CSV | audit | 匯出 CSV 正常 |
| Logout | `GET /logout` | 成功（302 → login） | 清除 cookie | 無 | 正常 |

---

## 5. 安全檢查結果

| 項目 | 狀態 | 說明 |
|---|---|---|
| MQTT 安全 | 通過 | HMAC-SHA256、時效 60s、nonce/requestId 防重放、白名單、危險指令 confirm、audit log |
| JWT / Session | 通過 | secret 從 env 讀取、production 缺 secret 拒絕啟動、cookie HttpOnly/SameSite/MaxAge、pwdv 讓舊 session 失效 |
| 預設帳密 | 通過 | 無硬編碼密碼；初始密碼 per-device 隨機；首次登入強制修改 |
| Supabase key | 通過 | service role / proxy secret 僅在 server-side env；不暴露前端 |
| Command injection | 通過 | 所有 subprocess 使用 list args、`shell=False`；路徑經 `safe_path_validate`；systemctl service name allowlist |
| Secrets / log 洩漏 | 通過 | 未在 log 中發現密碼/JWT/MQTT secret；rclone log 已遮蔽 pass |
| 危險操作二次確認 | 通過 | 清空音樂需 `confirm=DELETE`；重開機 UI modal；危險 MQTT 指令需 `confirm` + HMAC |

---

## 6. systemd / mpv 穩定性

| 項目 | 設定 / 狀態 |
|---|---|
| nikko-music-player.service | `Restart=on-failure`、`RestartSec=10`、`StartLimitIntervalSec=60`、`StartLimitBurst=3` |
| nikko-music-hub-web.service | `Restart=always`、`RestartSec=5`、`StartLimitIntervalSec=60`、`StartLimitBurst=5`、載入 `nikko.env` |
| nikko-music-mqtt.service | `Restart=always`、`RestartSec=10`、`StartLimitIntervalSec=60`、`StartLimitBurst=5` |
| nikko-music-sync.service | `Type=oneshot`、`StartLimitIntervalSec=300`、`StartLimitBurst=2`、載入 `nikko.env` |
| mpv 啟動失敗 | `ExecCondition` 檢查空 playlist；空檔案時 exit 1，配合 StartLimit 避免風暴 |
| 空 playlist | `mpv_check.py` 明確輸出並回傳非零；dashboard 顯示 stopped / mp3_count=0 |
| 重啟風暴 | 已加入 StartLimit；部署後請觀察 `systemctl status nikko-music-player.service` 的 restart count |

> ⚠️ 本機 Windows 無法驗證 systemd 實際行為，請在 Pi 部署後執行 `systemctl status` 與 `journalctl` 確認。

---

## 7. npm audit / build / test 結果

```
cloud-vercel$ npm audit
found 0 vulnerabilities

cloud-vercel$ npm run build
✓ Compiled successfully
✓ TypeScript
✓ Generating static pages

cloud-vercel$ npm test
✔ command signature matches the Pi implementation vector
✔ response verification accepts canonical data and rejects tampering
ℹ pass 2
```

---

## 8. 三頁狀態

| 頁面 | 狀態 | 說明 |
|---|---|---|
| 首頁儀表板 | 載入正常 | 播放控制、音樂庫、播放清單、維護操作、右側狀態卡正常顯示 |
| 系統設定 | 載入正常 | 店家資訊、密碼、WebDAV、同步設定表單可載入 |
| 日誌紀錄 | 載入正常 | 可讀取 audit / sync / player log 並匯出 CSV |

> 本機測試以 `curl` 取得 HTML 並確認 `style.css?v=...` cache-busting 與 `Cache-Control: no-cache, no-store, must-revalidate`。實際截圖請在 Pi 部署重啟後於瀏覽器取得。

---

## 9. 剩餘風險

1. **服務尚未在 Pi 上重啟**：app 檔案與 systemd unit 已部署到 `/srv/nikko-music/app/` 與 `/tmp/nikko-systemd-new/`，但 `systemctl daemon-reload` 與 `restart` 需要 sudo，需由管理員執行下方步驟。
2. **Windows 本機無法驗證 mpv / systemd 實際行為**：播放、服務啟停、測試音訊、重開機等需在 Pi 實機確認。
3. **`NIKKO_COOKIE_SECURE`**：目前 Pi `.env` 設為 `0`，因 LAN/ Tailscale 可能走 HTTP。若後續啟用 HTTPS，建議設為 `1`。
4. **Cloud `.env.production.local`**：該檔案已被 `.gitignore` 忽略，請確認 Vercel 後台已設定正確的 `NIKKO_CLOUD_SECRET`、`NIKKO_ADMIN_*`、`SUPABASE_URL`、`NIKKO_SUPABASE_PROXY_SECRET`、`NIKKO_MQTT_COMMAND_SECRET`、`NIKKO_MQTT_TOPIC_PREFIX`。
5. **Supabase Edge Function**：本報告未檢查 Supabase Edge Function 權限邏輯與 RLS，部署 Cloud 前請確認 `supabase/functions/nikko-cloud-db` 已正確部署並驗證 `x-nikko-secret`。

---

## 10. 部署方式

已在 Pi 上完成：
1. 備份 `/srv/nikko-music/data/nikko.env`、`rclone.conf`、`nikkomusichub.db`。
2. 將 `security-final` branch 的程式碼複製到 `/srv/nikko-music/app/`。
3. 在 `/srv/nikko-music/data/nikko.env` 加入 `NIKKO_ENV=production`、`NIKKO_SECRET_KEY`、`NIKKO_COOKIE_SECURE=0`。
4. 將新版 systemd unit 檔放到 `/tmp/nikko-systemd-new/`。

**尚需管理員在 Pi 上執行（需要 sudo）：**

```bash
# 1. 複製新版 systemd units
sudo cp /tmp/nikko-systemd-new/*.service /etc/systemd/system/
sudo cp /tmp/nikko-systemd-new/*.timer /etc/systemd/system/

# 2. 重新載入 systemd
sudo systemctl daemon-reload

# 3. 重啟服務
sudo systemctl restart nikko-music-hub-web.service
sudo systemctl restart nikko-music-mqtt.service
sudo systemctl restart nikko-music-sync.timer

# 4. 檢查狀態
systemctl status nikko-music-hub-web.service
systemctl status nikko-music-mqtt.service
systemctl status nikko-music-player.service
systemctl status nikko-music-sync.timer
journalctl -u nikko-music-hub-web.service -n 50 --no-pager
```

**Cloud（Vercel）部署：**
```bash
cd cloud-vercel
npm install
npm run build
vercel --prod
```
並確認 Vercel Environment Variables 已填入所有必要值。

---

## 11. 回滾方式

1. **程式碼回滾**：
   ```bash
   git checkout main
   git reset --hard f9868b9   # 修改前最後一個 commit
   ```
2. **Pi `.env` 還原**：
   ```bash
   cp /srv/nikko-music/data/nikko.env.bak.<timestamp> /srv/nikko-music/data/nikko.env
   ```
3. **rclone config 還原**：
   ```bash
   cp /srv/nikko-music/data/rclone.conf.bak.<timestamp> /srv/nikko-music/data/rclone.conf
   ```
4. **systemd 還原**：備份檔位於 `/tmp/nikko-backup/`（若之前未 sudo 成功，請從 Git `main` branch 的 `app/systemd/` 還原）。
5. **服務重啟**：
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart nikko-music-hub-web.service nikko-music-mqtt.service nikko-music-sync.timer
   ```
6. **mpv 播放快速恢復**：
   ```bash
   sudo systemctl stop nikko-music-player.service
   sudo rm -f /tmp/nikko-mpv.sock
   sudo systemctl start nikko-music-player.service
   ```
7. **Cloud Supabase 回滾**：在 Vercel 移除 Supabase env 後，Cloud 會顯示設定提示，但**不建議長期使用** localStorage fallback。

---

## 12. Git Branch 狀態

- 工作分支：`security-final`
- 已 commit 所有變更，工作目錄乾淨
- 建議審查後合併：
  ```bash
  git checkout main
  git merge security-final
  ```
