"use client";

import { useEffect, useState } from 'react';
import { Activity, Music, RefreshCw, Wifi, WifiOff, HelpCircle, Loader2, Store } from 'lucide-react';
import { loadLocalStores } from '@/lib/localStorage';

export default function DashboardClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [status, setStatus] = useState({});

  async function fetchStatus(store) {
    if (!supabaseOk) {
      setStatus((prev) => ({
        ...prev,
        [store.storeId]: { ok: false, error: '需先設定 Supabase 才能執行遠端查詢' },
      }));
      return;
    }
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: store.storeId, commandKey: 'status_dashboard' }),
    });
    const data = await res.json();
    setStatus((prev) => ({ ...prev, [store.storeId]: data }));
  }

  useEffect(() => {
    if (!supabaseOk && typeof window !== 'undefined') {
      const local = loadLocalStores();
      setStores(local.length ? local : (initialStores || []));
    } else {
      setStores(initialStores || []);
    }
  }, [initialStores, supabaseOk]);

  useEffect(() => {
    if (!supabaseOk) return undefined;
    stores.forEach((s) => fetchStatus(s));
    const id = setInterval(() => {
      stores.forEach((s) => fetchStatus(s));
    }, 60000);
    return () => clearInterval(id);
  }, [stores.length, supabaseOk]);

  const online = Object.values(status).filter((s) => s.ok).length;

  return (
    <>
      <div className="store-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(14,165,233,0.15)', padding: '0.8rem', borderRadius: '0.8rem' }}>
            <Store size={24} color="var(--accent-2)" />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stores.length}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>總店數</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(34,197,94,0.15)', padding: '0.8rem', borderRadius: '0.8rem' }}>
            <Wifi size={24} color="var(--success)" />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{online}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>線上</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239,68,68,0.15)', padding: '0.8rem', borderRadius: '0.8rem' }}>
            <WifiOff size={24} color="var(--danger)" />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stores.length - online}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>異常</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="page-header">
          <h2>店點列表</h2>
          <p>每分鐘自動重新整理狀態</p>
        </div>
        <div className="store-grid">
          {stores.map((s) => {
            const st = status[s.storeId];
            const dashboard = st?.parsed || st?.result || {};
            const isOnline = st?.ok;
            const isChecking = !st;
            return (
              <div key={s.storeId} className="store-card">
                <div className="store-card-header">
                  <div>
                    <div className="store-card-title">{s.storeName}</div>
                    <div className="store-card-meta">{s.storeId} · {s.mqttBroker}</div>
                  </div>
                  {isChecking ? (
                    <span className="badge badge-gray"><Loader2 size={12} className="spin" /> 檢查中</span>
                  ) : isOnline ? (
                    <span className="badge badge-green"><Wifi size={12} /> 線上</span>
                  ) : (
                    <span className="badge badge-red"><WifiOff size={12} /> 異常</span>
                  )}
                </div>
                {!isOnline && st && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                    <strong>錯誤：</strong>{st.error || '狀態取得失敗'}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-2)' }}>
                    <Music size={16} color="var(--accent-2)" />
                    {dashboard?.current_track || '-'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-2)' }}>
                    <RefreshCw size={16} color="var(--success)" />
                    {dashboard?.last_sync_at || '-'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {stores.length === 0 && (
          <div className="empty-state">
            <HelpCircle size={48} />
            <p>尚無店點，請到 Stores 新增。</p>
          </div>
        )}
      </div>
    </>
  );
}
