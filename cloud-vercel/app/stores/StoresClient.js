"use client";

import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Server, Hash, Save, AlertCircle, CheckCircle2, Search, Pencil, X, Activity, Loader2, Wifi, WifiOff } from 'lucide-react';
import { loadLocalStores, saveLocalStores } from '@/lib/localStorage';

const DEFAULT_STORE = {
  mqttBroker: 'broker.hivemq.com',
  mqttPort: 8883,
  mqttTls: true,
  mqttUsername: '',
  mqttPassword: '',
};

export default function StoresClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [form, setForm] = useState({ ...DEFAULT_STORE });
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
    if (!supabaseOk) {
      const { mqttPassword: _mqttPassword, mqttUsername: _mqttUsername, ...safeForm } = form;
      const newStore = { ...safeForm, storeId: form.storeId.trim(), storeName: form.storeName.trim() };
      const next = [...stores, newStore];
      saveLocalStores(next);
      setStores(next);
      setForm({ ...DEFAULT_STORE });
      setMsg('店點已儲存至瀏覽器；遠端 MQTT 功能需先設定 Supabase');
      setMsgType('success');
      setBusy(false);
      return;
    }
    const res = await fetch('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setForm({ ...DEFAULT_STORE });
      setMsg('店點新增成功');
      setMsgType('success');
      load();
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
      load();
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
      return;
    }
    await fetch(`/api/stores?storeId=${storeId}`, { method: 'DELETE' });
    load();
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
              <input value={form.storeId || ''} onChange={(e) => setForm({ ...form, storeId: e.target.value })} placeholder="store-001" required />
            </div>
            <div className="form-group">
              <label><Server size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> 店名 *</label>
              <input value={form.storeName || ''} onChange={(e) => setForm({ ...form, storeName: e.target.value })} placeholder="台北信義店" required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>MQTT Broker *</label>
              <input value={form.mqttBroker || 'broker.hivemq.com'} onChange={(e) => setForm({ ...form, mqttBroker: e.target.value })} placeholder="broker.hivemq.com" required />
            </div>
            <div className="form-group">
              <label>MQTT Port</label>
              <input type="number" value={form.mqttPort || 8883} onChange={(e) => setForm({ ...form, mqttPort: e.target.value })} />
            </div>
          </div>

          <label className="switch-row" style={{ marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={form.mqttTls !== false}
              onChange={(e) => setForm({ ...form, mqttTls: e.target.checked })}
            />
            使用 TLS 加密連線（建議，預設 Port 8883）
          </label>

          <div className="form-row">
            <div className="form-group">
              <label>MQTT 使用者（選填）</label>
              <input value={form.mqttUsername || ''} onChange={(e) => setForm({ ...form, mqttUsername: e.target.value })} placeholder="公開 broker 可留空" />
            </div>
            <div className="form-group">
              <label>MQTT 密碼（選填）</label>
              <input type="password" value={form.mqttPassword || ''} onChange={(e) => setForm({ ...form, mqttPassword: e.target.value })} placeholder="公開 broker 可留空" />
            </div>
          </div>

          {msg && (
            <div className={`badge badge-${msgType === 'success' ? 'green' : 'red'}`} style={{ marginBottom: '1rem', width: 'fit-content' }}>
              {msgType === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {msg}
            </div>
          )}

          <button type="submit" className="primary" disabled={busy}>
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

        <div className="store-grid">
          {filtered.map((s) => (
            <div key={s.storeId} className="store-card">
              {editing?.storeId === s.storeId ? (
                <form onSubmit={saveEdit}>
                  <div className="form-group">
                    <label>店名</label>
                    <input value={editing.storeName} onChange={(e) => setEditing({ ...editing, storeName: e.target.value })} required />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>MQTT Broker</label>
                      <input value={editing.mqttBroker} onChange={(e) => setEditing({ ...editing, mqttBroker: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>MQTT Port</label>
                      <input type="number" value={editing.mqttPort} onChange={(e) => setEditing({ ...editing, mqttPort: e.target.value })} required />
                    </div>
                  </div>
                  <label className="switch-row" style={{ marginBottom: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={editing.mqttTls !== false}
                      onChange={(e) => setEditing({ ...editing, mqttTls: e.target.checked })}
                    />
                    使用 TLS 加密連線
                  </label>
                  <div className="form-row">
                    <div className="form-group">
                      <label>MQTT 使用者</label>
                      <input value={editing.mqttUsername} onChange={(e) => setEditing({ ...editing, mqttUsername: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>MQTT 密碼</label>
                      <input type="password" value={editing.mqttPassword} onChange={(e) => setEditing({ ...editing, mqttPassword: e.target.value })} placeholder="留空則不變" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="primary" disabled={busy}>
                      <Save size={14} /> 儲存
                    </button>
                    <button type="button" className="ghost" onClick={() => setEditing(null)} disabled={busy}>
                      <X size={14} /> 取消
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="store-card-header">
                    <div>
                      <div className="store-card-title">{s.storeName}</div>
                      <div className="store-card-meta">{s.storeId}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="icon-btn" onClick={() => testConnection(s.storeId)} title="測試連線" disabled={testStatus[s.storeId]?.loading}>
                        {testStatus[s.storeId]?.loading ? <Loader2 size={16} className="spin" /> : <Activity size={16} />}
                      </button>
                      <button className="icon-btn" onClick={() => setEditing({ ...s, mqttPassword: '' })} title="編輯">
                        <Pencil size={16} />
                      </button>
                      <button className="danger icon-btn" onClick={() => remove(s.storeId)} title="刪除">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Server size={16} color="var(--muted)" /> {s.mqttTls !== false ? 'TLS · ' : ''}{s.mqttBroker}:{s.mqttPort}
                    </div>
                    {s.mqttUsername && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--muted)' }}>使用者：</span>{s.mqttUsername}
                      </div>
                    )}
                  </div>
                  {testStatus[s.storeId] && !testStatus[s.storeId].loading && (
                    <div>
                      <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: testStatus[s.storeId].ok ? 'var(--success)' : 'var(--danger)' }}>
                        {testStatus[s.storeId].ok ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {testStatus[s.storeId].error || 'MQTT 連線成功'}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Server size={48} />
            <p>{search ? '沒有符合搜索條件的店點' : '尚無店點'}</p>
          </div>
        )}
      </div>
    </>
  );
}
