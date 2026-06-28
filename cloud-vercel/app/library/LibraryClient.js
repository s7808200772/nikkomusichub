"use client";

import { useState } from 'react';
import { Music, RefreshCw, Loader2, CheckCircle2, AlertCircle, Server } from 'lucide-react';

export default function LibraryClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [selected, setSelected] = useState(new Set());
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchJob, setBatchJob] = useState(null);

  function toggleSelect(storeId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  async function loadLibraries() {
    if (!supabaseOk) return;
    setLoading(true);
    const res = await fetch('/api/library');
    const data = await res.json();
    const all = [];
    (data.stores || []).forEach((s) => {
      if (!s.ok || !s.data) return;
      (s.data.files || []).forEach((f) => {
        all.push({ ...f, storeId: s.storeId, storeName: s.storeName });
      });
    });
    setLibrary(all);
    setLoading(false);
  }

  async function syncSelected() {
    if (!supabaseOk || selected.size === 0) return;
    setBatchLoading(true);
    const res = await fetch('/api/command/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeIds: Array.from(selected), commandKey: 'sync' }),
    });
    const data = await res.json();
    setBatchLoading(false);
    if (data.jobId) {
      setBatchJob({ id: data.jobId });
      pollJob(data.jobId);
    }
  }

  async function pollJob(jobId) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/command/batch?jobId=${jobId}`);
      const data = await res.json();
      if (data.job) {
        setBatchJob(data.job);
        if (data.job.pending === 0) clearInterval(interval);
      }
    }, 2000);
  }

  const grouped = library.reduce((acc, item) => {
    if (!acc[item.path]) acc[item.path] = [];
    acc[item.path].push(item);
    return acc;
  }, {});

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.3rem' }}>批量音樂發布</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>選取店點後點擊「同步 NAS WebDAV」觸發更新</p>
          </div>
          <button className="primary" onClick={syncSelected} disabled={!supabaseOk || batchLoading || selected.size === 0}>
            {batchLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} 同步選取店點
          </button>
        </div>
        {batchJob && (
          <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            任務狀態：成功 {batchJob.success} / 失敗 {batchJob.failed} / 無回應 {batchJob.noResponse} / 總計 {batchJob.total}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Music size={20} color="var(--accent-2)" /> 各店音樂
          </h2>
          <button className="primary" onClick={loadLibraries} disabled={loading || !supabaseOk}>
            {loading ? <Loader2 size={16} className="spin" /> : <Server size={16} />} 載入音樂庫
          </button>
        </div>

        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          {stores.map((s) => (
            <label key={s.storeId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(s.storeId)} onChange={() => toggleSelect(s.storeId)} />
              {s.storeName} <span style={{ color: 'var(--muted)' }}>({s.storeId})</span>
            </label>
          ))}
        </div>

        {library.length === 0 && !loading && (
          <div className="empty-state">
            <Music size={48} />
            <p>尚未載入音樂庫</p>
          </div>
        )}

        {library.length > 0 && (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {Object.entries(grouped).slice(0, 200).map(([path, items]) => (
              <div key={path} className="store-card" style={{ padding: '0.75rem' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.3rem' }}>{path}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {items.map((it, idx) => (
                    <span key={idx} className="badge badge-gray" style={{ fontSize: '0.75rem' }}>{it.storeName}</span>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(grouped).length > 200 && (
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center' }}>尚有更多檔案未顯示</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
