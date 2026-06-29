"use client";

import { useState, useEffect } from 'react';
import { Save, KeyRound, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { loadLocalSettings, saveLocalSettings } from '@/lib/localStorage';

const DEFAULTS = {
  defaultMqttBroker: '114.55.1.51',
  defaultMqttPort: '1883',
  defaultMqttUsername: 'admin',
  defaultMqttPassword: 'topup30%off',
  defaultMqttTls: false,
  defaultMqttTlsVerify: false,
};

function applyDefaults(settings) {
  return {
    ...DEFAULTS,
    ...settings,
  };
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrap">
      <input
        type={show ? 'text' : 'password'}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        style={{ marginBottom: 0 }}
      />
      <button
        type="button"
        className="eye-btn icon-btn"
        onClick={() => setShow((s) => !s)}
        title={show ? '隱藏密碼' : '顯示密碼'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function SettingsClient({ initialSettings, supabaseOk }) {
  const [settings, setSettings] = useState(() => applyDefaults(initialSettings || {}));
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseOk && typeof window !== 'undefined') {
      const local = loadLocalSettings();
      setSettings(applyDefaults({ ...(initialSettings || {}), ...local }));
    } else {
      setSettings(applyDefaults(initialSettings || {}));
    }
  }, [initialSettings, supabaseOk]);

  useEffect(() => {
    if (!supabaseOk) return;
    async function load() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(applyDefaults(data.settings || {}));
        }
      } catch {}
    }
    load();
  }, [supabaseOk]);

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
      const data = await res.json();
      setSettings(applyDefaults(data.settings || settings));
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
          <div className="form-row">
            <div className="form-group">
              <label>預設 MQTT Broker</label>
              <input
                value={settings.defaultMqttBroker || ''}
                onChange={(e) => setSettings({ ...settings, defaultMqttBroker: e.target.value })}
                placeholder="114.55.1.51"
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
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>預設 MQTT 使用者</label>
              <input
                value={settings.defaultMqttUsername || ''}
                onChange={(e) => setSettings({ ...settings, defaultMqttUsername: e.target.value })}
                placeholder="admin"
              />
            </div>
            <div className="form-group">
              <label>預設 MQTT 密碼</label>
              <PasswordInput
                value={settings.defaultMqttPassword}
                onChange={(e) => setSettings({ ...settings, defaultMqttPassword: e.target.value })}
                placeholder="topup30%off"
              />
            </div>
          </div>

          <label className="switch-row" style={{ marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={settings.defaultMqttTls === true}
              onChange={(e) => setSettings({ ...settings, defaultMqttTls: e.target.checked })}
            />
            預設使用 TLS 加密連線
          </label>
          <label className="switch-row" style={{ marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={settings.defaultMqttTlsVerify === true}
              onChange={(e) => setSettings({ ...settings, defaultMqttTlsVerify: e.target.checked })}
            />
            預設驗證 broker TLS 憑證
          </label>

          {msg && (
            <div className={`badge badge-${msgType === 'success' ? 'green' : 'red'}`} style={{ marginBottom: '1rem', width: 'fit-content' }}>
              {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {msg}
            </div>
          )}

          <button type="submit" className="primary" disabled={busy} title="儲存 MQTT 預設設定">
            {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {busy ? '儲存中…' : '儲存設定'}
          </button>
        </form>
      </div>
    </div>
  );
}
