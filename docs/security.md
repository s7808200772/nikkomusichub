# 安全注意事項

## 1. 網路存取

- 預設只透過 Tailscale IP 存取，不在 router 開放 port forwarding。
- Web server 綁定 `0.0.0.0:8080`，但實際可達性由 Tailscale 網路控制。

## 2. 認證

- 登入後發放 JWT token，儲存在 httpOnly cookie。
- 預設帳號密碼在第一次登入後應立即修改。
- 密碼使用 bcrypt 雜湊儲存。

## 3. Token 保護

- Dropbox token JSON 只由後端寫入 `rclone.conf` 與 SQLite。
- API 不回傳 token 內容。
- `rclone.conf` 權限設為 `600`。

## 4. 指令安全

- 所有 shell 呼叫使用 list 格式，禁止拼接任意命令。
- 路徑經過 `safe_path_validate()` 檢查，限制在 `/srv/nikko-music` 下。
- 本地音樂清空需要輸入 `DELETE` 二次確認。

## 5. Audit

- 所有會改變狀態的操作都寫入 `audit_log` 資料表。
- 包含使用者、動作、時間、相關細節。

## 6. 服務權限

- systemd service 以普通使用者（預設 pi）運行。
- 需要 root 的動作透過 `sudo` 白名單命令執行。
