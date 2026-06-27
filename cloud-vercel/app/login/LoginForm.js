"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Lock, Loader2 } from 'lucide-react';

export default function LoginForm() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const fd = new FormData(e.target);
    const res = await fetch('/api/auth', {
      method: 'POST',
      body: fd,
    });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(
        res.status === 429
          ? '登入失敗次數過多，請稍後再試'
          : res.status === 503
            ? '管理平台尚未完成安全設定'
            : data.error || '帳號或密碼錯誤'
      );
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>帳號</label>
        <div style={{ position: 'relative' }}>
          <User size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input name="username" required autoFocus style={{ paddingLeft: '2.4rem' }} placeholder="nikkolh" />
        </div>
      </div>
      <div className="form-group">
        <label>密碼</label>
        <div style={{ position: 'relative' }}>
          <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input name="password" type="password" required style={{ paddingLeft: '2.4rem' }} placeholder="••••••••" />
        </div>
      </div>
      {msg && (
        <div className="badge badge-red" style={{ marginBottom: '1rem', width: '100%', justifyContent: 'center' }}>
          {msg}
        </div>
      )}
      <button type="submit" className="primary" disabled={busy} style={{ width: '100%' }}>
        {busy ? <Loader2 size={18} className="spin" /> : null}
        {busy ? '登入中…' : '登入'}
      </button>
    </form>
  );
}
