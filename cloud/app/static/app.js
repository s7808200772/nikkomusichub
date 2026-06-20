async function apiGet(url) {
  const r = await fetch(url);
  if (r.status === 401) { window.location.href = '/login'; return; }
  return await r.json();
}

async function apiPost(url, body) {
  const opts = { method: 'POST' };
  if (body instanceof FormData || body instanceof URLSearchParams) {
    opts.body = body;
  } else if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (r.status === 401) { window.location.href = '/login'; return; }
  return await r.json();
}

function statusDot(color) {
  return `<span class="status-dot status-${color}"></span>`;
}

function showToast(message, type='info') {
  const t = document.getElementById('toast');
  t.innerHTML = message;
  t.style.display = 'block';
  t.style.borderLeftColor = type === 'success' ? 'var(--success)' : (type === 'error' ? 'var(--danger)' : 'var(--accent)');
  setTimeout(() => t.style.display = 'none', 4000);
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.dataset.original = btn.dataset.original || btn.textContent;
  btn.textContent = busy ? '執行中…' : btn.dataset.original;
}

async function runCommand(btn, storeId, commandKey, outputId) {
  setBusy(btn, true);
  try {
    const res = await apiPost(`/api/stores/${storeId}/commands/${commandKey}`);
    const out = document.getElementById(outputId);
    if (out) {
      let text = `== ${res.command_label || commandKey} ==\n`;
      if (res.parsed) text += JSON.stringify(res.parsed, null, 2);
      else text += (res.stdout || '') + '\n' + (res.stderr || '');
      if (res.error) text += '\nERROR: ' + res.error;
      out.textContent = text.trim();
    }
    showToast(res.ok ? '執行成功' : '執行失敗', res.ok ? 'success' : 'error');
  } catch (e) {
    showToast('錯誤: ' + e, 'error');
  } finally {
    setBusy(btn, false);
  }
}

async function checkDefaultPassword() {
  if (window.location.pathname === '/login') return;
  try {
    const me = await apiGet('/api/me');
    if (me && me.is_default) {
      const t = document.getElementById('toast');
      t.innerHTML = '⚠️ 使用預設密碼，請到 <a href="/settings" style="color:#fff;text-decoration:underline">Settings</a> 修改。';
      t.style.display = 'block';
      t.style.borderLeftColor = 'var(--warning)';
    }
  } catch (e) {}
}
checkDefaultPassword();
