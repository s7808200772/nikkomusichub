"use client";

import { useEffect, useState } from 'react';
import { Server, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export default function OtaLogsClient({ initialLogs, supabaseOk }) {
  const [logs, setLogs] = useState(initialLogs || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabaseOk) return;
    async function load() {
      setLoading(true);
      const res = await fetch('/api/ota');
      const data = await res.json();
      setLogs(data.logs || []);
      setLoading(false);
    }
    load();
  }, [supabaseOk]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <RefreshCw size={20} color="var(--accent-2)" /> OTA 更新紀錄
        </h2>
        <button className="ghost icon-btn" onClick={() => { setLoading(true); fetch('/api/ota').then(r => r.json()).then(d => { setLogs(d.logs || []); setLoading(false); }); }} disabled={loading || !supabaseOk}>
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">
          <Server size={48} />
          <p>尚無 OTA 更新紀錄</p>
        </div>
      ) : (
        <div className="list-table-wrap">
          <table className="list-table">
            <thead>
              <tr>
                <th>店點</th>
                <th>動作</th>
                <th>狀態</th>
                <th>時間</th>
                <th>錯誤訊息</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.store_id}</strong></td>
                  <td><span className="badge badge-gray">{l.action}</span></td>
                  <td>
                    {l.status === 'success' ? (
                      <span className="badge badge-green"><CheckCircle2 size={12} /> 成功</span>
                    ) : l.status === 'started' ? (
                      <span className="badge badge-yellow"><Loader2 size={12} className="spin" /> 進行中</span>
                    ) : (
                      <span className="badge badge-red"><AlertCircle size={12} /> 失敗</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('zh-TW')}</td>
                  <td style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{l.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
