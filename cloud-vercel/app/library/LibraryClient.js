"use client";

import React, { useEffect, useState } from 'react';
import { Music, RefreshCw, Loader2, AlertCircle, Server, HardDrive, Save, Eye, EyeOff } from 'lucide-react';
import { loadLocalSettings, saveLocalSettings } from '@/lib/localStorage';

const NAS_KEY = 'nikko_nas_files';
const NAS_TS_KEY = 'nikko_nas_files_ts';

const DEFAULT_NAS = {
  webdavUrl: 'http://100.106.208.65:5005/',
  webdavRemotePath: '/NikkoMusic',
  webdavUsername: '',
  webdavPassword: '',
};

function loadNasFiles() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NAS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNasFiles(files) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NAS_KEY, JSON.stringify(files));
    localStorage.setItem(NAS_TS_KEY, new Date().toISOString());
  } catch {}
}

function loadNasTs() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(NAS_TS_KEY);
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrap">
      <input
        type={show ? 'text' : 'password'}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        style={{ marginBottom: 0 }}
      />
      <button
        type="button"
        className="eye-btn icon-btn"
        onClick={() => setShow((s) => !s)}
        title={show ? '隱藏密碼' : '顯示密碼'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function LibraryClient({ initialStores, initialSettings, supabaseOk }) {
  const [stores] = useState(initialStores || []);
  const [selected, setSelected] = useState(new Set());
  const [files, setFiles] = useState(loadNasFiles);
  const [lastTs, setLastTs] = useState(loadNasTs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchJob, setBatchJob] = useState(null);
  const [config, setConfig] = useState({
    webdavUrl: initialSettings?.webdavUrl || DEFAULT_NAS.webdavUrl,
    webdavRemotePath: initialSettings?.webdavRemotePath || DEFAULT_NAS.webdavRemotePath,
    webdavUsername: initialSettings?.webdavUsername || DEFAULT_NAS.webdavUsername,
    webdavPassword: initialSettings?.webdavPassword || DEFAULT_NAS.webdavPassword,
  });
  const [configMsg, setConfigMsg] = useState('');

  useEffect(() => {
    if (!supabaseOk && typeof window !== 'undefined') {
      const local = loadLocalSettings();
      setConfig({
        webdavUrl: initialSettings?.webdavUrl || local?.webdavUrl || DEFAULT_NAS.webdavUrl,
        webdavRemotePath: initialSettings?.webdavRemotePath || local?.webdavRemotePath || DEFAULT_NAS.webdavRemotePath,
        webdavUsername: initialSettings?.webdavUsername || local?.webdavUsername || DEFAULT_NAS.webdavUsername,
        webdavPassword: initialSettings?.webdavPassword || local?.webdavPassword || DEFAULT_NAS.webdavPassword,
      });
    } else {
      setConfig({
        webdavUrl: initialSettings?.webdavUrl || DEFAULT_NAS.webdavUrl,
        webdavRemotePath: initialSettings?.webdavRemotePath || DEFAULT_NAS.webdavRemotePath,
        webdavUsername: initialSettings?.webdavUsername || DEFAULT_NAS.webdavUsername,
        webdavPassword: initialSettings?.webdavPassword || DEFAULT_NAS.webdavPassword,
      });
    }
  }, [initialSettings, supabaseOk]);

  useEffect(() => {
    if (!supabaseOk) return;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        setConfig((prev) => ({
          ...prev,
          webdavUrl: s.webdavUrl || prev.webdavUrl,
          webdavRemotePath: s.webdavRemotePath || prev.webdavRemotePath,
          webdavUsername: s.webdavUsername || prev.webdavUsername,
          webdavPassword: s.webdavPassword || prev.webdavPassword,
        }));
      })
      .catch(() => {});
  }, [supabaseOk]);

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

  async function saveConfig(e) {
    e.preventDefault();
    setConfigMsg('');
    if (!supabaseOk) {
      const local = loadLocalSettings();
      saveLocalSettings({ ...local, ...config });
      setConfigMsg('已儲存至瀏覽器');
      return;
    }
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      setConfigMsg('NAS 設定已儲存');
    } else {
      setConfigMsg('儲存失敗');
    }
  }

  async function loadNasLibrary() {
    if (!supabaseOk) return;
    if (!config.webdavUrl || !config.webdavRemotePath) {
      setError('請先填寫 WebDAV URL 與 Remote Music Path');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/library?source=webdav');
      const data = await res.json();
      const okResults = (data.stores || []).filter((s) => s.ok && s.data);
      if (okResults.length === 0) {
        const firstError = (data.stores || []).find((s) => !s.ok)?.error || '沒有店點回傳 NAS 音樂清單';
        setError(firstError);
      } else {
        const allFiles = new Set();
        okResults.forEach((s) => {
          (s.data.files || []).forEach((f) => allFiles.add(typeof f === 'string' ? f : f.path || JSON.stringify(f)));
        });
        const list = Array.from(allFiles).sort();
        setFiles(list);
        saveNasFiles(list);
        setLastTs(new Date().toISOString());
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
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
      setBatchJob({ id: data.jobId });
      pollJob(data.jobId);
    }
  }

  async function pollJob(jobId) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/command/batch?jobId=${jobId}`);
      const data = await res.json();
      if (data.job) {
        setBatchJob(data.job);
        if (data.job.pending === 0) clearInterval(interval);
      }
    }, 2000);
  }

  return (
    <>
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <HardDrive size={20} color="var(--accent-2)" /> NAS / WebDAV 連線設定
        </h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          顯示 NAS 上目前可同步的音樂檔案。選取店點後可一鍵同步。
        </p>
        <form onSubmit={saveConfig}>
          <div className="form-row">
            <div className="form-group">
              <label>WebDAV URL</label>
              <input value={config.webdavUrl} onChange={(e) => setConfig({ ...config, webdavUrl: e.target.value })} placeholder="https://your-nas.com:5006" />
            </div>
            <div className="form-group">
              <label>Remote Music Path</label>
              <input value={config.webdavRemotePath} onChange={(e) => setConfig({ ...config, webdavRemotePath: e.target.value })} placeholder="/NikkoMusic" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>使用者</label>
              <input value={config.webdavUsername} onChange={(e) => setConfig({ ...config, webdavUsername: e.target.value })} placeholder="admin" />
            </div>
            <div className="form-group">
              <label>密碼</label>
              <PasswordInput
                value={config.webdavPassword}
                onChange={(e) => setConfig({ ...config, webdavPassword: e.target.value })}
                placeholder="topup30%off"
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button type="submit" className="primary" title="儲存 NAS 設定">
              <Save size={16} /> 儲存 NAS 設定
            </button>
            <button type="button" className="primary" onClick={loadNasLibrary} disabled={loading} title="從 NAS 載入音樂清單">
              {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} 載入 NAS 音樂清單
            </button>
            {configMsg && <span style={{ fontSize: '0.9rem', color: configMsg.includes('失敗') ? 'var(--danger)' : 'var(--success)' }}>{configMsg}</span>}
          </div>
          {error && (
            <div className="badge badge-red" style={{ marginTop: '1rem', width: 'fit-content' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Server size={20} color="var(--accent-2)" /> 目標店點
            <span className="badge badge-gray">{selected.size} / {stores.length}</span>
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="ghost" onClick={selectAll} disabled={stores.length === 0} title="全選/取消全選店點">
              {allSelected ? '取消全選' : '全選'}
            </button>
            <button className="primary" onClick={() => runBatch('sync')} disabled={!supabaseOk || batchLoading || selected.size === 0} title="同步 NAS 音樂到選取店點">
              {batchLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} 同步到選取店點
            </button>
          </div>
        </div>

        {stores.length === 0 ? (
          <div className="empty-state">
            <Server size={48} />
            <p>尚無店點，請先到「店點管理」新增。</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
            {stores.map((s) => (
              <label key={s.storeId} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', margin: 0 }}>
                <input type="checkbox" checked={selected.has(s.storeId)} onChange={() => toggleSelect(s.storeId)} style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.storeName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.storeId}</div>
                </div>
              </label>
            ))}
          </div>
        )}

        {batchJob && (
          <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            任務狀態：成功 {batchJob.success} / 失敗 {batchJob.failed} / 無回應 {batchJob.noResponse} / 總計 {batchJob.total}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Music size={20} color="var(--accent-2)" /> NAS 音樂清單
            <span className="badge badge-gray">{files.length}</span>
          </h2>
          {lastTs && <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>最後更新：{new Date(lastTs).toLocaleString('zh-TW')}</span>}
        </div>
        {files.length === 0 && !loading && (
          <div className="empty-state">
            <Music size={48} />
            <p>尚未載入 NAS 音樂清單</p>
          </div>
        )}
        {files.length > 0 && (
          <div className="list-table-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="list-table">
              <thead>
                <tr>
                  <th>檔案路徑</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.85rem' }}>{f}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
