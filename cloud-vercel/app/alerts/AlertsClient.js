"use client";

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, AlertCircle, WifiOff, Loader2 } from 'lucide-react';

const TYPE_LABELS = {
  offline: '離線',
  disk_low: '磁碟不足',
  sync_failed: '同步失敗',
  player_down: '播放異常',
};

export default function AlertsClient({ initialAlerts, initialStores, supabaseOk }) {
  const [alerts, setAlerts] = useState(initialAlerts || []);
  const [ackLoading, setAckLoading] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const storeMap = useMemo(() => {
    const map = {};
    (initialStores || []).forEach((s) => { map[s.storeId] = s; });
    return map;
  }, [initialStores]);

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

  async function acknowledgeBulk() {
    const ids = alerts
      .filter((a) => !a.acknowledged_at && selected.has(a.id))
      .map((a) => a.id);
    if (ids.length === 0) return;
    setBulkLoading(true);
    const results = await Promise.all(ids.map(async (id) => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: id }),
      });
      return { id, ok: res.ok };
    }));
    const ackedIds = results.filter((r) => r.ok).map((r) => r.id);
    setAlerts((prev) =>
      prev.map((a) => (ackedIds.includes(a.id) ? { ...a, acknowledged_at: new Date().toISOString() } : a))
    );
    setSelected(new Set());
    setBulkLoading(false);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnack() {
    const unackIds = unack.map((a) => a.id);
    const allSelected = unackIds.length > 0 && unackIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        unackIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        unackIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  const unack = alerts.filter((a) => !a.acknowledged_at);
  const acked = alerts.filter((a) => a.acknowledged_at);
  const selectedUnackCount = unack.filter((a) => selected.has(a.id)).length;

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>告警列表</h2>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>「標記已處理」代表這條告警已看過，會從未確認數中移除</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ghost" onClick={selectAllUnack} title="全選/取消全選未處理告警">
                全選
              </button>
              <button
                className="primary"
                onClick={acknowledgeBulk}
                disabled={bulkLoading || selectedUnackCount === 0}
                title={`批量標記 ${selectedUnackCount} 條告警為已處理`}
              >
                {bulkLoading ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                批量標記已處理
              </button>
            </div>
          </div>
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
                  <th style={{ width: '1%' }}>選取</th>
                  <th style={{ width: '160px' }}>店點</th>
                  <th>告警內容</th>
                  <th style={{ width: '160px' }}>時間</th>
                  <th style={{ width: '1%' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...unack, ...acked].map((a) => {
                  const severityColor = a.severity === 'offline' || a.severity === 'critical' ? 'danger' : 'warning';
                  const store = storeMap[a.store_id];
                  return (
                    <tr key={a.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggleSelect(a.id)}
                          disabled={!!a.acknowledged_at}
                          title={a.acknowledged_at ? '已處理' : '選取以批量標記'}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{store?.storeName || a.store_id}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{a.store_id}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span className={`badge badge-${severityColor}`}>{TYPE_LABELS[a.type] || a.type}</span>
                          <span>{a.message}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('zh-TW')}</td>
                      <td>
                        {a.acknowledged_at ? (
                          <button className="ghost" disabled style={{ whiteSpace: 'nowrap', opacity: 0.6, cursor: 'not-allowed' }} title="已處理">
                            <CheckCircle2 size={14} /> 已處理
                          </button>
                        ) : (
                          <button className="primary" onClick={() => acknowledge(a.id)} disabled={ackLoading === a.id} style={{ whiteSpace: 'nowrap' }} title="標記此告警為已處理">
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
