"use client";

import React, { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Loader2, Server, CheckSquare, Square, GitCommit } from 'lucide-react';

export default function OtaClient({ initialStores, supabaseOk }) {
  const [stores] = useState(initialStores || []);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [latestVersion, setLatestVersion] = useState(null);
  const [versions, setVersions] = useState({});

  useEffect(() => {
    fetch('https://api.github.com/repos/s7808200772/nikkomusichub/commits?sha=security-final&per_page=1')
      .then((r) => r.json())
      .then((data) => {
        const commit = Array.isArray(data) ? data[0] : null;
        if (commit?.sha) {
          setLatestVersion({
            sha: commit.sha.slice(0, 7),
            message: commit.commit?.message?.split('\n')[0] || '',
            date: commit.commit?.committer?.date || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseOk) {
      setVersions(Object.fromEntries(stores.map((s) => [s.storeId, { error: '需先設定 Supabase' }])));
      return;
    }
    stores.forEach(async (s) => {
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: s.storeId, commandKey: 'status_system' }),
        });
        const data = await res.json();
        const version = data.parsed?.version || data.parsed?.git_version || data.result?.version || data.result?.git_version || (data.ok ? '未知' : (data.error || '取得失敗'));
        setVersions((prev) => ({ ...prev, [s.storeId]: { ok: data.ok, value: version } }));
      } catch (e) {
        setVersions((prev) => ({ ...prev, [s.storeId]: { ok: false, value: e.message || '取得失敗' } }));
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

  async function runAction(action) {
    if (!supabaseOk || selected.size === 0) return;
    setLoading(true);
    setMsg('');
    const ids = Array.from(selected);
    const results = await Promise.all(
      ids.map(async (storeId) => {
        const res = await fetch('/api/ota', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, action }),
        });
        return { storeId, ...(await res.json()) };
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
              ) : (
                <span>正在取得 GitHub 最新版本…</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {stores.map((s) => {
              const v = versions[s.storeId];
              return (
                <label key={s.storeId} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', margin: 0 }}>
                  <input type="checkbox" checked={selected.has(s.storeId)} onChange={() => toggleSelect(s.storeId)} style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0, marginTop: '0.15rem' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.storeName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId}</div>
                    <div style={{ fontSize: '0.8rem', color: v?.ok === false ? 'var(--danger)' : 'var(--muted)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <GitCommit size={12} />
                      {v ? (v.ok ? `版本：${v.value}` : `版本取得失敗：${v.value}`) : '正在取得版本…'}
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
