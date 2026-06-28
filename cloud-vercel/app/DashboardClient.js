"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Music, RefreshCw, Wifi, WifiOff, HelpCircle, Loader2, Store, Terminal, CheckCircle2, AlertCircle, Bell } from 'lucide-react';
import { loadLocalStores } from '@/lib/localStorage';

export default function DashboardClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [status, setStatus] = useState({});
  const [jobs, setJobs] = useState([]);
  const [alerts, setAlerts] = useState([]);

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

  useEffect(() => {
    if (!supabaseOk) return;
    async function loadJobs() {
      const res = await fetch('/api/command/batch');
      const data = await res.json();
      setJobs(data.jobs || []);
    }
    loadJobs();
    const id = setInterval(loadJobs, 10000);
    return () => clearInterval(id);
  }, [supabaseOk]);

  useEffect(() => {
    if (!supabaseOk) return;
    async function loadAlerts() {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(data.alerts || []);
    }
    loadAlerts();
    const id = setInterval(loadAlerts, 30000);
    return () => clearInterval(id);
  }, [supabaseOk]);

  const online = Object.values(status).filter((s) => s.ok).length;
  const unackAlerts = alerts.filter((a) => !a.acknowledged_at);

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
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(245,158,11,0.15)', padding: '0.8rem', borderRadius: '0.8rem' }}>
            <Bell size={24} color="var(--warning)" />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{unackAlerts.length}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>未確認告警</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.3rem' }}>中央控制台</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>快速入口、最近批量任務與告警</p>
          </div>
          <Link href="/commands" className="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Terminal size={16} /> 前往批量指令
          </Link>
        </div>

        {jobs.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>最近批量任務</h3>
            <div className="store-grid">
              {jobs.slice(0, 4).map((job) => (
                <div key={job.id} className="store-card" style={{ padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    {job.pending > 0 ? <Loader2 size={14} className="spin" color="var(--accent-2)" /> :
                     job.failed === 0 && job.noResponse === 0 ? <CheckCircle2 size={14} color="var(--success)" /> :
                     <AlertCircle size={14} color="var(--danger)" />}
                    <strong>{job.commandKey}</strong>
                    <span className="badge badge-gray">{new Date(job.createdAt).toLocaleTimeString('zh-TW')}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
                    成功 {job.success} / 失敗 {job.failed} / 無回應 {job.noResponse} / 總計 {job.total}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>最近告警</h3>
            <div className="store-grid">
              {alerts.slice(0, 5).map((a) => {
                const color = a.severity === 'offline' || a.severity === 'critical' ? 'danger' : 'warning';
                return (
                  <div key={a.id} className="store-card" style={{ padding: '0.75rem', borderLeft: `4px solid var(--${color})` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <Bell size={14} color={`var(--${color})`} />
                      <strong>{a.store_id}</strong>
                      <span className="badge badge-gray">{a.type}</span>
                      {a.acknowledged_at && <span className="badge badge-green">已確認</span>}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{a.message}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{new Date(a.created_at).toLocaleString('zh-TW')}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
