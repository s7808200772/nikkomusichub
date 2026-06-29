"use client";

import React, { useState } from 'react';
import { Music, RefreshCw, Loader2, CheckCircle2, AlertCircle, Server, HardDrive, Download } from 'lucide-react';

export default function LibraryClient({ initialStores, supabaseOk }) {
  const [stores] = useState(initialStores || []);
  const [selected, setSelected] = useState(new Set());
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchJob, setBatchJob] = useState(null);

  const allSelected = stores.length > 0 && selected.size === stores.length;

  function toggleSelect(storeId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  function selectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(stores.map((s) => s.storeId)));
    }
  }

  async function loadNasLibrary() {
    if (!supabaseOk) return;
    setLoading(true);
    setError('');
    setFiles([]);
    try {
      const res = await fetch('/api/library?source=webdav');
      const data = await res.json();
      const okResults = (data.stores || []).filter((s) => s.ok && s.data);
      if (okResults.length === 0) {
        const firstError = (data.stores || []).find((s) => !s.ok)?.error || '沒有店點回傳 NAS 音樂清單';
        setError(firstError);
      } else {
        const allFiles = new Set();
        okResults.forEach((s) => {
          (s.data.files || []).forEach((f) => allFiles.add(typeof f === 'string' ? f : f.path || JSON.stringify(f)));
        });
        setFiles(Array.from(allFiles).sort());
      }
    } catch (e) {
      setError(e.message);
    }
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

  async function downloadSelected() {
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

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.3rem' }}>WebDAV / NAS 音樂庫</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>顯示 NAS 上目前可同步的音樂檔案。選取店點後可一鍵同步+下載。</p>
          </div>
          <button className="primary" onClick={loadNasLibrary} disabled={loading || !supabaseOk}>
            {loading ? <Loader2 size={16} className="spin" /> : <HardDrive size={16} />} 載入 NAS 音樂清單
          </button>
        </div>
        {error && (
          <div className="badge badge-red" style={{ marginTop: '1rem', width: 'fit-content' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Server size={20} color="var(--accent-2)" /> 目標店點
            <span className="badge badge-gray">{selected.size} / {stores.length}</span>
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="ghost" onClick={selectAll} disabled={stores.length === 0}>
              {allSelected ? '取消全選' : '全選'}
            </button>
            <button className="primary" onClick={syncSelected} disabled={!supabaseOk || batchLoading || selected.size === 0}>
              {batchLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} 同步到選取店點
            </button>
            <button className="primary" onClick={downloadSelected} disabled={!supabaseOk || batchLoading || selected.size === 0}>
              {batchLoading ? <Loader2 size={16} className="spin" /> : <Download size={16} />} 下載到選取店點
            </button>
          </div>
        </div>

        {stores.length === 0 ? (
          <div className="empty-state">
            <Server size={48} />
            <p>尚無店點，請先到「店點管理」新增。</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
            {stores.map((s) => (
              <label key={s.storeId} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', padding: '0.75rem', margin: 0 }}>
                <input type="checkbox" checked={selected.has(s.storeId)} onChange={() => toggleSelect(s.storeId)} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.storeName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId}</div>
                </div>
              </label>
            ))}
          </div>
        )}

        {batchJob && (
          <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            任務狀態：成功 {batchJob.success} / 失敗 {batchJob.failed} / 無回應 {batchJob.noResponse} / 總計 {batchJob.total}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Music size={20} color="var(--accent-2)" /> NAS 音樂清單
          <span className="badge badge-gray">{files.length}</span>
        </h2>
        {files.length === 0 && !loading && (
          <div className="empty-state">
            <Music size={48} />
            <p>尚未載入 NAS 音樂清單</p>
          </div>
        )}
        {files.length > 0 && (
          <div className="list-table-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="list-table">
              <thead>
                <tr>
                  <th>檔案路徑</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.85rem' }}>{f}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
