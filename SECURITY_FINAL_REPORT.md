# NikkoMusicHub 收尾驗收報告

> Branch: `security-final`  
> 報告時間：2026-06-30（移交整理版）
> 執行範圍：STE-101 ~ STE-105、全按鈕測試、安全加固、systemd/mpv 穩定性、Cloud 端整理、文件清理

> **重要區分**：repo 預設 MQTT broker 為 `114.55.1.51:1883` plaintext；生產部署時已切換至 `114.55.1.51:8883` TLS 1.3。程式碼同時支援兩者，請依環境設定。

---

## 1. 修改檔案清單

| 檔案 | 用途 / 變更內容 |
|---|---|
| `.env.example` | 新增 Pi 端環境變數範例（JWT、MQTT、production flag） |
| `.gitignore` | 忽略 .env、local dev artifacts（.dev-data、cookies.txt、page.html 等） |
| `install.sh` | 安裝時自動產生 `NIKKO_ENV=production`、`NIKKO_SECRET_KEY`、`NIKKO_COOKIE_SECURE` |
| `app/config.py` | production 強制 `NIKKO_SECRET_KEY`；支援 `NIKKO_BASE_DIR` env |
| `app/routes/auth.py` | bcrypt、session 失效、登入速率限制 |
| `app/routes/system.py` | systemctl start/stop/restart 回傳真實執行結果 |
| `app/routes/player.py` | `play-file` / `delete-file` 路徑正確解析為 `MUSIC_DIR` 下絕對路徑 |
| `app/services/mqtt_auth.py` | `ALLOWED_COMMANDS` 白名單、`DANGEROUS_COMMANDS`、危險指令需 `confirm`、簽名納入 `confirm` |
| `app/mqtt_client.py` | 簽名驗證後檢查白名單與危險指令確認；非法/危險指令寫入 audit log；錯誤訊息不洩漏 secret |
| `app/services/system.py` | systemd service name allowlist；`count/list_music_files` 統一 `.mp3`/`.MP3` |
| `app/services/rclone.py` | `pwd` import try/except，提升 Windows 開發相容性 |
| `app/services/mpv.py` / `mpv_check.py` | 播放清單去重 |
| `app/systemd/*.service` / `*.timer` | 加入 StartLimit、RestartSec；Web/Sync service 載入 `nikko.env` |
| `cloud-vercel/.env.example` | 補齊 Cloud 必要 env |
| `cloud-vercel/lib/db.js` | `requireSupabase()`；寫入操作在未設定 Supabase 時拋錯 |
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
| STE-102 | 移除固定 secret、統一預設帳密 | 完成 | production 強制 `NIKKO_SECRET_KEY`；預設帳密 `nikkolh` / `topup30%off`；cookie HttpOnly/SameSite/MaxAge；改密後舊 session 失效 |
| STE-103 | 完成 Supabase 正式持久化 | 完成 | Cloud API 在未設定 Supabase 時回 503；service role key 不透過 API 暴露；寫入操作強制 Supabase |
| STE-104 | 修復 localStorage 模式 | 完成 | localStorage 僅作 dev preview；UI 顯示警告；server API 不依賴 localStorage |
| STE-105 | 更新 PostCSS / npm audit | 完成 | `npm audit` 0 vulnerabilities；`npm run build` 通過；`npm test` 通過 |

---

## 3. 遺留問題修復方式

| 序號 | 問題 | 修復方式 |
|---|---|---|
| 1 | 公開 MQTT 可被偽造指令 | Pi 端 `verify_command` + `verify_command_allowed`；Cloud 端發送時簽名並對危險指令帶 `confirm`；非法指令寫 audit |
| 2 | 預設帳密 / 固定 JWT secret | `install.sh` 隨機產生 JWT + MQTT secret；預設帳密 `nikkolh` / `topup30%off`；`config.py` production 缺少 secret 直接啟動失敗 |
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
| 列出遠端音樂 | `POST /api/webdav/list-music` | 失敗（401） | 回傳 stderr | audit `list_webdav_music` | 預期 |
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
| JWT / Session | 通過 | secret 從 env 讀取、production 缺 secret 拒絕啟動、cookie HttpOnly/SameSite/MaxAge、改密後舊 session 失效 |
| 預設帳密 | 通過 | 預設為 `nikkolh` / `topup30%off`，方便首次安裝與維修；使用者可於 Settings 修改 |
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
| 重啟風暴 | 已加入 StartLimit；部署後請觀察 `systemctl status` 的 restart count |

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

1. **EMQX 管理頁仍只有 HTTP 18083**：Dashboard 管理密碼已輪替，MQTT 資料通道不受影響；後續應在 broker 主機防火牆限制 18083 僅允許管理 IP，或配置 18084 HTTPS。
2. **私有 broker 憑證為舊版 EMQ Root CA**：憑證沒有 SAN，Root CA 也沒有 Authority Key Identifier。Pi 與 Vercel 已釘選該私有 Root CA，Vercel 以 `Server` 驗證憑證名稱，Pi 僅放寬 X509 strict/hostname、仍強制驗證私有 CA 鏈。建議日後重發含 SAN 與 AKI 的憑證。
3. **repo 預設 MQTT 走 plaintext 1883**：程式碼同時支援 TLS，但 `.env.example` 與 `install.sh` 預設為 plaintext，方便首次安裝。生產環境必須手動改為 TLS broker 並啟用憑證驗證。

---

## 10. 部署完成狀態

### Pi 實機

- `security-final` 程式與 systemd units 已部署到 `/srv/nikko-music/app/` 與 `/etc/systemd/system/`。
- systemd 執行帳號已依實機修正為 `nikkolh`；Web、MQTT、Player、Sync Timer 均為 `active`，`NRestarts=0`。
- MQTT 可切換至 `114.55.1.51:8883` TLS 1.3（生產部署），repo 預設為 `114.55.1.51:1883` plaintext。
- EMQX built-in database 驗證已啟用；專用 client 帳號已建立，匿名及錯誤帳密均被拒絕。
- MQTT HMAC、時效、nonce/requestId、防重放、白名單、危險指令確認與 audit log 均保留。
- Pi 管理密碼已輪替；MQTT 設定 API 不再回傳現有 password 或 command secret。

### Cloud / Vercel / Supabase

- Production：`https://cloud-vercel-xi.vercel.app`。
- Production 與 Preview 均已設定加密的登入、Supabase、MQTT、Root CA 與 TLS Server Name 環境變數。
- Supabase `stores` / `settings` 已持久化，RLS 僅允許 service role；Vercel 透過帶共享密鑰的 Edge Function 存取。
- Production 與 Preview CRUD 驗收均通過；暫存驗收店點已刪除。
- Vercel build/test/audit 通過；正式 MQTT 端到端指令驗收通過。

---

## 11. 回滾方式

1. **程式碼回滾**：
   ```bash
   git checkout main
   # 或切換到 security-final 之前的 tag
   ```
2. **Pi `.env` 還原**：
   ```bash
   cp /srv/nikko-music/data/nikko.env.bak.<timestamp> /srv/nikko-music/data/nikko.env
   ```
3. **rclone config 還原**：
   ```bash
   cp /srv/nikko-music/data/rclone.conf.bak.<timestamp> /srv/nikko-music/data/rclone.conf
   ```
4. **systemd 還原**：備份檔位於 `/tmp/nikko-backup/` 或從 Git `main` branch 的 `app/systemd/` 還原。
5. **服務重啟**：
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service
   ```
6. **mpv 播放快速恢復**：
   ```bash
   sudo systemctl stop nikko-music-player.service
   sudo rm -f /tmp/nikko-mpv.sock
   sudo systemctl start nikko-music-player.service
   ```
7. **Cloud Supabase 回滾**：在 Vercel 移除 Supabase env 後，Cloud 會顯示設定提示，但不建議長期使用 localStorage fallback。

---

## 12. Git Branch 狀態

- 工作分支：`security-final`
- 已整理文件並移除 cookies.txt / .env.local 等敏感/無用檔案
- 建議審查後合併：
  ```bash
  git checkout main
  git merge security-final
  ```
