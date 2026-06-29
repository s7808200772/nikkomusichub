"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, RotateCcw, Loader2, Server, CheckSquare, Square, GitCommit, AlertCircle } from 'lucide-react';
import { loadLocalStores } from '@/lib/localStorage';
import { fetchWithTimeout, humanizeCommandError } from '@/lib/fetchUtils';

const STORES_CHANGED_EVENT = 'nikko-stores-changed';

function isUnknown(value) {
  if (!value) return true;
  const text = String(value).toLowerCase().trim();
  return text === '' || text === 'unknown' || text === '未知' || text === 'n/a' || text === 'none';
}

function formatVersion(data) {
  if (!data) {
    return { value: '尚未取得版本', ok: false, help: 'Pi 未回報版本資訊' };
  }
  if (data.ok === false) {
    return { value: humanizeCommandError(data.error, 25000), ok: false };
  }
  const parsed = data.parsed || data.result || {};

  // Handle git object: { commit, branch }
  if (parsed.git && typeof parsed.git === 'object') {
    const commit = String(parsed.git.commit || '').trim();
    const branch = String(parsed.git.branch || '').trim();
    const shortCommit = commit.length > 7 ? commit.slice(0, 7) : commit;
    if (!isUnknown(commit)) {
      if (!isUnknown(branch)) return { value: `${shortCommit} (${branch})`, ok: true };
      return { value: shortCommit, ok: true };
    }
  }

  // Handle git as string (fallback)
  if (parsed.git && typeof parsed.git === 'string' && !isUnknown(parsed.git)) {
    const text = parsed.git.trim();
    return { value: text.length > 7 ? text.slice(0, 7) : text, ok: true };
  }

  // Generic version fields
  const candidates = [parsed.version, parsed.git_version, parsed.git_commit, parsed.commit, parsed.sha, parsed.ref].filter(Boolean);
  for (const candidate of candidates) {
    const text = String(candidate).trim();
    if (!isUnknown(text)) {
      return { value: text.length > 7 ? text.slice(0, 7) : text, ok: true };
    }
  }

  return { value: '無法取得', ok: false, help: 'Pi 未回報版本資訊，請確認 Pi 端已上線且狀態正常' };
}

export default function OtaClient({ initialStores, supabaseOk }) {
  const [stores, setStores] = useState(initialStores || []);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [latestVersion, setLatestVersion] = useState(null);
  const [versions, setVersions] = useState({});
  const [versionError, setVersionError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refreshStores = useCallback(async () => {
    setRefreshing(true);
    if (!supabaseOk) {
      if (typeof window !== 'undefined') {
        setStores(loadLocalStores() || initialStores || []);
      }
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetch('/api/stores', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setStores(data.stores || []);
    } catch {
      // keep existing stores on error
    } finally {
      setRefreshing(false);
    }
  }, [supabaseOk, initialStores]);

  useEffect(() => {
    refreshStores();
  }, [refreshStores]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshStores();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(STORES_CHANGED_EVENT, refreshStores);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(STORES_CHANGED_EVENT, refreshStores);
    };
  }, [refreshStores]);

  useEffect(() => {
    setVersionError('');
    fetch('/api/github-version')
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        if (data?.sha) {
          setLatestVersion({
            sha: data.shortSha || data.sha.slice(0, 7),
            message: data.message || '',
            date: data.date || '',
          });
        }
      })
      .catch((e) => {
        setVersionError(e.message || '取得 GitHub 版本失敗');
      });
  }, []);

  useEffect(() => {
    const currentIds = new Set(stores.map((s) => s.storeId));
    setVersions((prev) => {
      const next = {};
      for (const id of currentIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });
  }, [stores.map((s) => s.storeId).join(',')]);

  useEffect(() => {
    if (!supabaseOk) {
      setVersions(Object.fromEntries(stores.map((s) => [s.storeId, { error: '需先設定 Supabase' }])));
      return;
    }
    const timeout = 25000;
    stores.forEach(async (s) => {
      try {
        setVersions((prev) => ({ ...prev, [s.storeId]: { loading: true } }));
        const res = await fetchWithTimeout('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: s.storeId, commandKey: 'status_system', timeout }),
        }, timeout + 5000);
        const data = await res.json();
        const formatted = formatVersion(data);
        setVersions((prev) => ({ ...prev, [s.storeId]: { ...formatted, loading: false } }));
      } catch (e) {
        setVersions((prev) => ({
          ...prev,
          [s.storeId]: { ok: false, value: humanizeCommandError(e.message, timeout), loading: false },
        }));
      }
    });
  }, [stores, supabaseOk]);

  const allSelected = stores.length > 0 && selected.size === stores.length;

  function toggleSelect(storeId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  function selectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(stores.map((s) => s.storeId)));
    }
  }

  async function pollJob(jobId, maxWaitMs = 180000, intervalMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const res = await fetch(`/api/ota?jobId=${encodeURIComponent(jobId)}`);
        const data = await res.json();
        const job = data.job;
        if (!job) return { ok: false, error: 'Job not found' };
        const store = job.stores?.[0];
        if (store && store.status !== 'pending') {
          return { ok: store.status === 'success', error: store.error, job };
        }
      } catch (e) {
        return { ok: false, error: e.message || 'Polling failed' };
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return { ok: false, error: 'Polling timed out' };
  }

  async function runAction(action) {
    if (!supabaseOk || selected.size === 0) return;
    if (!confirm(`確定要對 ${selected.size} 家店點執行 ${action === 'ota_update' ? 'OTA 更新' : 'Rollback'} 嗎？`)) return;
    setLoading(true);
    setMsg('');
    const ids = Array.from(selected);
    const jobs = await Promise.all(
      ids.map(async (storeId) => {
        const res = await fetch('/api/ota', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, action }),
        });
        return { storeId, ...(await res.json()) };
      })
    );

    const results = await Promise.all(
      jobs.map(async ({ storeId, jobId, error }) => {
        if (error) return { storeId, ok: false, error };
        if (!jobId) return { storeId, ok: false, error: 'No jobId returned' };
        return { storeId, ...(await pollJob(jobId)) };
      })
    );

    setLoading(false);
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      setMsg(`已對 ${ids.length} 家店點發送 ${action} 指令`);
    } else {
      setMsg(`部分失敗：${failed.map((r) => `${r.storeId} ${r.error || ''}`).join('；')}`);
    }
  }

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.3rem' }}>OTA 批次更新</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>已選取 <strong>{selected.size}</strong> 家店點。OTA 會讓各店的 Pi 端執行 git pull、pip install 並重啟服務。</p>
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              <GitCommit size={14} />
              {latestVersion ? (
                <span>GitHub 最新版本：<strong style={{ color: 'var(--text)' }}>{latestVersion.sha}</strong> {latestVersion.message} {latestVersion.date && `(${new Date(latestVersion.date).toLocaleDateString('zh-TW')})`}</span>
              ) : versionError ? (
                <span style={{ color: 'var(--danger)' }}>取得 GitHub 版本失敗：{versionError}</span>
              ) : (
                <span>正在取得 GitHub 最新版本…</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="ghost" onClick={refreshStores} disabled={refreshing} title="重新整理店點列表">
              {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              重新整理
            </button>
            <button className="ghost" onClick={selectAll} disabled={stores.length === 0} title="全選/取消全選店點">
              {allSelected ? <><Square size={14} /> 取消全選</> : <><CheckSquare size={14} /> 全選</>}
            </button>
            <button className="primary" onClick={() => runAction('ota_update')} disabled={loading || selected.size === 0} title="對選取店點執行 OTA 更新">
              {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} OTA 更新
            </button>
            <button className="danger" onClick={() => runAction('rollback')} disabled={loading || selected.size === 0} title="對選取店點執行 Rollback">
              {loading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} Rollback
            </button>
          </div>
        </div>
        {msg && (
          <div style={{ marginTop: '0.75rem', color: msg.startsWith('部分失敗') ? 'var(--danger)' : 'var(--success)', fontSize: '0.9rem' }}>
            {msg}
          </div>
        )}
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          OTA 會在背景執行；Rollback 會回到該店上次 OTA 前的 git tag。更新紀錄請到「監控紀錄 → OTA 紀錄」查看。
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem' }}>選擇店點</h2>
        {stores.length === 0 ? (
          <div className="empty-state">
            <Server size={48} />
            <p>尚無店點</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {stores.map((s) => {
              const v = versions[s.storeId];
              return (
                <label key={s.storeId} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.9rem', margin: 0 }}>
                  <input type="checkbox" checked={selected.has(s.storeId)} onChange={() => toggleSelect(s.storeId)} style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0, marginTop: '0.15rem' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.storeName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId}</div>
                    <div style={{ fontSize: '0.8rem', color: v?.ok === false ? 'var(--danger)' : 'var(--muted)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <GitCommit size={12} />
                      {v?.loading ? (
                        <><Loader2 size={12} className="spin" /> 正在取得版本…</>
                      ) : v ? (
                        v.ok ? `版本：${v.value}` : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                            <AlertCircle size={12} />
                            {v.help ? `${v.value} · ${v.help}` : v.value}
                          </span>
                        )
                      ) : '尚未取得版本'}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
