# Nikko SoundNode｜日光音樂節點 維運手冊

> 本文件整合編號 107–120 之維運項目，供管理者、工程師與現場維修人員參考。

---

## 1. 安裝前檢查清單

- [ ] Raspberry Pi 已安裝 64-bit Raspberry Pi OS，並啟用 SSH。
- [ ] 已接上穩定電源與有線網路（或穩定 Wi-Fi）。
- [ ] 喇叭或擴大機已連接並測試音量。
- [ ] 已加入 Tailscale 網路，並可 ping 到 QNAP Tailscale IP。
- [ ] QNAP WebDAV 已啟用，且 `NikkoMusic` 共享資料夾存在。
- [ ] 已準備 `NIKKO_SECRET_KEY`、`NIKKO_MQTT_COMMAND_SECRET` 等強密鑰。
- [ ] 已準備 Vercel / Supabase 環境變數（正式部署用）。

## 2. 首次部署流程

1. 複製專案到 `/srv/nikko-music/app/`。
2. 執行 `bash scripts/install.sh`：建立目錄、安裝依賴、啟用 systemd 服務。
3. 在 `/srv/nikko-music/data/nikko.env` 填入 MQTT broker、帳密、Secret。
4. 到 Pi Settings 頁面設定 Store ID、店名、device_id、role。
5. 到 Cloud Stores 頁面新增對應 Store ID 與 MQTT 連線資訊。
6. 測試 Cloud → Pi MQTT 連線。
7. 執行首次 WebDAV 同步，確認 `music/` 有 MP3。
8. 確認播放器自動開始播放。

## 3. 日常操作

### 3.1 查看狀態

- Pi Dashboard：`https://<pi-tailscale-ip>:8080/`
- Cloud Dashboard：正式 Vercel 網址
- 服務狀態：`sudo systemctl status nikko-music-hub-web.service`

### 3.2 音樂更新

1. 將 MP3 放入 QNAP `NikkoMusic` 資料夾。
2. Cloud `/library` 選取店點，點「同步選取店點」。
3. 或直接到 Pi Dashboard 點「立即同步」。

### 3.3 音量 / 靜音 / 音訊輸出

- Pi Dashboard 提供音量滑桿、靜音/取消靜音、音訊裝置下拉選單。
- 變更後會自動儲存到 settings，下次開機生效。

### 3.4 備份

- 自動：systemd timer 每日建立 `backups/nikko-backup-*.tar.gz`，保留 14 份。
- 手動：Pi Dashboard 未來將加入「立即備份」按鈕；目前可呼叫 `/api/backup/create`。

## 4. 驗收測試清單

- [ ] 開機後 2 分鐘自動執行 WebDAV 同步。
- [ ] 同步失敗時，本地 `music/` 不被刪除，播放不中斷。
- [ ] Cloud 可對單店發送播放、暫停、同步、重啟指令。
- [ ] Cloud 可批次選取 3 家店點發送同步，並顯示成功/失敗/無回應。
- [ ] 關閉一家 Pi 的 MQTT agent 超過 90 秒，Cloud 產生 offline 告警。
- [ ] 模擬磁碟 >90%，同步應停止並顯示告警。
- [ ] OTA 更新成功後 Pi 回報新版本 git commit。
- [ ] Rollback 後 Pi 回到上一版本並恢復播放。
- [ ] 還原腳本可在新 Pi 上恢復設定並正常播放。

## 5. 故障排查

| 症狀 | 可能原因 | 排查步驟 |
|---|---|---|
| 播放器無聲 | 音訊輸出裝置錯誤 / 喇叭未開 | Dashboard 測試音訊輸出，確認裝置與音量 |
| Cloud 顯示離線 | MQTT agent 未啟 / Tailscale 斷線 | `systemctl status nikko-music-mqtt.service`、`tailscale status` |
| 同步失敗 | WebDAV 設定錯 / QNAP 離線 | `/api/health/qnap`、檢查 rclone.conf |
| 磁碟空間不足 | log 或備份累積 | 清理 `logs/` 與 `backups/`、檢查磁碟使用率 |
| CPU 溫度過高 | 散熱不良 | 檢查風扇、外殼通風、考慮降頻 |
| OTA 後無法連線 | 更新衝突或依賴失敗 | SSH 登入執行 rollback：`sudo bash /srv/nikko-music/app/scripts/restore.sh <backup>` 或 `git checkout rollback-before-ota` |

## 6. 災難恢復流程

### 6.1 SD 卡損壞

1. 用新 SD 卡燒錄 Raspberry Pi OS。
2. 重新執行 `install.sh`。
3. 從最新 backup tar.gz 還原：`sudo bash /srv/nikko-music/app/scripts/restore.sh <backup>`。
4. 確認 Store ID、MQTT 設定正確，啟動服務。

### 6.2 NAS 失聯

- Pi 會繼續播放本地 `music/` 的音樂，不受影響。
- 檢查 Tailscale 與 QNAP 網路；修復後下次同步會自動恢復。

### 6.3 Pi 硬體故障

1. 準備備用 Pi，安裝 OS 與專案。
2. 從備份還原設定。
3. 在 Cloud Stores 更新 device_id（若不同）。
4. 測試播放與同步。

## 7. 設備汰換流程

1. 在新設備部署並還原設定。
2. 新設備使用相同 Store ID，但可設定新 device_id。
3. 在 Cloud 將舊設備標記為離線或刪除。
4. 確認新設備播放正常後，移除舊硬體。

## 8. 資安與資料保留策略

- 所有密碼與 Secret 不寫入 Git，僅存於 `nikko.env`、Vercel env、Supabase Edge Function env。
- `rclone.conf`、`nikko.env` 權限設為 `600`。
- MQTT 指令使用 HMAC 簽名、時效、防重放、白名單與二次確認。
- 定期輪替 `NIKKO_MQTT_COMMAND_SECRET` 與 MQTT broker 帳密。
- 備份保留 14 份；audit log 與 sync log 保留於 SQLite，建議每年匯出歸檔。

## 9. 長期維運策略

- 每月檢查 Cloud 告警與離線店點。
- 每季輪替密碼與憑證。
- 每半年驗證備份還原流程。
- 店點數 >20 時評估 EMQX 獨立帳密或 JWT 認證。
- 持續追蹤 `PROJECT_STATUS_120.md` 與 `EXECUTION_PLAN.md` 進度。
