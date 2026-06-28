"use client";

import { useState } from 'react';
import { FileText, Loader2, Terminal } from 'lucide-react';

const TYPES = [
  { key: 'system', label: 'System' },
  { key: 'player', label: 'Player' },
  { key: 'sync', label: 'Sync' },
];

export default function LogsClient({ initialStores, supabaseOk }) {
  const [stores] = useState(initialStores || []);
  const [selected, setSelected] = useState('');
  const [type, setType] = useState('system');
  const [lines, setLines] = useState(100);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function loadLog() {
    if (!supabaseOk || !selected) return;
    setLoading(true);
    const res = await fetch(`/api/logs?storeId=${selected}&type=${type}&lines=${lines}`);
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  const store = stores.find((s) => s.storeId === selected);

  return (
    <>
      <div className="card">
        <div className="form-row">
          <div className="form-group">
            <label>店點</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">選擇店點</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>{s.storeName} ({s.storeId})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Log 類型</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>行數</label>
            <input type="number" min={10} max={500} value={lines} onChange={(e) => setLines(e.target.value)} />
          </div>
        </div>
        <button className="primary" onClick={loadLog} disabled={loading || !selected}>
          {loading ? <Loader2 size={16} className="spin" /> : <Terminal size={16} />} 載入 Log
        </button>
      </div>

      {result && (
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={18} /> {store?.storeName || result.storeId} · {type}
            {!result.ok && <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>載入失敗：{result.error}</span>}
          </h2>
          {result.ok && (
            <pre className="log-output" style={{ maxHeight: '600px' }}>{result.data?.lines || '(無內容)'}</pre>
          )}
        </div>
      )}
    </>
  );
}
