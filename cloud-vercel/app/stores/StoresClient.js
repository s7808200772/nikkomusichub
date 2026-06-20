"use client";

import { useState, useMemo } from 'react';
import { Plus, Trash2, Server, User, Lock, Globe, Hash, Save, AlertCircle, CheckCircle2, Search, Pencil, X, Activity, Loader2, Wifi, WifiOff } from 'lucide-react';

export default function StoresClient({ initialStores }) {
  const [stores, setStores] = useState(initialStores || []);
  const [form, setForm] = useState({ sshPort: 22, sshUsername: 'pi' });
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [testStatus, setTestStatus] = useState({});

  async function load() {
    const res = await fetch('/api/stores');
    const data = await res.json();
    setStores(data.stores || []);
  }

  async function addStore(e) {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    const res = await fetch('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setForm({ sshPort: 22, sshUsername: 'pi' });
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
    await fetch(`/api/stores?storeId=${storeId}`, { method: 'DELETE' });
    load();
  }

  async function testConnection(storeId) {
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
        s.tailscaleIp.toLowerCase().includes(q)
    );
  }, [stores, search]);

  const iconProps = { size: 16, color: 'var(--muted)' };

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
              <label><Globe size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Tailscale IP *</label>
              <input value={form.tailscaleIp || ''} onChange={(e) => setForm({ ...form, tailscaleIp: e.target.value })} placeholder="100.x.x.x" required />
            </div>
            <div className="form-group">
              <label><Hash size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> SSH Port</label>
              <input type="number" value={form.sshPort || 22} onChange={(e) => setForm({ ...form, sshPort: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label><User size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> SSH 使用者 *</label>
              <input value={form.sshUsername || 'pi'} onChange={(e) => setForm({ ...form, sshUsername: e.target.value })} required />
            </div>
            <div className="form-group">
              <label><Lock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> SSH 密碼 *</label>
              <input type="password" value={form.sshPassword || ''} onChange={(e) => setForm({ ...form, sshPassword: e.target.value })} placeholder="連入 Pi 的密碼" required />
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
              placeholder="搜索 Store ID、店名、IP"
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
                      <label>Tailscale IP</label>
                      <input value={editing.tailscaleIp} onChange={(e) => setEditing({ ...editing, tailscaleIp: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>SSH Port</label>
                      <input type="number" value={editing.sshPort} onChange={(e) => setEditing({ ...editing, sshPort: e.target.value })} required />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>SSH 使用者</label>
                      <input value={editing.sshUsername} onChange={(e) => setEditing({ ...editing, sshUsername: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>SSH 密碼</label>
                      <input type="password" value={editing.sshPassword} onChange={(e) => setEditing({ ...editing, sshPassword: e.target.value })} placeholder="留空則不變" />
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
                      <button className="icon-btn" onClick={() => setEditing({ ...s, sshPassword: '' })} title="編輯">
                        <Pencil size={16} />
                      </button>
                      <button className="danger icon-btn" onClick={() => remove(s.storeId)} title="刪除">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Globe {...iconProps} /> {s.tailscaleIp}:{s.sshPort}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <User {...iconProps} /> {s.sshUsername}
                    </div>
                  </div>
                  {testStatus[s.storeId] && !testStatus[s.storeId].loading && (
                    <div>
                      <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: testStatus[s.storeId].ok ? 'var(--success)' : 'var(--danger)' }}>
                        {testStatus[s.storeId].ok ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {testStatus[s.storeId].error || testStatus[s.storeId].message}
                        {testStatus[s.storeId].stage && ` (${testStatus[s.storeId].stage})`}
                      </div>
                      {testStatus[s.storeId].debug && testStatus[s.storeId].debug.length > 0 && (
                        <details style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                          <summary>除錯日誌</summary>
                          <pre style={{ background: 'var(--bg-2)', padding: '0.5rem', borderRadius: '0.4rem', overflow: 'auto', maxHeight: '120px', margin: '0.4rem 0 0' }}>
                            {testStatus[s.storeId].debug.join('\n')}
                          </pre>
                        </details>
                      )}
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
