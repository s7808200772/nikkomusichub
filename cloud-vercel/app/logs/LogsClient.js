"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Terminal, RefreshCw, Download, Search } from 'lucide-react';

const TYPES = [
  { key: 'system', label: '系統' },
  { key: 'player', label: 'Player' },
  { key: 'sync', label: '同步' },
];

const PAGE_SIZE = 50;

function parseTimestamp(line) {
  const m = line.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/
  );
  return m ? m[1] : null;
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default function LogsClient({ initialStores, supabaseOk }) {
  const [stores] = useState(initialStores || []);
  const [selected, setSelected] = useState('');
  const [activeType, setActiveType] = useState('system');
  const [linesCount, setLinesCount] = useState(100);
  const [loading, setLoading] = useState(false);
  const [logsByType, setLogsByType] = useState({});
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  const [page, setPage] = useState(1);

  async function loadLog(type = activeType) {
    if (!supabaseOk || !selected) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?storeId=${selected}&type=${type}&lines=${linesCount}`);
      const data = await res.json();
      setLogsByType((prev) => ({
        ...prev,
        [`${selected}:${type}`]: {
          ok: data.ok,
          error: data.error,
          lines: data.data?.lines || '',
        },
      }));
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    setPage(1);
    loadLog();
  }

  useEffect(() => {
    if (selected) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, activeType, linesCount]);

  const entries = useMemo(() => {
    const cacheKey = `${selected}:${activeType}`;
    const raw = logsByType[cacheKey]?.lines || '';
    return raw
      .split('\n')
      .map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const ts = parseTimestamp(trimmed);
        const message = ts ? trimmed.replace(/^\S+\s*/, '') : trimmed;
        return {
          id: idx,
          type: activeType,
          timestamp: ts,
          message,
          raw: trimmed,
        };
      })
      .filter(Boolean)
      .reverse();
  }, [logsByType, selected, activeType]);

  const filtered = useMemo(() => {
    let list = entries;
    if (level === 'error') {
      list = list.filter((e) => /error|failed|失敗|異常|fail/i.test(e.raw));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.raw.toLowerCase().includes(q));
    }
    return list;
  }, [entries, level, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const errorCount = entries.filter((e) => /error|failed|失敗|異常|fail/i.test(e.raw)).length;

  const store = stores.find((s) => s.storeId === selected);
  const cache = logsByType[`${selected}:${activeType}`];

  function exportCsv() {
    const rows = filtered.map((e) => [e.type, e.timestamp || '-', e.message].map(escapeCsvCell).join(','));
    const csv = ['type,time,message', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected || 'logs'}_${activeType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="card">
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: '220px' }}>
            <label>店點</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">選擇店點</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>{s.storeName} ({s.storeId})</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ width: '120px' }}>
            <label>行數</label>
            <input type="number" min={10} max={500} value={linesCount} onChange={(e) => setLinesCount(Number(e.target.value))} />
          </div>
          <button className="primary" onClick={refresh} disabled={loading || !selected}>
            {loading ? <Loader2 size={16} className="spin" /> : <Terminal size={16} />} 載入 Log
          </button>
        </div>
      </div>

      {selected && cache && (
        <>
          {!cache.ok ? (
            <div className="card" style={{ color: 'var(--danger)' }}>
              載入失敗：{cache.error}
            </div>
          ) : (
            <>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: '1rem' }}>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{entries.length}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>總行數</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{errorCount}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>錯誤 / 失敗</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{activeType === 'system' ? '系統' : activeType === 'player' ? 'Player' : '同步'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>目前類型</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{store?.storeName || selected}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>店點</div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="log-toolbar">
                  <div className="log-tabs">
                    {TYPES.map((t) => (
                      <button
                        key={t.key}
                        className={`log-tab ${activeType === t.key ? 'active' : ''}`}
                        onClick={() => { setActiveType(t.key); setPage(1); }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="log-filters">
                    <div className="search-input">
                      <Search size={14} />
                      <input type="text" placeholder="搜尋訊息…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                    </div>
                    <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}>
                      <option value="all">全部等級</option>
                      <option value="error">ERROR / 失敗</option>
                    </select>
                    <button className="outline icon-left" onClick={exportCsv} title="將目前日誌匯出為 CSV">
                      <Download size={14} /> 輸出 CSV
                    </button>
                    <button className="outline" onClick={refresh} title="重新整理">
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="card log-table-wrap">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <FileText size={18} /> {store?.storeName || selected} · {activeType === 'system' ? '系統' : activeType === 'player' ? 'Player' : '同步'}
                </h2>
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <p>尚無紀錄</p>
                  </div>
                ) : (
                  <>
                    <table className="list-table">
                      <thead>
                        <tr>
                          <th className="dot-cell" style={{ width: '1%' }}></th>
                          <th style={{ width: '100px' }}>類型</th>
                          <th style={{ width: '180px' }}>時間</th>
                          <th>訊息</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageEntries.map((e) => {
                          const color = e.type === 'sync' ? 'warning' : e.type === 'player' ? 'info' : 'blue';
                          const dotColor = e.type === 'sync' ? 'var(--warning)' : e.type === 'player' ? 'var(--accent-2)' : 'var(--accent)';
                          return (
                            <tr key={e.id}>
                              <td className="dot-cell">
                                <span className="dot" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                              </td>
                              <td><span className={`badge badge-${color}`}>{e.type}</span></td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.timestamp || '-'}</td>
                              <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.85rem' }}>{e.message}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="log-footer">
                      <span>共 {filtered.length} 筆</span>
                      <div className="log-pagination">
                        {currentPage > 1 && (
                          <button className="btn-sm" onClick={() => setPage((p) => p - 1)}>‹</button>
                        )}
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((i) => i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1))
                          .map((i, idx, arr) => (
                            <React.Fragment key={i}>
                              {idx > 0 && i - arr[idx - 1] > 1 && <span style={{ color: 'var(--muted)' }}>…</span>}
                              <button className={`btn-sm ${i === currentPage ? 'primary' : ''}`} onClick={() => setPage(i)}>{i}</button>
                            </React.Fragment>
                          ))}
                        {currentPage < totalPages && (
                          <button className="btn-sm" onClick={() => setPage((p) => p + 1)}>›</button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
