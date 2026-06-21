"use client";

import { useEffect, useState, useMemo } from 'react';
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
      { key: 'sync', label: '同步 Dropbox', icon: RefreshCw },
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

export default function CommandsClient({ initialStores }) {
  const [stores, setStores] = useState(initialStores || []);
  const [results, setResults] = useState({});
  const [expanded, setExpanded] = useState({});
  const [runningAll, setRunningAll] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setStores(initialStores || []);
  }, [initialStores]);

  async function runForStore(storeId, commandKey) {
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
            <h2 style={{ margin: '0 0 0.3rem' }}>全域指令</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>點擊按鈕對「所有店點」同時執行</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {ALL_COMMANDS.filter((c) => ['player_play', 'player_pause', 'player_next', 'sync'].includes(c.key)).map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  className="primary"
                  onClick={() => runForAll(c.key)}
                  disabled={runningAll === c.key}
                  title={c.label}
                  style={{ minWidth: '2.8rem', height: '2.4rem', padding: 0 }}
                >
                  {runningAll === c.key ? <Loader2 size={18} className="spin" /> : <Icon size={18} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Terminal size={20} color="var(--accent-2)" /> 店點指令
            <span className="badge badge-gray">{filtered.length} / {stores.length}</span>
          </h2>
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

      <div className="store-grid">
        {filtered.map((s) => {
          const last = lastResult(s.storeId);
          return (
            <div key={s.storeId} className="store-card">
              <div className="store-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <div style={{ background: 'rgba(14,165,233,0.12)', padding: '0.6rem', borderRadius: '0.7rem' }}>
                    <Server size={20} color="var(--accent-2)" />
                  </div>
                  <div>
                    <div className="store-card-title">{s.storeName}</div>
                    <div className="store-card-meta">{s.storeId} · {s.mqttBroker}</div>
                  </div>
                </div>
                {last?.loading ? (
                  <Loader2 size={18} className="spin" color="var(--accent-2)" />
                ) : last?.ok ? (
                  <CheckCircle2 size={18} color="var(--success)" />
                ) : last ? (
                  <AlertCircle size={18} color="var(--danger)" />
                ) : (
                  <Wifi size={18} color="var(--muted)" />
                )}
              </div>

              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {CATEGORIES.map((cat) => (
                  <div key={cat.key}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      {cat.label}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {cat.commands.map((c) => {
                        const Icon = c.icon;
                        const loading = results[s.storeId]?.[c.key]?.loading;
                        return (
                          <button
                            key={c.key}
                            className="ghost icon-btn"
                            title={c.label}
                            onClick={() => runForStore(s.storeId, c.key)}
                            disabled={loading}
                            style={{ borderColor: 'rgba(255,255,255,0.06)', color: cat.color }}
                          >
                            {loading ? <Loader2 size={16} className="spin" /> : <Icon size={16} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {last && (
                <div style={{ fontSize: '0.85rem', color: last.ok ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {last.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {last.error || '最後指令成功'}
                </div>
              )}

              <button className="ghost" onClick={() => toggleExpand(s.storeId)} style={{ width: '100%', fontSize: '0.85rem' }}>
                {expanded[s.storeId] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {expanded[s.storeId] ? '收合輸出' : '展開輸出'}
              </button>

              {expanded[s.storeId] && (
                <div className="log-output" style={{ maxHeight: '200px' }}>
                  {last ? (
                    JSON.stringify(last.parsed || last.result || {}, null, 2)
                  ) : (
                    '尚未執行指令'
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <Terminal size={48} />
          <p>{search ? '沒有符合搜索條件的店點' : '尚無店點，請先到 Stores 新增。'}</p>
        </div>
      )}
    </>
  );
}
