"use client";

import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, AlertCircle, WifiOff, Loader2 } from 'lucide-react';

const TYPE_LABELS = {
  offline: '離線',
  disk_low: '磁碟不足',
  sync_failed: '同步失敗',
  player_down: '播放異常',
};

export default function AlertsClient({ initialAlerts, supabaseOk }) {
  const [alerts, setAlerts] = useState(initialAlerts || []);
  const [ackLoading, setAckLoading] = useState(null);

  useEffect(() => {
    if (!supabaseOk) return;
    async function load() {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(data.alerts || []);
    }
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [supabaseOk]);

  async function acknowledge(id) {
    setAckLoading(id);
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId: id }),
    });
    if (res.ok) {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged_at: new Date().toISOString() } : a))
      );
    }
    setAckLoading(null);
  }

  const unack = alerts.filter((a) => !a.acknowledged_at);
  const acked = alerts.filter((a) => a.acknowledged_at);

  return (
    <>
      <div className="stats-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(245,158,11,0.15)', padding: '0.8rem', borderRadius: '0.8rem' }}>
            <Bell size={24} color="var(--warning)" />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{unack.length}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>未確認告警</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239,68,68,0.15)', padding: '0.8rem', borderRadius: '0.8rem' }}>
            <WifiOff size={24} color="var(--danger)" />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{unack.filter((a) => a.severity === 'offline').length}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>離線</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>告警列表</h2>
          <p style={{ margin: 0 }}>「標記已處理」代表這條告警已看過，會從未確認數中移除</p>
        </div>
        {[...unack, ...acked].length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={48} color="var(--success)" />
            <p>目前沒有告警</p>
          </div>
        ) : (
          <div className="list-table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>店點</th>
                  <th>告警內容</th>
                  <th style={{ width: '160px' }}>時間</th>
                  <th style={{ width: '1%' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...unack, ...acked].map((a) => {
                  const severityColor = a.severity === 'offline' || a.severity === 'critical' ? 'danger' : 'warning';
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.store_id}</strong></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span className={`badge badge-${severityColor}`}>{TYPE_LABELS[a.type] || a.type}</span>
                          <span>{a.message}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('zh-TW')}</td>
                      <td>
                        {a.acknowledged_at ? (
                          <span className="badge badge-green"><CheckCircle2 size={12} /> 已處理</span>
                        ) : (
                          <button className="primary" onClick={() => acknowledge(a.id)} disabled={ackLoading === a.id} style={{ whiteSpace: 'nowrap' }}>
                            {ackLoading === a.id ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} 標記已處理
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
