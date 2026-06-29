"use client";

import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Server, Hash, Save, AlertCircle, CheckCircle2, Search, Pencil, X, Activity, Loader2, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react';
import { loadLocalStores, saveLocalStores } from '@/lib/localStorage';

const DEFAULT_STORE = {
  storeId: '',
  storeName: '',
  mqttBroker: '',
  mqttPort: '',
  mqttTls: false,
  tlsVerify: false,
  mqttUsername: '',
  mqttPassword: '',
};

const FALLBACK = {
  defaultMqttBroker: '114.55.1.51',
  defaultMqttPort: '1883',
  defaultMqttUsername: 'admin',
  defaultMqttPassword: 'topup30%off',
  defaultMqttTls: false,
  defaultMqttTlsVerify: false,
};

const STORES_CHANGED_EVENT = 'nikko-stores-changed';

function notifyStoresChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORES_CHANGED_EVENT));
  }
}

function applyDefaultSettings(form, settings) {
  return {
    ...form,
    mqttBroker: form.mqttBroker || settings?.defaultMqttBroker || FALLBACK.defaultMqttBroker,
    mqttPort: form.mqttPort || settings?.defaultMqttPort || FALLBACK.defaultMqttPort,
    mqttUsername: form.mqttUsername || settings?.defaultMqttUsername || FALLBACK.defaultMqttUsername,
    mqttPassword: form.mqttPassword || settings?.defaultMqttPassword || FALLBACK.defaultMqttPassword,
    mqttTls: form.mqttTls ?? settings?.defaultMqttTls ?? FALLBACK.defaultMqttTls,
    tlsVerify: form.tlsVerify ?? settings?.defaultMqttTlsVerify ?? FALLBACK.defaultMqttTlsVerify,
  };
}

function ensureStorePrefix(value) {
  const v = (value || '').trim();
  if (!v) return '';
  const lower = v.toLowerCase();
  if (lower.startsWith('store-')) {
    const suffix = v.slice(6).trim();
    return suffix ? v : '';
  }
  if (lower === 'store') return '';
  if (lower.startsWith('store')) return `store-${v.slice(5).trim()}`;
  return `store-${v}`;
}

function PasswordInput({ value, onChange, placeholder, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrap">
      <input
        id={id}
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

export default function StoresClient({ initialStores, initialSettings, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [form, setForm] = useState(() => applyDefaultSettings({ ...DEFAULT_STORE }, initialSettings));
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [testStatus, setTestStatus] = useState({});

  useEffect(() => {
    if (!supabaseOk && typeof window !== 'undefined') {
      const local = loadLocalStores();
      setStores(local.length ? local : (initialStores || []));
    }
  }, [initialStores, supabaseOk]);

  async function load() {
    if (!supabaseOk) {
      setStores(loadLocalStores());
      return;
    }
    const res = await fetch('/api/stores');
    const data = await res.json();
    setStores(data.stores || []);
  }

  async function addStore(e) {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    const storeId = ensureStorePrefix(form.storeId);
    if (!storeId) {
      setMsg('Store ID 不得為空，請輸入 store- 後的編號（例如 001）');
      setMsgType('error');
      setBusy(false);
      return;
    }
    const payload = {
      storeId,
      storeName: form.storeName.trim(),
      mqttBroker: form.mqttBroker.trim(),
      mqttPort: form.mqttPort ? parseInt(form.mqttPort, 10) : null,
      mqttTls: form.mqttTls === true,
      tlsVerify: form.tlsVerify === true,
      mqttUsername: form.mqttUsername.trim(),
      mqttPassword: form.mqttPassword,
    };
    if (!supabaseOk) {
      const next = [...stores, payload];
      saveLocalStores(next);
      setStores(next);
      notifyStoresChanged();
      setForm(applyDefaultSettings({ ...DEFAULT_STORE }, initialSettings));
      setMsg('店點已儲存至瀏覽器；遠端 MQTT 功能需先設定 Supabase');
      setMsgType('success');
      setBusy(false);
      return;
    }
    const res = await fetch('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      setForm(applyDefaultSettings({ ...DEFAULT_STORE }, initialSettings));
      setMsg('店點新增成功');
      setMsgType('success');
      await load();
      notifyStoresChanged();
    } else {
      setMsg(data.error || '新增失敗');
      setMsgType('error');
    }
    setBusy(false);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    if (!supabaseOk) {
      const next = stores.map((s) => (s.storeId === editing.storeId ? editing : s));
      saveLocalStores(next);
      setStores(next);
      notifyStoresChanged();
      setEditing(null);
      setMsg('店點已更新（瀏覽器本機）');
      setMsgType('success');
      setBusy(false);
      return;
    }
    const res = await fetch('/api/stores', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (res.ok) {
      setEditing(null);
      setMsg('店點更新成功');
      setMsgType('success');
      await load();
      notifyStoresChanged();
    } else {
      setMsg(data.error || '更新失敗');
      setMsgType('error');
    }
    setBusy(false);
  }

  async function remove(storeId) {
    if (!confirm(`確定刪除 ${storeId}？`)) return;
    if (!supabaseOk) {
      const next = stores.filter((s) => s.storeId !== storeId);
      saveLocalStores(next);
      setStores(next);
      notifyStoresChanged();
      return;
    }
    await fetch(`/api/stores?storeId=${storeId}`, { method: 'DELETE' });
    await load();
    notifyStoresChanged();
  }

  async function testConnection(storeId) {
    if (!supabaseOk) {
      setTestStatus((prev) => ({
        ...prev,
        [storeId]: { ok: false, error: '需先設定 Supabase 才能測試連線', loading: false },
      }));
      return;
    }
    setTestStatus((prev) => ({ ...prev, [storeId]: { loading: true } }));
    const res = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId }),
    });
    const data = await res.json();
    setTestStatus((prev) => ({ ...prev, [storeId]: { ...data, loading: false } }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.storeId.toLowerCase().includes(q) ||
        s.storeName.toLowerCase().includes(q) ||
        s.mqttBroker.toLowerCase().includes(q)
    );
  }, [stores, search]);

  return (
    <>
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={20} color="var(--accent-2)" /> 新增店點
        </h2>
        <form onSubmit={addStore}>
          <div className="form-row">
            <div className="form-group">
              <label><Hash size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Store ID *</label>
              <input
                value={form.storeId || ''}
                onChange={(e) => setForm({ ...form, storeId: ensureStorePrefix(e.target.value) })}
                placeholder="store-001"
                required
              />
              <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>會自動加上 store- 前綴，例如輸入 001 即為 store-001</small>
            </div>
            <div className="form-group">
              <label><Server size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> 店名 *</label>
              <input value={form.storeName || ''} onChange={(e) => setForm({ ...form, storeName: e.target.value })} placeholder="台北信義店" required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>MQTT Broker *</label>
              <input value={form.mqttBroker || ''} onChange={(e) => setForm({ ...form, mqttBroker: e.target.value })} placeholder="114.55.1.51" required />
            </div>
            <div className="form-group">
              <label>MQTT Port *</label>
              <input type="number" value={form.mqttPort || ''} onChange={(e) => setForm({ ...form, mqttPort: e.target.value })} placeholder="1883" required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>MQTT 使用者（留空即使用預設值）</label>
              <input value={form.mqttUsername || ''} onChange={(e) => setForm({ ...form, mqttUsername: e.target.value })} placeholder="admin" />
            </div>
            <div className="form-group">
              <label>MQTT 密碼（留空即使用預設值）</label>
              <PasswordInput
                value={form.mqttPassword}
                onChange={(e) => setForm({ ...form, mqttPassword: e.target.value })}
                placeholder="topup30%off"
              />
            </div>
          </div>

          <label className="switch-row" style={{ marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={form.mqttTls === true}
              onChange={(e) => setForm({ ...form, mqttTls: e.target.checked })}
            />
            使用 TLS 加密連線（未勾選時以純文字連線）
          </label>
          <label className="switch-row" style={{ marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={form.tlsVerify === true}
              onChange={(e) => setForm({ ...form, tlsVerify: e.target.checked })}
            />
            驗證 broker TLS 憑證
          </label>

          {msg && (
            <div className={`badge badge-${msgType === 'success' ? 'green' : 'red'}`} style={{ marginBottom: '1rem', width: 'fit-content' }}>
              {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {msg}
            </div>
          )}

          <button type="submit" className="primary" disabled={busy} title="新增店點">
            <Save size={16} />
            {busy ? '儲存中…' : '新增店點'}
          </button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Server size={20} color="var(--accent-2)" /> 已登錄店點
            <span className="badge badge-gray">{filtered.length} / {stores.length}</span>
          </h2>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Store ID、店名、Broker"
              style={{ paddingLeft: '2.4rem', marginBottom: 0 }}
            />
          </div>
        </div>

        {filtered.length > 0 ? (
          <table className="list-table" style={{ marginBottom: editing ? '1rem' : 0 }}>
            <thead>
              <tr>
                <th>店點</th>
                <th>Broker</th>
                <th>使用者</th>
                <th>連線</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.storeId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.storeName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {s.mqttTls === true && <span className="badge badge-blue">TLS</span>}
                      <span>{s.mqttBroker}:{s.mqttPort}</span>
                    </div>
                  </td>
                  <td style={{ color: s.mqttUsername ? 'var(--text)' : 'var(--muted)' }}>
                    {s.mqttUsername || '-'}
                  </td>
                  <td>
                    {testStatus[s.storeId] && !testStatus[s.storeId].loading ? (
                      <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: testStatus[s.storeId].ok ? 'var(--success)' : 'var(--danger)' }}>
                        {testStatus[s.storeId].ok ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {testStatus[s.storeId].error || 'MQTT 連線成功'}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>未測試</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      <button className="icon-btn" onClick={() => testConnection(s.storeId)} title="測試 MQTT 連線" disabled={testStatus[s.storeId]?.loading}>
                        {testStatus[s.storeId]?.loading ? <Loader2 size={16} className="spin" /> : <Activity size={16} />}
                      </button>
                      <button className="icon-btn" onClick={() => setEditing({ ...s, mqttPassword: '' })} title="編輯店點">
                        <Pencil size={16} />
                      </button>
                      <button className="danger icon-btn" onClick={() => remove(s.storeId)} title="刪除店點">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <Server size={48} />
            <p>{search ? '沒有符合搜索條件的店點' : '尚無店點'}</p>
          </div>
        )}

        {editing && (
          <div className="card" style={{ background: 'var(--bg-2)', marginBottom: 0 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
              <Pencil size={18} color="var(--accent-2)" /> 編輯店點：{editing.storeName}
            </h3>
            <form onSubmit={saveEdit}>
              <div className="form-row">
                <div className="form-group">
                  <label>店名</label>
                  <input value={editing.storeName} onChange={(e) => setEditing({ ...editing, storeName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>MQTT Broker</label>
                  <input value={editing.mqttBroker} onChange={(e) => setEditing({ ...editing, mqttBroker: e.target.value })} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>MQTT Port</label>
                  <input type="number" value={editing.mqttPort} onChange={(e) => setEditing({ ...editing, mqttPort: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>MQTT 使用者（留空即使用預設值）</label>
                  <input value={editing.mqttUsername} onChange={(e) => setEditing({ ...editing, mqttUsername: e.target.value })} />
                </div>
              </div>
              <label className="switch-row" style={{ marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={editing.mqttTls === true}
                  onChange={(e) => setEditing({ ...editing, mqttTls: e.target.checked })}
                />
                使用 TLS 加密連線
              </label>
              <label className="switch-row" style={{ marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={editing.tlsVerify === true}
                  onChange={(e) => setEditing({ ...editing, tlsVerify: e.target.checked })}
                />
                驗證 broker TLS 憑證
              </label>
              <div className="form-group">
                <label>MQTT 密碼（留空即使用預設值）</label>
                <PasswordInput
                  value={editing.mqttPassword}
                  onChange={(e) => setEditing({ ...editing, mqttPassword: e.target.value })}
                  placeholder="留空則不變"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="primary" disabled={busy} title="儲存變更">
                  <Save size={14} /> 儲存
                </button>
                <button type="button" className="ghost" onClick={() => setEditing(null)} disabled={busy} title="取消編輯">
                  <X size={14} /> 取消
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
