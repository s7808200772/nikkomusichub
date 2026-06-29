"use client";

import React from 'react';
import { Play, Pause, CircleStop, Volume2, Shuffle, Repeat, Music2, Activity, Server, Wifi, Thermometer, HardDrive, Cpu, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

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
  return String(value);
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
    if (!status) return <Badge color="gray">未知</Badge>;
    if (status === 'active') return <Badge color="green">執行中</Badge>;
    if (status === 'failed') return <Badge color="red">失敗</Badge>;
    if (status === 'inactive') return <Badge color="gray">未啟動</Badge>;
    return <Badge color="gray">{status}</Badge>;
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
        {d.git?.commit && <Row icon={Activity} label="Git Commit" value={`${d.git.commit.slice(0, 7)}${d.git.branch ? ` (${d.git.branch})` : ''}`} />}
        <Row icon={Activity} label="Python" value={d.python_version?.split(' ')[0]} />
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

export default function ResponseFormatter({ commandKey, data, error }) {
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
  if (typeof data === 'object') {
    return (
      <div className="resp-section">
        <div className="resp-grid">
          {Object.entries(data).map(([k, v]) => (
            <Row key={k} label={k} value={fmt(v)} />
          ))}
        </div>
      </div>
    );
  }
  return <pre className="resp-pre">{String(data)}</pre>;
}
