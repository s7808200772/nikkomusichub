"use client";

import { useState, useEffect } from 'react';
import { Save, KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { loadLocalSettings, saveLocalSettings } from '@/lib/localStorage';

export default function SettingsClient({ initialSettings, supabaseOk }) {
  const [settings, setSettings] = useState(initialSettings || {});
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseOk && typeof window !== 'undefined') {
      const local = loadLocalSettings();
      setSettings({ ...(initialSettings || {}), ...local });
    } else {
      setSettings(initialSettings || {});
    }
  }, [initialSettings, supabaseOk]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    if (!supabaseOk) {
      saveLocalSettings(settings);
      setMsg('設定已儲存至瀏覽器（未偵測到 Supabase，資料不會同步到雲端）');
      setMsgType('success');
      setBusy(false);
      return;
    }
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
              placeholder="8883"
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
