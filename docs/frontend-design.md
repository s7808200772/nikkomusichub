# 前端頁面設計

## 整體風格

- 深色工程後台風格
- 左側固定導航欄
- 卡片式佈局
- 狀態燈號：灰/綠/藍/黃/紅

## 頁面清單

| 頁面 | 路徑 | 主要功能 |
|------|------|----------|
| Login | `/login` | 登入表單 |
| Dashboard | `/` | 系統概覽、狀態燈、最近錯誤 |
| Setup Wizard | `/setup` | 初始化安裝按鈕群組 |
| Dropbox Sync | `/dropbox` | 同步設定、dry-run、手動同步、紀錄 |
| Player Control | `/player` | 播放控制、音量、清單 |
| Music Library | `/music-library` | 本地 MP3 列表 |
| System Status | `/system` | 硬體/軟體資訊、維護按鈕 |
| Logs | `/logs` | 同步/播放/audit log |
| Settings | `/settings` | 店家資訊、修改密碼 |

## 狀態燈規則

- 未安裝 / 未連線：灰色
- 正常運作：綠色
- 執行中：藍色
- 警告（CPU/RAM/磁碟偏高）：黃色
- 錯誤：紅色

## 互動設計

- 按鈕點擊後顯示「執行中…」並禁用，避免重複點擊。
- 操作結果以 Toast 提示。
- 執行 log 顯示在對應頁面底部的 `<pre>` 區塊。
- 危險操作（重開機、清空音樂）使用 Modal 二次確認。
