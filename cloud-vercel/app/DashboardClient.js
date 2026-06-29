"use client";

import { useEffect, useState } from 'react';
import { Music, RefreshCw, Wifi, WifiOff, HelpCircle, Loader2, Store, CheckCircle2, AlertCircle, Bell } from 'lucide-react';
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
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
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
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>中央控制台</h2>
          <p style={{ margin: 0 }}>快速入口、最近批量任務與告警</p>
        </div>

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

        {alerts.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>最近告警</h3>
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
                  {alerts.slice(0, 5).map((a) => {
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

      <div className="card">
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>店點列表</h2>
          <p style={{ margin: 0 }}>每分鐘自動重新整理狀態</p>
        </div>
        {stores.length > 0 ? (
          <div className="list-table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th>店點</th>
                  <th>Broker</th>
                  <th>狀態</th>
                  <th>目前曲目</th>
                  <th>最後同步</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const st = status[s.storeId];
                  const dashboard = st?.parsed || st?.result || {};
                  const isOnline = st?.ok;
                  const isChecking = !st;
                  return (
                    <tr key={s.storeId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.storeName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{s.mqttBroker}</td>
                      <td>
                        {isChecking ? (
                          <span className="badge badge-gray"><Loader2 size={12} className="spin" /> 檢查中</span>
                        ) : isOnline ? (
                          <span className="badge badge-green"><Wifi size={12} /> 線上</span>
                        ) : (
                          <span className="badge badge-red"><WifiOff size={12} /> 異常</span>
                        )}
                        {!isOnline && st && (
                          <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{st.error || '狀態取得失敗'}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
                        <Music size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {dashboard?.current_track || '-'}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
                        <RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {dashboard?.last_sync_at || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <HelpCircle size={48} />
            <p>尚無店點，請到店點管理新增。</p>
          </div>
        )}
      </div>
    </>
  );
}
