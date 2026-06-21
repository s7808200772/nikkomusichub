"use client";

import { useState, useEffect } from 'react';
import { Save, KeyRound, AlertTriangle, CheckCircle2, AlertCircle, Loader2, Database } from 'lucide-react';

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

  const hasKV = process.env.NEXT_PUBLIC_KV_AVAILABLE === '1';

  return (
    <div className="settings-grid">
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Database size={20} color="var(--accent-2)" /> 資料儲存
        </h2>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.7 }}>
          店點資料與設定統一由後端儲存。本地開發會寫入專案目錄的暫存檔；
          部署到 Vercel 後若要資料持久化，請在 Vercel Dashboard 綁定 KV 並設定環境變數
          <code style={{ background: 'var(--bg-2)', padding: '0.15rem 0.4rem', borderRadius: '0.3rem' }}>KV_REST_API_URL</code> 與{' '}
          <code style={{ background: 'var(--bg-2)', padding: '0.15rem 0.4rem', borderRadius: '0.3rem' }}>KV_REST_API_TOKEN</code>。
        </p>
        {!hasKV && (
          <div className="badge badge-yellow" style={{ marginTop: '1rem', width: 'fit-content' }}>
            <AlertTriangle size={14} /> 未偵測到 KV，部署後資料可能會重置
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <KeyRound size={20} color="var(--accent-2)" /> MQTT 預設 Broker
        </h2>
        <form onSubmit={save}>
          <div className="form-group">
            <label>預設 MQTT Broker</label>
            <input
              value={settings.defaultMqttBroker || ''}
              onChange={(e) => setSettings({ ...settings, defaultMqttBroker: e.target.value })}
              placeholder="broker.hivemq.com"
            />
          </div>
          <div className="form-group">
            <label>預設 MQTT Port</label>
            <input
              type="number"
              value={settings.defaultMqttPort || ''}
              onChange={(e) => setSettings({ ...settings, defaultMqttPort: e.target.value })}
              placeholder="1883"
            />
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
    </div>
  );
}
