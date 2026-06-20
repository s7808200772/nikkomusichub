"use client";

import { useState, useEffect } from 'react';
import { Save, KeyRound, Folder, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function SettingsClient({ initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || {});
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSettings(initialSettings || {});
  }, [initialSettings]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setMsg('設定已儲存');
      setMsgType('success');
    } else {
      setMsg('儲存失敗');
      setMsgType('error');
    }
    setBusy(false);
  }

  return (
    <div className="settings-grid">
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <KeyRound size={20} color="var(--accent-2)" /> Dropbox
        </h2>
        <form onSubmit={save}>
          <div className="form-group">
            <label>Dropbox Access Token</label>
            <input
              type="password"
              value={settings.dropboxToken || ''}
              onChange={(e) => setSettings({ ...settings, dropboxToken: e.target.value })}
              placeholder="sl.xxx..."
            />
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
              用於各店 Pi 自動同步音樂檔案的 Dropbox Token。
            </p>
          </div>
          <div className="form-group">
            <label>Dropbox 音樂目錄</label>
            <div style={{ position: 'relative' }}>
              <Folder size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                value={settings.dropboxMusicPath || ''}
                onChange={(e) => setSettings({ ...settings, dropboxMusicPath: e.target.value })}
                placeholder="/Music"
                style={{ paddingLeft: '2.4rem' }}
              />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
              雲端音樂檔案所在的 Dropbox 路徑，例如 /Music 或 /StoreMusic。
            </p>
          </div>

          {msg && (
            <div className={`badge badge-${msgType === 'success' ? 'green' : 'red'}`} style={{ marginBottom: '1rem', width: 'fit-content' }}>
              {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {msg}
            </div>
          )}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {busy ? '儲存中…' : '儲存設定'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Folder size={20} color="var(--success)" /> 使用說明
        </h2>
        <ul style={{ color: 'var(--text-2)', lineHeight: 1.8, paddingLeft: '1.2rem' }}>
          <li>Dropbox Token 不會回傳到前端，僅在後端儲存。</li>
          <li>設定變更後，新同步的 Pi 會使用新的音樂目錄。</li>
          <li>建議在 Pi 端安裝完成後，再到 Settings 填入 Token。</li>
        </ul>
      </div>
    </div>
  );
}
