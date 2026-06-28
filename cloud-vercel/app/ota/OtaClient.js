"use client";

import { useState } from 'react';
import { RefreshCw, RotateCcw, Loader2, CheckCircle2, AlertCircle, Server } from 'lucide-react';

export default function OtaClient({ initialStores, initialLogs, supabaseOk }) {
  const [stores] = useState(initialStores || []);
  const [logs, setLogs] = useState(initialLogs || []);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function runAction(action) {
    if (!supabaseOk || !selected) return;
    setLoading(true);
    setMsg('');
    const res = await fetch('/api/ota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: selected, action }),
    });
    const data = await res.json();
    setLoading(false);
    setMsg(data.ok ? `已發送 ${action} 指令` : `失敗：${data.error}`);
    if (data.ok) {
      const listRes = await fetch('/api/ota');
      const listData = await listRes.json();
      setLogs(listData.logs || []);
    }
  }

  return (
    <>
      <div className="card">
        <h2>選擇店點</h2>
        <div className="form-row">
          <div className="form-group">
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ minWidth: '240px' }}>
              <option value="">選擇店點</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>{s.storeName} ({s.storeId})</option>
              ))}
            </select>
          </div>
          <button className="primary" onClick={() => runAction('ota_update')} disabled={loading || !selected}>
            {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} OTA 更新
          </button>
          <button className="danger" onClick={() => runAction('rollback')} disabled={loading || !selected}>
            {loading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} Rollback
          </button>
        </div>
        {msg && <div style={{ marginTop: '0.75rem', color: msg.startsWith('失敗') ? 'var(--danger)' : 'var(--success)' }}>{msg}</div>}
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          OTA 會在背景執行 git pull、pip install 並重啟服務；Rollback 會回到上次 OTA 前的 git tag。
        </p>
      </div>

      <div className="card">
        <h2>更新紀錄</h2>
        {logs.length === 0 && <div className="empty-state"><Server size={48} /><p>尚無更新紀錄</p></div>}
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {logs.map((l) => (
            <div key={l.id} className="store-card" style={{ borderLeft: `4px solid var(--${l.status === 'success' ? 'success' : 'danger'})` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {l.status === 'success' ? <CheckCircle2 size={16} color="var(--success)" /> : <AlertCircle size={16} color="var(--danger)" />}
                <strong>{l.store_id}</strong>
                <span className="badge badge-gray">{l.action}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{new Date(l.created_at).toLocaleString('zh-TW')}</span>
              </div>
              {l.error && <div style={{ fontSize: '0.85rem', color: 'var(--danger)', marginTop: '0.3rem' }}>{l.error}</div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
