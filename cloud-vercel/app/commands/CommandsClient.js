"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, RefreshCw, FolderSearch, RotateCcw, Power,
  Activity, Cpu, Music2, Terminal, Server, Wifi, WifiOff, Loader2,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Search
} from 'lucide-react';
import ResponseFormatter from '@/components/ResponseFormatter';
import { fetchWithTimeout, humanizeCommandError } from '@/lib/fetchUtils';
import { saveLocalJobs } from '@/lib/localStorage';

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h2 style={{ color: 'var(--danger)', margin: '0 0 0.5rem' }}>指令控制台發生錯誤</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            請重新整理頁面。若問題持續，請回報以下訊息：
          </p>
          <pre style={{ marginTop: '0.75rem', fontSize: '0.8rem', background: 'var(--bg-2)', padding: '0.75rem', borderRadius: '0.5rem' }}>
            {this.state.error?.message || '未知錯誤'}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const CATEGORIES = [
  {
    key: 'playback',
    label: '音樂播放',
    color: 'var(--success)',
    commands: [
      { key: 'player_play', label: '播放 / 繼續', icon: Play },
      { key: 'player_pause', label: '暫停', icon: Pause },
      { key: 'player_previous', label: '上一首', icon: SkipBack },
      { key: 'player_next', label: '下一首', icon: SkipForward },
      { key: 'status_player', label: '播放狀態', icon: Music2 },
    ],
  },
  {
    key: 'system',
    label: '系統狀態',
    color: 'var(--accent-2)',
    commands: [
      { key: 'status_dashboard', label: '儀表板', icon: Activity },
      { key: 'status_system', label: '系統資訊', icon: Cpu },
    ],
  },
  {
    key: 'sync',
    label: '同步與掃描',
    color: 'var(--accent)',
    commands: [
      { key: 'sync', label: '同步 NAS WebDAV', icon: RefreshCw },
      { key: 'rescan', label: '重新掃描', icon: FolderSearch },
    ],
  },
  {
    key: 'control',
    label: '服務控制',
    color: 'var(--warning)',
    commands: [
      { key: 'restart_player', label: '重啟播放服務', icon: RotateCcw },
      { key: 'reboot', label: '重開機', icon: Power },
    ],
  },
];

const ALL_COMMANDS = CATEGORIES.flatMap((c) => c.commands);
const DANGEROUS_COMMANDS = new Set(['reboot', 'restart_player', 'sync', 'ota_update', 'rollback', 'network_watchdog_install', 'network_watchdog_disable']);
const LONG_COMMANDS = new Set(['sync', 'reboot', 'restart_player', 'rescan', 'ota_update', 'rollback']);

function getCommandLabel(key) {
  return ALL_COMMANDS.find((c) => c.key === key)?.label || key;
}

function commandTimeout(commandKey) {
  if (commandKey === 'network_watchdog_install') return 120000;
  if (commandKey === 'get_log') return 15000;
  if (LONG_COMMANDS.has(commandKey)) return 60000;
  if (commandKey.startsWith('status_')) return 25000;
  return 30000;
}

function confirmDangerous(commandKey, target) {
  const label = getCommandLabel(commandKey);
  return confirm(`確定要對 ${target} 執行「${label}」嗎？此操作可能影響店點運行。`);
}

function statusTooltip(st) {
  if (!st) return '尚未取得狀態';
  if (st.loading) return '正在取得狀態…';
  if (st.ok) return '狀態正常';
  return st.error || '狀態取得失敗';
}

export default function CommandsClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [results, setResults] = useState({});
  const [status, setStatus] = useState({});
  const [expanded, setExpanded] = useState({});
  const [runningAll, setRunningAll] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [batchJob, setBatchJob] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    setStores(initialStores || []);
  }, [initialStores]);

  const fetchStatus = useCallback(async (storeId) => {
    if (!supabaseOk) return;
    setStatus((prev) => ({ ...prev, [storeId]: { ...(prev[storeId] || {}), loading: true } }));
    const timeout = 25000;
    try {
      const res = await fetchWithTimeout('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, commandKey: 'status_dashboard', timeout }),
      }, timeout + 5000);
      const data = await res.json();
      setStatus((prev) => ({ ...prev, [storeId]: { ...data, loading: false } }));
    } catch (e) {
      setStatus((prev) => ({
        ...prev,
        [storeId]: { ok: false, error: humanizeCommandError(e.message, timeout), loading: false },
      }));
    }
  }, [supabaseOk]);

  useEffect(() => {
    if (!supabaseOk) return;
    stores.forEach((s) => fetchStatus(s.storeId));
    const id = setInterval(() => {
      stores.forEach((s) => fetchStatus(s.storeId));
    }, 60000);
    return () => clearInterval(id);
  }, [stores, supabaseOk, fetchStatus]);

  async function runForStore(storeId, commandKey) {
    if (!supabaseOk) {
      setResults((prev) => ({
        ...prev,
        [storeId]: {
          ...(prev[storeId] || {}),
          [commandKey]: { ok: false, error: '需先設定 Supabase 才能執行遠端指令', loading: false },
        },
      }));
      return { ok: false };
    }
    if (DANGEROUS_COMMANDS.has(commandKey) && !confirmDangerous(commandKey, storeId)) {
      return { ok: false };
    }
    setResults((prev) => ({
      ...prev,
      [storeId]: { ...(prev[storeId] || {}), [commandKey]: { loading: true } },
    }));
    const timeout = commandTimeout(commandKey);
    try {
      const res = await fetchWithTimeout('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, commandKey, timeout }),
      }, timeout + 10000);
      const data = await res.json();
      const humanError = data.ok ? null : humanizeCommandError(data.error, timeout);
      setResults((prev) => ({
        ...prev,
        [storeId]: { ...(prev[storeId] || {}), [commandKey]: { ...data, error: humanError || data.error, loading: false } },
      }));
      setExpanded((prev) => ({ ...prev, [storeId]: true }));
      return data;
    } catch (e) {
      const humanError = humanizeCommandError(e.message, timeout);
      setResults((prev) => ({
        ...prev,
        [storeId]: { ...(prev[storeId] || {}), [commandKey]: { ok: false, error: humanError, loading: false } },
      }));
      setExpanded((prev) => ({ ...prev, [storeId]: true }));
      return { ok: false, error: humanError };
    }
  }

  async function runForAll(commandKey) {
    setRunningAll(commandKey);
    await Promise.all(stores.map((s) => runForStore(s.storeId, commandKey)));
    setRunningAll(null);
  }

  function toggleExpand(storeId) {
    setExpanded((prev) => ({ ...prev, [storeId]: !prev[storeId] }));
  }

  function lastResult(storeId) {
    const map = results[storeId] || {};
    const keys = Object.keys(map);
    if (!keys.length) return null;
    const lastKey = keys[keys.length - 1];
    return { key: lastKey, ...map[lastKey] };
  }

  function syncRecentJob(job) {
    if (!job || !job.id) return;
    saveLocalJobs([job]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nikko-recent-jobs-updated', { detail: job }));
    }
  }

  function toggleSelect(storeId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.storeId)));
    }
  }

  async function runBatch(commandKey) {
    if (!supabaseOk || selected.size === 0) return;
    if (DANGEROUS_COMMANDS.has(commandKey) && !confirmDangerous(commandKey, `${selected.size} 個店點`)) {
      return;
    }
    setBatchLoading(true);
    try {
      const res = await fetchWithTimeout('/api/command/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeIds: Array.from(selected), commandKey }),
      }, 30000);
      const data = await res.json();
      if (data.jobId) {
        const pendingStores = Array.from(selected).map((storeId) => ({
          storeId,
          status: 'pending',
          result: null,
          error: null,
        }));
        const initialJob = { id: data.jobId, polling: true, commandKey, stores: pendingStores, success: 0, failed: 0, noResponse: 0, pending: selected.size, total: selected.size, createdAt: Date.now(), updatedAt: Date.now() };
        setBatchJob(initialJob);
        syncRecentJob(initialJob);
        pollJob(data.jobId);
      } else {
        setBatchLoading(false);
        window.alert('批次指令啟動失敗：' + (data.error || '未知錯誤'));
      }
    } catch (e) {
      setBatchLoading(false);
      window.alert('批次指令啟動失敗：' + e.message);
    }
  }

  async function pollJob(jobId) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/command/batch?jobId=${jobId}`);
        const data = await res.json();
        if (data.job) {
          setBatchJob(data.job);
          syncRecentJob(data.job);
          if (data.job.pending === 0) {
            clearInterval(interval);
            setBatchLoading(false);
          }
        }
      } catch {
        clearInterval(interval);
        setBatchLoading(false);
      }
    }, 2000);
  }

  async function retryFailed() {
    if (!batchJob || batchLoading) return;
    const retryIds = batchJob.stores
      .filter((s) => s.status === 'failed' || s.status === 'no_response')
      .map((s) => s.storeId);
    if (retryIds.length === 0) return;
    setSelected(new Set(retryIds));
    await runBatch(batchJob.commandKey);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.storeId.toLowerCase().includes(q) ||
        s.storeName.toLowerCase().includes(q) ||
        s.mqttBroker.toLowerCase().includes(q)
    );
  }, [stores, search]);

  function renderButtonState(r) {
    if (!r) return null;
    if (r.loading) return <Loader2 size={16} className="spin" />;
    if (r.ok) return <CheckCircle2 size={16} />;
    if (r.error) return <AlertCircle size={16} />;
    return null;
  }

  return (
    <PageErrorBoundary>
    <>
      {batchJob && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.3rem' }}>批次任務：{getCommandLabel(batchJob.commandKey)}（已對 {batchJob.total || batchJob.stores?.length || 0} 間店發送）</h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                成功 {batchJob.success} / 失敗 {batchJob.failed} / 無回應 {batchJob.noResponse} / 待處理 {batchJob.pending}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ghost" onClick={retryFailed} disabled={batchLoading || batchJob.pending > 0} title="重試失敗或無回應的店點">
                <RotateCcw size={14} /> 重試失敗/無回應
              </button>
              <button className="ghost" onClick={() => setBatchJob(null)} title="關閉批次任務">關閉</button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}>
            {(batchJob.stores || []).map((s) => (
              <div key={s.storeId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                {s.status === 'success' ? <CheckCircle2 size={14} color="var(--success)" /> :
                 s.status === 'failed' ? <AlertCircle size={14} color="var(--danger)" /> :
                 s.status === 'no_response' ? <WifiOff size={14} color="var(--warning)" /> :
                 <Loader2 size={14} className="spin" color="var(--accent-2)" />}
                <span>{s.storeId}</span>
                <span style={{ color: 'var(--muted)', wordBreak: 'break-word' }}>{s.error || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Terminal size={20} color="var(--accent-2)" /> 店點指令控制台
            <span className="badge badge-gray">{filtered.length} / {stores.length}</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {ALL_COMMANDS.filter((c) => ['player_play', 'player_pause', 'player_next', 'sync'].includes(c.key)).map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    className="primary icon-btn"
                    onClick={() => runBatch(c.key)}
                    disabled={!supabaseOk || batchLoading || selected.size === 0}
                    title={`對選取店點執行：${c.label}`}
                  >
                    {batchLoading ? <Loader2 size={18} className="spin" /> : <Icon size={18} />}
                  </button>
                );
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={selectAll} title="全選/取消全選目前篩選的店點" />
              全選
            </label>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索 Store ID、店名、Broker"
                style={{ paddingLeft: '2.4rem', marginBottom: 0 }}
              />
            </div>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="list-table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th style={{ width: '1%', whiteSpace: 'nowrap', minWidth: '4.5em' }}>選取</th>
                  <th>店點</th>
                  <th style={{ width: '1%', whiteSpace: 'nowrap' }}>狀態</th>
                  <th>音樂播放</th>
                  <th>系統狀態</th>
                  <th>同步掃描</th>
                  <th>服務控制</th>
                  <th style={{ width: '1%', whiteSpace: 'nowrap' }}>輸出</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const st = status[s.storeId];
                  const last = lastResult(s.storeId);
                  return (
                    <React.Fragment key={s.storeId}>
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(s.storeId)}
                            onChange={() => toggleSelect(s.storeId)}
                            title="加入批量選取"
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Server size={18} color="var(--accent-2)" />
                            <div>
                              <div style={{ fontWeight: 600 }}>{s.storeName}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId} · {s.mqttBroker}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <button
                            className={`ghost icon-btn ${st?.loading ? 'loading' : ''}`}
                            onClick={() => fetchStatus(s.storeId)}
                            disabled={st?.loading}
                            title={statusTooltip(st)}
                            style={{ color: st?.ok ? 'var(--success)' : st ? 'var(--danger)' : 'var(--muted)' }}
                          >
                            {st?.loading ? <Loader2 size={16} className="spin" /> : st?.ok ? <Wifi size={16} /> : <WifiOff size={16} />}
                          </button>
                        </td>
                        {CATEGORIES.map((cat) => (
                          <td key={cat.key}>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {cat.commands.map((c) => {
                                const Icon = c.icon;
                                const r = results[s.storeId]?.[c.key];
                                const loading = r?.loading;
                                const isSuccess = r && !loading && r.ok;
                                const isError = r && !loading && !r.ok;
                                return (
                                  <button
                                    key={c.key}
                                    className={`ghost icon-btn ${isSuccess ? 'success' : ''} ${isError ? 'error' : ''} ${loading ? 'loading' : ''}`}
                                    title={c.label}
                                    onClick={() => runForStore(s.storeId, c.key)}
                                    disabled={!supabaseOk || loading}
                                    style={{ borderColor: 'var(--border)', color: isSuccess || isError ? undefined : cat.color }}
                                  >
                                    {renderButtonState(r) || <Icon size={16} />}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        ))}
                        <td>
                          <button className="ghost icon-btn" onClick={() => toggleExpand(s.storeId)} title="展開/收合指令輸出">
                            {expanded[s.storeId] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expanded[s.storeId] && (
                        <tr>
                          <td colSpan={8} style={{ background: 'var(--bg-2)', padding: 0 }}>
                            <div className="log-output" style={{ maxHeight: 'none', margin: '0.75rem', border: 'none', background: 'transparent' }}>
                              {last ? (
                                <ResponseFormatter
                                  commandKey={last.key}
                                  data={last.result ?? last.parsed ?? null}
                                  error={last.error}
                                />
                              ) : '尚未執行指令'}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Terminal size={48} />
            <p>{search ? '沒有符合搜索條件的店點' : '尚無店點，請先到 Stores 新增。'}</p>
          </div>
        )}
      </div>
    </>
    </PageErrorBoundary>
  );
}
