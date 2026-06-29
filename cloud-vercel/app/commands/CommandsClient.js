"use client";

import React, { useEffect, useState, useMemo } from 'react';
import {
  Play, Pause, SkipForward, RefreshCw, FolderSearch, RotateCcw, Power,
  Activity, Cpu, Music2, Terminal, Server, Wifi, WifiOff, Loader2,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Search
} from 'lucide-react';

const CATEGORIES = [
  {
    key: 'playback',
    label: '音樂播放',
    color: '#22c55e',
    commands: [
      { key: 'player_play', label: '播放', icon: Play },
      { key: 'player_pause', label: '暫停', icon: Pause },
      { key: 'player_resume', label: '繼續', icon: Play },
      { key: 'player_next', label: '下一首', icon: SkipForward },
      { key: 'status_player', label: '播放狀態', icon: Music2 },
    ],
  },
  {
    key: 'system',
    label: '系統狀態',
    color: '#a78bfa',
    commands: [
      { key: 'status_dashboard', label: 'Dashboard', icon: Activity },
      { key: 'status_system', label: '系統資訊', icon: Cpu },
    ],
  },
  {
    key: 'sync',
    label: '同步與掃描',
    color: '#0ea5e9',
    commands: [
      { key: 'sync', label: '同步 NAS WebDAV', icon: RefreshCw },
      { key: 'rescan', label: '重新掃描', icon: FolderSearch },
    ],
  },
  {
    key: 'control',
    label: '服務控制',
    color: '#f59e0b',
    commands: [
      { key: 'restart_player', label: '重啟播放服務', icon: RotateCcw },
      { key: 'reboot', label: '重開機', icon: Power },
    ],
  },
];

const ALL_COMMANDS = CATEGORIES.flatMap((c) => c.commands);

export default function CommandsClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [results, setResults] = useState({});
  const [expanded, setExpanded] = useState({});
  const [runningAll, setRunningAll] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [batchJob, setBatchJob] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    setStores(initialStores || []);
  }, [initialStores]);

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
    setResults((prev) => ({
      ...prev,
      [storeId]: { ...(prev[storeId] || {}), [commandKey]: { loading: true } },
    }));
    const res = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, commandKey }),
    });
    const data = await res.json();
    setResults((prev) => ({
      ...prev,
      [storeId]: { ...(prev[storeId] || {}), [commandKey]: { ...data, loading: false } },
    }));
    return data;
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
    setBatchLoading(true);
    const res = await fetch('/api/command/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeIds: Array.from(selected), commandKey }),
    });
    const data = await res.json();
    setBatchLoading(false);
    if (data.jobId) {
      setBatchJob({ id: data.jobId, polling: true });
      pollJob(data.jobId);
    }
  }

  async function pollJob(jobId) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/command/batch?jobId=${jobId}`);
      const data = await res.json();
      if (data.job) {
        setBatchJob(data.job);
        if (data.job.pending === 0) {
          clearInterval(interval);
        }
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

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.3rem' }}>批量指令</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              已選取 <strong>{selected.size}</strong> 家店點
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {ALL_COMMANDS.filter((c) => ['player_play', 'player_pause', 'player_next', 'sync'].includes(c.key)).map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  className="primary"
                  onClick={() => runBatch(c.key)}
                  disabled={!supabaseOk || batchLoading || selected.size === 0}
                  title={`對選取店點執行：${c.label}`}
                  style={{ minWidth: '2.8rem', height: '2.4rem', padding: 0 }}
                >
                  {batchLoading ? <Loader2 size={18} className="spin" /> : <Icon size={18} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {batchJob && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.3rem' }}>批次任務：{batchJob.commandKey}</h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                成功 {batchJob.success} / 失敗 {batchJob.failed} / 無回應 {batchJob.noResponse} / 待處理 {batchJob.pending}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="ghost" onClick={retryFailed} disabled={batchLoading || batchJob.pending > 0}>
                <RotateCcw size={14} /> 重試失敗/無回應
              </button>
              <button className="ghost" onClick={() => setBatchJob(null)}>關閉</button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}>
            {batchJob.stores.map((s) => (
              <div key={s.storeId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                {s.status === 'success' ? <CheckCircle2 size={14} color="var(--success)" /> :
                 s.status === 'failed' ? <AlertCircle size={14} color="var(--danger)" /> :
                 s.status === 'no_response' ? <WifiOff size={14} color="var(--warning)" /> :
                 <Loader2 size={14} className="spin" color="var(--accent-2)" />}
                <span>{s.storeId}</span>
                <span style={{ color: 'var(--muted)' }}>{s.error || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Terminal size={20} color="var(--accent-2)" /> 店點指令
            <span className="badge badge-gray">{filtered.length} / {stores.length}</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={selectAll} />
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
                  <th style={{ width: '1%' }}>選取</th>
                  <th>店點</th>
                  <th>最後結果</th>
                  <th>音樂播放</th>
                  <th>系統狀態</th>
                  <th>同步掃描</th>
                  <th>服務控制</th>
                  <th style={{ width: '1%' }}>輸出</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
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
                          {last?.loading ? (
                            <Loader2 size={16} className="spin" color="var(--accent-2)" />
                          ) : last?.ok ? (
                            <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}><CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />成功</span>
                          ) : last ? (
                            <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}><AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{last.error || '失敗'}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}><Wifi size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />未執行</span>
                          )}
                        </td>
                        {CATEGORIES.map((cat) => (
                          <td key={cat.key}>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {cat.commands.map((c) => {
                                const Icon = c.icon;
                                const loading = results[s.storeId]?.[c.key]?.loading;
                                return (
                                  <button
                                    key={c.key}
                                    className="ghost icon-btn"
                                    title={c.label}
                                    onClick={() => runForStore(s.storeId, c.key)}
                                    disabled={!supabaseOk || loading}
                                    style={{ borderColor: 'rgba(255,255,255,0.06)', color: cat.color }}
                                  >
                                    {loading ? <Loader2 size={16} className="spin" /> : <Icon size={16} />}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        ))}
                        <td>
                          <button className="ghost icon-btn" onClick={() => toggleExpand(s.storeId)} title="展開/收合輸出">
                            {expanded[s.storeId] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expanded[s.storeId] && (
                        <tr>
                          <td colSpan={8} style={{ background: 'var(--bg-2)', padding: 0 }}>
                            <div className="log-output" style={{ maxHeight: '200px', margin: '0.75rem', border: 'none' }}>
                              {last ? JSON.stringify(last.parsed || last.result || {}, null, 2) : '尚未執行指令'}
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
  );
}
