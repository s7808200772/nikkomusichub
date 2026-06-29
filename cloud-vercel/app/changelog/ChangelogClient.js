"use client";

import { useEffect, useState } from 'react';
import { Package, GitCommit } from 'lucide-react';

const CHANGELOG = [
  {
    version: 'v0.3.0',
    date: '2026-06-29',
    items: [
      '修復 Pi 音樂庫刪除按鈕改為「刪除選取」並移至標題列，支援批次刪除',
      '修復 Pi shuffle/loop 勾選後自動跳掉：以持久化設定為準並延長前端同步寬限期',
      '修復 Cloud OTA 頁面版本顯示「未知」：強化 git/version 解析與未知值過濾',
      'Cloud 指令控制台非狀態指令（sync、rescan、reboot、OTA、rollback、log、library_list、watchdog）輸出翻譯為中文人話',
      '雙端按鈕新增 loading、progress、timeout、錯誤處理與 transition 狀態回饋',
      '雙端 UI 強化 RWD、Toast 類型樣式、focus ring、清單 fade-in 與進度條',
      '修復 Settings MQTT 預設 broker 使用者/密碼儲存後仍顯示 placeholder 的問題',
      'OTA 與音樂庫店點卡片 checkbox 排版強化，避免文字被擠壓',
      '音樂庫新增 NAS WebDAV 設定並將載入清單持久化到 localStorage',
      '新增店點時 Store ID 自動補上 store- 前綴，MQTT 帳密提示改為「留空即使用預設值」',
      '總覽控制台中央控制台卡片移至店點列表下方',
      'Pi 端 MQTT 預設值改為 114.55.1.51:1883 / admin / topup30%off，移除 Topic Prefix / Command Secret 欄位',
      'Pi WebDAV 設定移除 Remote Name，Remote Music Path 改為 \\NikkoMusic 形式',
      'Pi 店家資訊簡化為店名 + store- 前綴 Store ID',
      'Pi 首頁狀態綠燈改為無閃爍更新並加入脈衝動畫',
      'Pi 播放控制台改為 lucide 風格圖示按鈕',
      'Pi 側邊欄對齊、新增版本更新入口、版權年份改為 2026',
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-06-19',
    items: [
      '新增 MQTT 指令簽章、DANGEROUS_KEYS 確認機制與 replay 防護',
      'Cloud 新增總覽控制台、OTA、音樂庫、店點管理',
      'Pi 新增 WebDAV 同步、播放器控制、系統監控與日誌',
    ],
  },
];

export default function ChangelogClient() {
  const [git, setGit] = useState('');

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.ok ? r.json() : null)
      .then(d => setGit(d?.git || ''))
      .catch(() => {});
  }, []);

  return (
    <div className="container">
      <div className="page-header">
        <h1><Package size={22} /> 版本更新</h1>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h2>目前版本</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)' }}>
          <GitCommit size={18} />
          <code>{git || '載入中…'}</code>
        </div>
      </div>

      <div className="changelog-list">
        {CHANGELOG.map((entry) => (
          <div key={entry.version} className="changelog-entry">
            <div className="changelog-version">
              <span>{entry.version}</span>
              <span className="changelog-date">{entry.date}</span>
            </div>
            <ul>
              {entry.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
