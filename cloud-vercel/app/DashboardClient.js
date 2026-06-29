"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Wifi, WifiOff, Store, CheckCircle2, AlertCircle, Bell, Loader2 } from 'lucide-react';
import { loadLocalStores } from '@/lib/localStorage';
import { fetchWithTimeout, humanizeCommandError } from '@/lib/fetchUtils';

export default function DashboardClient({ initialStores, supabaseOk, children }) {
  const [stores, setStores] = useState(initialStores || []);
  const [status, setStatus] = useState({});
  const [jobs, setJobs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (store) => {
    if (!supabaseOk) {
      setStatus((prev) => ({
        ...prev,
        [store.storeId]: { ok: false, error: '需先設定 Supabase 才能執行遠端查詢' },
      }));
      return;
    }
    setStatus((prev) => ({ ...prev, [store.storeId]: { ...(prev[store.storeId] || {}), loading: true } }));
    const timeout = 25000;
    try {
      const res = await fetchWithTimeout('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.storeId, commandKey: 'status_dashboard', timeout }),
      }, timeout + 5000);
      const data = await res.json();
      setStatus((prev) => ({ ...prev, [store.storeId]: { ...data, loading: false } }));
    } catch (e) {
      setStatus((prev) => ({
        ...prev,
        [store.storeId]: { ok: false, error: humanizeCommandError(e.message, timeout), loading: false },
      }));
    }
  }, [supabaseOk]);

  const refreshAll = useCallback(async () => {
    if (!supabaseOk) return;
    setRefreshing(true);
    await Promise.all(stores.map((s) => fetchStatus(s)));
    setRefreshing(false);
  }, [stores, supabaseOk, fetchStatus]);

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
  }, [stores, supabaseOk, fetchStatus]);

  useEffect(() => {
    if (!supabaseOk) return;
    async function loadJobs() {
      try {
        const res = await fetch('/api/command/batch');
        const data = await res.json();
        setJobs(data.jobs || []);
      } catch {
        setJobs([]);
      }
    }
    loadJobs();
    const id = setInterval(loadJobs, 10000);
    return () => clearInterval(id);
  }, [supabaseOk]);

  useEffect(() => {
    if (!supabaseOk) return;
    async function loadAlerts() {
      try {
        const res = await fetch('/api/alerts');
        const data = await res.json();
        setAlerts(data.alerts || []);
      } catch {
        setAlerts([]);
      }
    }
    loadAlerts();
    const id = setInterval(loadAlerts, 30000);
    return () => clearInterval(id);
  }, [supabaseOk]);

  const online = Object.values(status).filter((s) => s.ok).length;
  const unackAlerts = alerts.filter((a) => !a.acknowledged_at);
  const latestAlerts = useMemo(() => {
    const byStore = {};
    alerts.forEach((a) => {
      const current = byStore[a.store_id];
      if (!current || new Date(a.created_at) > new Date(current.created_at)) {
        byStore[a.store_id] = a;
      }
    });
    return Object.values(byStore)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [alerts]);

  return (
    <>
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(37,99,235,0.1)', padding: '0.8rem', borderRadius: '0.8rem' }}>
              <Store size={24} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stores.length}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>總店數</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(22,163,74,0.1)', padding: '0.8rem', borderRadius: '0.8rem' }}>
              <Wifi size={24} color="var(--success)" />
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{online}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>線上</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(220,38,38,0.08)', padding: '0.8rem', borderRadius: '0.8rem' }}>
              <WifiOff size={24} color="var(--danger)" />
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stores.length - online}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>異常</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(217,119,6,0.1)', padding: '0.8rem', borderRadius: '0.8rem' }}>
              <Bell size={24} color="var(--warning)" />
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{unackAlerts.length}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>未確認告警</div>
            </div>
          </div>
        </div>
      </div>

      {children}

      <div className="card">
        <div className="page-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>中央控制台</h2>
            <p style={{ margin: 0 }}>快速入口、最近批量任務與告警</p>
          </div>
          {supabaseOk && (
            <button className="ghost" onClick={refreshAll} disabled={refreshing} title="重新整理所有店點狀態">
              {refreshing ? <Loader2 size={16} className="spin" /> : <Wifi size={16} />}
              {refreshing ? '更新中…' : '重新整理'}
            </button>
          )}
        </div>

        {refreshing && (
          <div className="refreshing-indicator" style={{ marginBottom: '0.75rem' }}>
            <Loader2 size={14} className="spin" /> 正在更新店點狀態…
          </div>
        )}

        {jobs.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>最近批量任務</h3>
            <div className="list-table-wrap">
              <table className="list-table">
                <thead>
                  <tr>
                    <th>指令</th>
                    <th>時間</th>
                    <th>成功</th>
                    <th>失敗</th>
                    <th>無回應</th>
                    <th>總計</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 5).map((job) => (
                    <tr key={job.id}>
                      <td>
                        {job.pending > 0 ? <Loader2 size={14} className="spin" color="var(--accent-2)" style={{ marginRight: 6, verticalAlign: 'middle' }} /> :
                         job.failed === 0 && job.noResponse === 0 ? <CheckCircle2 size={14} color="var(--success)" style={{ marginRight: 6, verticalAlign: 'middle' }} /> :
                         <AlertCircle size={14} color="var(--danger)" style={{ marginRight: 6, verticalAlign: 'middle' }} />}
                        {job.commandKey}
                      </td>
                      <td>{new Date(job.createdAt).toLocaleTimeString('zh-TW')}</td>
                      <td>{job.success}</td>
                      <td>{job.failed}</td>
                      <td>{job.noResponse}</td>
                      <td>{job.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {latestAlerts.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>最近告警（每店點最新一筆）</h3>
            <div className="list-table-wrap">
              <table className="list-table">
                <thead>
                  <tr>
                    <th>店點</th>
                    <th>類型</th>
                    <th>訊息</th>
                    <th>時間</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {latestAlerts.map((a) => {
                    const severityColor = a.severity === 'offline' || a.severity === 'critical' ? 'danger' : 'warning';
                    return (
                      <tr key={a.id}>
                        <td><strong>{a.store_id}</strong></td>
                        <td><span className="badge badge-gray">{a.type}</span></td>
                        <td>{a.message}</td>
                        <td>{new Date(a.created_at).toLocaleString('zh-TW')}</td>
                        <td>
                          {a.acknowledged_at ? (
                            <span className="badge badge-green">已確認</span>
                          ) : (
                            <span className={`badge badge-${severityColor}`}>未確認</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
