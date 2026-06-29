"use client";

import React from 'react';
import { Play, Pause, CircleStop, Volume2, Shuffle, Repeat, Music2, Activity, Server, Wifi, Thermometer, HardDrive, Cpu, Clock, AlertCircle, CheckCircle2, Terminal } from 'lucide-react';

function formatSeconds(sec) {
  if (sec === null || sec === undefined || Number.isNaN(Number(sec))) return '-';
  const s = Math.floor(Number(sec) % 60);
  const m = Math.floor((Number(sec) / 60) % 60);
  const h = Math.floor(Number(sec) / 3600);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-TW');
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const KEY_LABELS = {
  ok: '執行結果',
  success: '執行結果',
  message: '訊息',
  error: '錯誤',
  stdout: '標準輸出',
  stderr: '錯誤輸出',
  count: '數量',
  files: '檔案列表',
  lines: '內容',
  log_type: 'Log 類型',
  version: '版本',
  git_version: 'Git 版本',
  git_commit: 'Git Commit',
  commit: 'Commit',
  branch: '分支',
  status: '狀態',
  state: '狀態',
  uptime_seconds: '運行時間',
  cpu_percent: 'CPU 使用率',
  ram: 'RAM',
  disk: '磁碟',
  mp3_count: '曲目數',
  current: '目前曲目',
  current_track: '目前曲目',
  title: '曲名',
  volume: '音量',
  position: '播放位置',
  duration: '總長度',
  shuffle: '隨機播放',
  loop: '循環播放',
  mute: '靜音',
  playlist_count: '播放清單數量',
  store_name: '店名',
  hostname: '主機名稱',
  tailscale_ip: 'Tailscale IP',
  lan_ip: 'LAN IP',
  webdav_connected: 'WebDAV 連線',
  last_sync_at: '上次同步時間',
  last_sync_status: '上次同步狀態',
  last_sync_message: '同步訊息',
  player_active: '播放服務狀態',
  web_service_status: 'Web 服務狀態',
  player_service_status: '播放服務狀態',
  sync_timer_status: '同步 Timer 狀態',
  mqtt_service_status: 'MQTT 服務狀態',
};

function labelKey(k) {
  return KEY_LABELS[k] || k;
}

function Badge({ children, color = 'gray' }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

function Row({ icon: Icon, label, value, color, children }) {
  const rendered = children ?? (value === null || value === undefined || value === '' ? '-' : value);
  return (
    <div className="resp-row">
      <div className="resp-label">
        {Icon && <Icon size={14} />}
        {label}
      </div>
      <div className="resp-value" style={{ color: color ? `var(--${color})` : undefined }}>
        {rendered}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="resp-section">
      <h4 className="resp-section-title">{Icon && <Icon size={16} />}{title}</h4>
      <div className="resp-grid">{children}</div>
    </div>
  );
}

function ProgressBar({ percent, color }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="progress-bar-track">
      <div
        className={`progress-bar-fill progress-bar-${color || 'blue'}`}
        style={{ width: `${p}%` }}
      />
      <span className="progress-bar-text">{p.toFixed(1)}%</span>
    </div>
  );
}

function formatPlayerState(state) {
  switch (state) {
    case 'playing': return <Badge color="green">播放中</Badge>;
    case 'paused': return <Badge color="yellow">暫停</Badge>;
    case 'stopped': return <Badge color="gray">停止</Badge>;
    default: return state ? <Badge color="gray">{state}</Badge> : '-';
  }
}

function PlayerFormatter({ data }) {
  const d = data || {};
  return (
    <div className="resp-card">
      <Section title="播放狀態" icon={Music2}>
        <Row icon={Play} label="狀態" value={formatPlayerState(d.state)} />
        <Row icon={Music2} label="目前曲目" value={d.current || d.current_track || d.title} />
        <Row icon={Volume2} label="音量" value={d.volume !== undefined ? `${d.volume}%` : null} />
        <Row icon={Activity} label="播放進度" value={d.position !== undefined && d.duration !== undefined ? `${formatSeconds(d.position)} / ${formatSeconds(d.duration)}` : (d.position !== undefined ? formatSeconds(d.position) : null)} />
        <Row icon={Shuffle} label="隨機播放" value={fmt(d.shuffle)} />
        <Row icon={Repeat} label="循環播放" value={fmt(d.loop)} />
      </Section>
    </div>
  );
}

function DashboardFormatter({ data }) {
  const d = data || {};
  const cpu = d.cpu_percent;
  const ram = d.ram?.percent;
  const disk = d.disk?.percent;
  const online = d.player_active === 'active' || d.player_active === true;
  return (
    <div className="resp-card">
      <Section title="店點與網路" icon={Server}>
        <Row icon={Server} label="店名" value={d.store_name} />
        <Row icon={Server} label="主機名" value={d.hostname} />
        <Row icon={Wifi} label="Tailscale IP" value={d.tailscale_ip} />
        <Row icon={Wifi} label="LAN IP" value={d.lan_ip} />
        <Row icon={CheckCircle2} label="線上狀態" value={online ? <Badge color="green">運作中</Badge> : <Badge color="gray">未運作</Badge>} />
      </Section>
      <Section title="系統資源" icon={Activity}>
        {cpu !== undefined && <Row icon={Cpu} label="CPU 使用率"><ProgressBar percent={cpu} color={cpu > 80 ? 'red' : cpu > 60 ? 'yellow' : 'green'} /></Row>}
        {ram !== undefined && <Row icon={Activity} label="RAM 使用率"><ProgressBar percent={ram} color={ram > 80 ? 'red' : ram > 60 ? 'yellow' : 'green'} /></Row>}
        {disk !== undefined && <Row icon={HardDrive} label="Disk 使用率"><ProgressBar percent={disk} color={disk > 85 ? 'red' : disk > 70 ? 'yellow' : 'green'} /></Row>}
      </Section>
      <Section title="同步與曲目" icon={Music2}>
        <Row icon={Clock} label="上次同步時間" value={formatDate(d.last_sync_at)} />
        <Row icon={CheckCircle2} label="上次同步狀態" value={d.last_sync_status ? <Badge color={d.last_sync_status === 'success' || d.last_sync_status === 'ok' ? 'green' : 'yellow'}>{d.last_sync_status}</Badge> : null} />
        {d.last_sync_message && <Row icon={AlertCircle} label="同步訊息" value={d.last_sync_message} />}
        <Row icon={Music2} label="曲目數" value={d.mp3_count !== undefined ? `${d.mp3_count} 首` : null} />
      </Section>
      {d.recent_errors && <div className="resp-alert resp-alert-danger"><AlertCircle size={16} /> 最近錯誤：<pre>{d.recent_errors}</pre></div>}
    </div>
  );
}

function SystemFormatter({ data }) {
  const d = data || {};
  const services = [
    { key: 'web_service_status', label: 'Web 服務' },
    { key: 'player_service_status', label: '播放服務' },
    { key: 'sync_timer_status', label: '同步 Timer' },
    { key: 'mqtt_service_status', label: 'MQTT 服務' },
  ];
  function serviceBadge(status) {
    const s = typeof status === 'string' ? status : (status && typeof status === 'object' ? status.status : String(status || ''));
    if (!s) return <Badge color="gray">未知</Badge>;
    if (s === 'active') return <Badge color="green">執行中</Badge>;
    if (s === 'failed') return <Badge color="red">失敗</Badge>;
    if (s === 'inactive') return <Badge color="gray">未啟動</Badge>;
    return <Badge color="gray">{s}</Badge>;
  }
  return (
    <div className="resp-card">
      <Section title="硬體與系統" icon={Server}>
        <Row icon={Server} label="Pi 型號" value={d.pi_model} />
        <Row icon={Server} label="作業系統" value={d.os_version} />
        <Row icon={Cpu} label="CPU 溫度" value={d.cpu_temp_c !== undefined && d.cpu_temp_c !== null ? `${d.cpu_temp_c}°C` : null} />
        <Row icon={Clock} label="運行時間" value={formatSeconds(d.uptime_seconds)} />
      </Section>
      <Section title="軟體版本" icon={Activity}>
        {d.git?.commit && <Row icon={Activity} label="Git Commit" value={`${String(d.git.commit).slice(0, 7)}${d.git.branch ? ` (${d.git.branch})` : ''}`} />}
        <Row icon={Activity} label="Python" value={d.python_version ? String(d.python_version).split(' ')[0] : null} />
        <Row icon={Activity} label="rclone" value={d.rclone_version} />
        <Row icon={Activity} label="mpv" value={d.mpv_version} />
      </Section>
      <Section title="網路" icon={Wifi}>
        <Row icon={Wifi} label="Tailscale 狀態" value={d.tailscale_up ? <Badge color="green">已連線</Badge> : <Badge color="gray">未連線</Badge>} />
        <Row icon={Wifi} label="Tailscale IP" value={d.tailscale_ip} />
        <Row icon={Wifi} label="LAN IP" value={d.lan_ip} />
      </Section>
      <Section title="服務狀態" icon={CheckCircle2}>
        {services.map((s) => (
          <Row key={s.key} icon={CheckCircle2} label={s.label} value={serviceBadge(d[s.key])} />
        ))}
      </Section>
    </div>
  );
}

function SimpleMessageFormatter({ data, commandKey }) {
  const d = data || {};
  const message = d.message != null ? fmt(d.message) : (d.stdout != null ? fmt(d.stdout) : (d.ok ? '指令已執行' : null));
  const error = d.error != null ? fmt(d.error) : (d.stderr != null ? fmt(d.stderr) : null);
  return (
    <div className="resp-card">
      <Section title={commandLabel(commandKey)} icon={CheckCircle2}>
        {message && <Row icon={CheckCircle2} label="訊息" value={message} />}
        {error && <Row icon={AlertCircle} label="錯誤" value={error} color="danger" />}
        {d.count !== undefined && <Row icon={Activity} label="數量" value={d.count} />}
      </Section>
    </div>
  );
}

function commandLabel(commandKey) {
  const map = {
    player_play: '播放 / 繼續',
    player_pause: '暫停',
    player_resume: '繼續',
    player_next: '下一首',
    player_mute: '靜音',
    player_unmute: '取消靜音',
    sync: '同步 NAS WebDAV',
    rescan: '重新掃描音樂庫',
    restart_player: '重啟播放服務',
    reboot: '重新開機',
    library_list: '音樂庫列表',
    get_log: '系統 Log',
    ota_update: 'OTA 更新',
    rollback: 'Rollback',
    network_watchdog_install: '安裝網路看門狗',
    network_watchdog_disable: '停用網路看門狗',
    network_watchdog_status: '看門狗狀態',
    network_watchdog_logs: '看門狗 Log',
  };
  return map[commandKey] || commandKey;
}

function LogFormatter({ data }) {
  const d = data || {};
  const lines = d.lines || d.log || d.content || '';
  return (
    <div className="resp-card">
      <Section title={`Log：${d.log_type || 'system'}`} icon={Terminal}>
        <div className="resp-pre" style={{ maxHeight: '320px', overflow: 'auto' }}>{typeof lines === 'string' ? lines : JSON.stringify(lines, null, 2)}</div>
      </Section>
    </div>
  );
}

function FileListFormatter({ data }) {
  const d = data || {};
  const files = Array.isArray(d.files) ? d.files : [];
  return (
    <div className="resp-card">
      <Section title="音樂庫列表" icon={Music2}>
        <Row icon={Activity} label="總數" value={`${d.count ?? files.length} 首`} />
        {files.length > 0 && (
          <div className="resp-pre" style={{ maxHeight: '240px', overflow: 'auto' }}>
            {files.map((f, i) => (
              <div key={i}>{typeof f === 'string' ? f : (f.path || f.filename || f.name || JSON.stringify(f))}</div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function WatchdogFormatter({ data }) {
  const d = data || {};
  return (
    <div className="resp-card">
      <Section title="網路看門狗" icon={Server}>
        {Object.entries(d).map(([k, v]) => (
          <Row key={k} icon={CheckCircle2} label={labelKey(k)} value={fmt(v)} />
        ))}
      </Section>
    </div>
  );
}

class FormatterErrorBoundary extends React.Component {
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
        <div className="resp-alert resp-alert-danger">
          <AlertCircle size={18} />
          <div>輸出格式化失敗：{this.state.error?.message || '未知錯誤'}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ResponseFormatterInner({ commandKey, data, error }) {
  if (error) {
    return (
      <div className="resp-alert resp-alert-danger">
        <AlertCircle size={18} />
        <div>{error}</div>
      </div>
    );
  }
  if (data === null || data === undefined) {
    return <div className="resp-empty">尚無資料</div>;
  }
  if (commandKey === 'status_player') return <PlayerFormatter data={data} />;
  if (commandKey === 'status_dashboard') return <DashboardFormatter data={data} />;
  if (commandKey === 'status_system') return <SystemFormatter data={data} />;

  // Non-status commands with human-readable formatting
  if (commandKey === 'get_log') return <LogFormatter data={data} />;
  if (commandKey === 'library_list') return <FileListFormatter data={data} />;
  if (commandKey === 'network_watchdog_status' || commandKey === 'network_watchdog_logs' || commandKey === 'network_watchdog_install' || commandKey === 'network_watchdog_disable') {
    return <WatchdogFormatter data={data} />;
  }
  if (['player_play', 'player_pause', 'player_resume', 'player_next', 'player_mute', 'player_unmute', 'sync', 'rescan', 'restart_player', 'reboot', 'ota_update', 'rollback'].includes(commandKey)) {
    return <SimpleMessageFormatter data={data} commandKey={commandKey} />;
  }

  if (typeof data === 'object') {
    return (
      <div className="resp-section">
        <div className="resp-grid">
          {Object.entries(data).map(([k, v]) => (
            <Row key={k} label={labelKey(k)} value={fmt(v)} />
          ))}
        </div>
      </div>
    );
  }
  return <pre className="resp-pre">{String(data)}</pre>;
}

export default function ResponseFormatter(props) {
  return (
    <FormatterErrorBoundary>
      <ResponseFormatterInner {...props} />
    </FormatterErrorBoundary>
  );
}
