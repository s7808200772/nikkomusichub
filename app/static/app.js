async function apiGet(url) {
  const r = await fetch(url);
  if (r.status === 401) { window.location.href = '/login'; return undefined; }
  if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
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
  if (r.status === 401) { window.location.href = '/login'; return undefined; }
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: r.ok, stdout: text, stderr: '' };
  }
}

function statusDot(color) {
  return `<span class="dot ${color}"></span>`;
}

function formatDuration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}天`);
  if (h) parts.push(`${h}時`);
  if (m) parts.push(`${m}分`);
  parts.push(`${s}秒`);
  return parts.join(' ');
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatSyncTime(iso) {
  if (!iso || iso === '-') return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch (e) {
    return iso;
  }
}

let _toastTimer = null;
function showToast(message, type='info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  const color = type === 'success' ? 'var(--success)' : (type === 'error' ? 'var(--danger)' : (type === 'warning' ? 'var(--warning)' : 'var(--accent)'));
  t.style.borderLeftColor = color;
  t.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.classList.remove('show'); }, 4000);
}

function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    if (!btn.dataset.original) btn.dataset.original = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner" style="width:.9em;height:.9em;border-width:2px;"></span> 執行中…';
  } else {
    btn.classList.remove('loading');
    btn.innerHTML = btn.dataset.original || btn.textContent;
  }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

function updateDeviceStatus(state, detail = '') {
  const el = document.getElementById('device-status');
  if (!el) return;
  const map = {
    online:   { text: '上線', cls: 'online' },
    offline:  { text: '離線', cls: 'offline' },
    checking: { text: '檢查中…', cls: 'checking' },
    error:    { text: '異常', cls: 'error' },
    unknown:  { text: '未知', cls: 'unknown' },
  };
  const cfg = map[state] || map.unknown;
  el.className = 'device-status ' + cfg.cls;
  const dot = el.querySelector('.dot');
  const text = el.querySelector('.status-text');
  if (text) text.textContent = detail || cfg.text;
  if (dot) {
    dot.className = 'dot ' + (state === 'online' ? 'green pulse' : state === 'offline' ? 'red' : state === 'error' ? 'yellow' : 'gray');
  }
}

async function pollDeviceStatus() {
  updateDeviceStatus('checking');
  try {
    const res = await fetchWithTimeout('/api/health', {}, 8000);
    if (!res.ok) {
      updateDeviceStatus('error', 'HTTP ' + res.status);
      return;
    }
    const data = await res.json();
    if (data && data.ok) updateDeviceStatus('online', '裝置上線');
    else updateDeviceStatus('error', '服務異常');
  } catch (e) {
    if (e.name === 'AbortError') updateDeviceStatus('error', '檢查逾時');
    else updateDeviceStatus('offline', '連線中斷');
  }
}

async function runAction(btn, url, body, outputId) {
  setBusy(btn, true);
  const out = document.getElementById(outputId);
  if (out) out.textContent = '執行中…';
  try {
    const res = await apiPost(url, body);
    if (!res) {
      if (out) out.textContent = '未登入或網路中斷';
      showToast('未登入或網路中斷', 'error');
      return { ok: false };
    }
    if (out) {
      let text = '';
      if (typeof res.stdout === 'string') text += res.stdout;
      if (typeof res.stderr === 'string') text += '\n' + res.stderr;
      if (res.error) text += '\n' + (typeof res.error === 'string' ? res.error : JSON.stringify(res.error));
      if (res.data && !text.trim()) text = JSON.stringify(res.data, null, 2);
      if (!text.trim() && res.message) text = res.message;
      out.textContent = text.trim() || (res.ok ? '執行完成' : '執行失敗，無詳細訊息');
    }
    const message = res.message || (res.ok ? '執行成功' : '執行失敗');
    showToast(message, res.ok ? 'success' : 'error');
    return res;
  } catch (e) {
    showToast('網路或系統錯誤: ' + e, 'error');
    return { ok: false };
  } finally {
    setBusy(btn, false);
  }
}

function gaugeSvg(percent, color) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return `<svg width="56" height="56" viewBox="0 0 56 56"><circle class="gauge-bg" cx="28" cy="28" r="${r}"/><circle class="gauge-fill" style="stroke:${color};stroke-dasharray:${c};stroke-dashoffset:${offset}" cx="28" cy="28" r="${r}"/></svg>`;
}

function renderRightPanel(data) {
  if (!data) return;

  const navStatus = document.getElementById('nav-system-status');
  if (navStatus) {
    const ok = data.web_service_status === 'active';
    navStatus.innerHTML = `${statusDot(ok ? 'green' : 'red')}系統狀態：${ok ? '正常' : '異常'}`;
    navStatus.className = 'status-pill ' + (ok ? '' : 'error');
  }

  const navStore = document.getElementById('nav-store-name');
  const navTs = document.getElementById('nav-tailscale-ip');
  const navLan = document.getElementById('nav-lan-ip');
  if (navStore) navStore.textContent = data.store_name || '-';
  if (navTs) navTs.textContent = 'Tailscale ' + (data.tailscale_ip || '未偵測');
  if (navLan) navLan.textContent = 'LAN ' + (data.lan_ip || '未偵測');

  const sbModel = document.getElementById('sidebar-pi-model');
  const sbUptime = document.getElementById('sidebar-uptime');
  const sbStatusDot = document.getElementById('sidebar-status-dot');
  const sbStatusText = document.getElementById('sidebar-status-text');
  if (sbModel) sbModel.textContent = data.pi_model || 'Raspberry Pi';
  if (sbUptime) sbUptime.textContent = formatDuration(data.uptime_seconds || 0);
  if (sbStatusDot && sbStatusText) {
    const ok = data.web_service_status === 'active';
    sbStatusDot.className = 'dot ' + (ok ? 'green' : 'red');
    sbStatusText.textContent = ok ? '正常運行' : '異常';
  }

  const panel = document.getElementById('left-panel');
  if (!panel) return;

  const cpuColor = data.cpu_percent > 90 ? 'var(--danger)' : (data.cpu_percent > 75 ? 'var(--warning)' : 'var(--success)');
  const ramColor = data.ram.percent > 90 ? 'var(--danger)' : (data.ram.percent > 75 ? 'var(--warning)' : 'var(--success)');
  const diskColor = data.disk.percent > 90 ? 'var(--danger)' : 'var(--success)';

  panel.innerHTML = `
    <div class="card">
      <h3><span class="icon">🏪</span>店家資訊</h3>
      <div class="metric-row"><span class="label">店名</span><span class="value">${data.store_name}</span></div>
      <div class="metric-row"><span class="label">Hostname</span><span class="value">${data.hostname}</span></div>
      <div class="metric-row"><span class="label">Tailscale IP</span><span class="value">${data.tailscale_ip || '未偵測'}</span></div>
      <div class="metric-row"><span class="label">LAN IP</span><span class="value">${data.lan_ip || '未偵測'}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">📊</span>系統資源</h3>
      <div class="gauge-grid">
        <div class="gauge">${gaugeSvg(data.cpu_percent, cpuColor)}<div class="gauge-label" style="color:${cpuColor}">${data.cpu_percent}%</div><div class="gauge-name">CPU</div></div>
        <div class="gauge">${gaugeSvg(data.ram.percent, ramColor)}<div class="gauge-label" style="color:${ramColor}">${data.ram.percent}%</div><div class="gauge-name">RAM</div></div>
        <div class="gauge">${gaugeSvg(data.disk.percent, diskColor)}<div class="gauge-label" style="color:${diskColor}">${data.disk.percent}%</div><div class="gauge-name">磁碟</div></div>
      </div>
      <div class="metric-row"><span class="label">RAM 使用</span><span class="value small">${data.ram.used_mb}/${data.ram.total_mb} MB</span></div>
      <div class="metric-row"><span class="label">磁碟空間</span><span class="value small">${data.disk.total_gb} GB</span></div>
      <div class="metric-row"><span class="label">已運行</span><span class="value small">${formatDuration(data.uptime_seconds)}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">🧩</span>元件狀態</h3>
      <div class="metric-row"><span class="label">rclone</span><span class="value">${statusDot(data.rclone_installed ? 'green' : 'gray')}${data.rclone_installed ? '已安裝' : '未安裝'}</span></div>
      <div class="metric-row"><span class="label">mpv</span><span class="value">${statusDot(data.mpv_installed ? 'green' : 'gray')}${data.mpv_installed ? '已安裝' : '未安裝'}</span></div>
      <div class="metric-row"><span class="label">音樂服務</span><span class="value">${statusDot(data.player_active === 'active' ? 'green' : 'gray')}${data.player_active}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">🌐</span>服務狀態</h3>
      <div class="metric-row"><span class="label">Web</span><span class="value">${statusDot(data.web_service_status === 'active' ? 'green' : 'gray')}${data.web_service_status}</span></div>
      <div class="metric-row"><span class="label">Player</span><span class="value">${statusDot(data.player_service_status === 'active' ? 'green' : 'gray')}${data.player_service_status}</span></div>
      <div class="metric-row"><span class="label">Sync Timer</span><span class="value">${statusDot(data.sync_timer_status === 'active' ? 'green' : 'gray')}${data.sync_timer_status}</span></div>
      <div class="metric-row"><span class="label">MQTT</span><span class="value">${statusDot(data.mqtt_service_status === 'active' ? 'green' : 'gray')}${data.mqtt_service_status}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">☁️</span>NAS WebDAV 同步</h3>
      <div class="metric-row"><span class="label">WebDAV 狀態</span><span class="value">${statusDot(data.webdav_connected ? 'green' : 'gray')}${data.webdav_connected ? '可連線' : '未設定'}</span></div>
      <div class="metric-row"><span class="label">Remote</span><span class="value small">${data.webdav_remote}</span></div>
      <div class="metric-row"><span class="label">URL</span><span class="value small">${data.webdav_url}</span></div>
      <div class="metric-row"><span class="label">Remote Path</span><span class="value small">${data.webdav_remote_path}</span></div>
      <div class="metric-row"><span class="label">本地路徑</span><span class="value small">${data.local_music_path}</span></div>
      <div class="metric-row"><span class="label">MP3 數量</span><span class="value">${data.mp3_count}</span></div>
      <div class="metric-row"><span class="label">最近同步</span><span class="value small">${formatSyncTime(data.last_sync_at)} ${data.last_sync_status || ''}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">🎵</span>播放器狀態</h3>
      <div class="metric-row"><span class="label">播放狀態</span><span class="value">${statusDot(data.player_status === 'playing' ? 'green' : (data.player_status === 'paused' ? 'yellow' : 'gray'))}${data.player_status}</span></div>
      <div class="metric-row"><span class="label">目前曲目</span><span class="value small">${data.current_track || '-'}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">🖥️</span>系統詳細資訊</h3>
      <div class="metric-row"><span class="label">Pi 型號</span><span class="value small">${data.pi_model}</span></div>
      <div class="metric-row"><span class="label">作業系統</span><span class="value small">${data.os_version}</span></div>
      <div class="metric-row"><span class="label">Python</span><span class="value small">${data.python_version}</span></div>
      <div class="metric-row"><span class="label">CPU 溫度</span><span class="value">${data.cpu_temp_c !== null ? data.cpu_temp_c + ' °C' : 'N/A'}</span></div>
    </div>

    <div class="card">
      <h3><span class="icon">📦</span>軟體版本資訊</h3>
      <div class="metric-row"><span class="label">rclone</span><span class="value small">${data.rclone_version}</span></div>
      <div class="metric-row"><span class="label">mpv</span><span class="value small">${data.mpv_version}</span></div>
    </div>
  `;
}

async function loadRightPanel() {
  try {
    const data = await apiGet('/api/dashboard');
    if (data) renderRightPanel(data);
  } catch (e) {
    console.error('loadRightPanel failed', e);
  }
}

// The dashboard template owns its status-card refresh cycle.  Do not start the
// legacy right-panel poll here: the right panel no longer exists, and the
// duplicate /api/dashboard requests can starve static assets on a single-core
// Raspberry Pi.
// Keep one initial request so shared headers (for example on Logs) still show
// the store name and IP addresses.
loadRightPanel();
pollDeviceStatus();
setInterval(pollDeviceStatus, 10000);

// Sidebar clock
function updateSidebarClock() {
  const el = document.getElementById('sidebar-clock');
  if (el) el.textContent = new Date().toLocaleString('zh-TW');
}
updateSidebarClock();
setInterval(updateSidebarClock, 1000);

// HTMX SPA: update active nav link after navigation
document.body.addEventListener('htmx:afterSettle', function(evt) {
  const path = window.location.pathname;
  let matched = false;
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    const isMatch = !matched && a.getAttribute('href') === path;
    a.classList.toggle('active', isMatch);
    if (isMatch) matched = true;
  });
  // Re-run page-specific inline scripts if needed
  if (window.initPage) window.initPage();
});
