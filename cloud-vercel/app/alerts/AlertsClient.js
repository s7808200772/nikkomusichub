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
      <div className="store-grid" style={{ marginBottom: '1.5rem' }}>
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
        <h2>告警列表</h2>
        {[...unack, ...acked].length === 0 && (
          <div className="empty-state">
            <CheckCircle2 size={48} color="var(--success)" />
            <p>目前沒有告警</p>
          </div>
        )}
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {[...unack, ...acked].map((a) => {
            const color = a.severity === 'offline' || a.severity === 'critical' ? 'danger' : 'warning';
            return (
              <div key={a.id} className="store-card" style={{ borderLeft: `4px solid var(--${color})` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {a.severity === 'offline' ? <WifiOff size={18} color="var(--danger)" /> :
                     a.severity === 'critical' ? <AlertCircle size={18} color="var(--danger)" /> :
                     <Bell size={18} color="var(--warning)" />}
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.store_id} · {TYPE_LABELS[a.type] || a.type}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{a.message}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                        {new Date(a.created_at).toLocaleString('zh-TW')}
                        {a.acknowledged_at && ` · 已確認 ${new Date(a.acknowledged_at).toLocaleString('zh-TW')}`}
                      </div>
                    </div>
                  </div>
                  {!a.acknowledged_at && (
                    <button className="primary" onClick={() => acknowledge(a.id)} disabled={ackLoading === a.id}>
                      {ackLoading === a.id ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} 確認
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
