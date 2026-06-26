import mqtt from 'mqtt';
import { randomUUID } from 'crypto';

const COMMANDS = [
  { key: 'player_play', label: '播放' },
  { key: 'player_pause', label: '暫停' },
  { key: 'player_resume', label: '繼續' },
  { key: 'player_next', label: '下一首' },
  { key: 'status_dashboard', label: 'Dashboard' },
  { key: 'status_system', label: '系統資訊' },
  { key: 'status_player', label: '播放狀態' },
  { key: 'sync', label: '同步 NAS WebDAV' },
  { key: 'rescan', label: '重新掃描' },
  { key: 'restart_player', label: '重啟播放服務' },
  { key: 'reboot', label: '重開機' },
];

export function listCommands() {
  return COMMANDS;
}

export function getTopics(storeId) {
  const prefix = `nikko/${storeId}`;
  return {
    cmd: `${prefix}/cmd`,
    resp: `${prefix}/resp`,
    status: `${prefix}/status`,
  };
}

function buildClient({ broker, port, username, password }) {
  const url = `mqtt://${broker}:${port || 1883}`;
  const options = {
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 0,
  };
  if (username) {
    options.username = username;
    options.password = password;
  }
  return mqtt.connect(url, options);
}

export function publishCommand({ broker, port, username, password, storeId, commandKey, timeout = 15000 }) {
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const topics = getTopics(storeId);
    const client = buildClient({ broker, port, username, password });
    let finished = false;
    let response = null;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { client.end(); } catch {}
        resolve({
          ok: false,
          error: `MQTT timeout waiting for response (storeId=${storeId}, command=${commandKey})`,
          requestId,
          stdout: '',
          stderr: '',
        });
      }
    }, timeout);

    client.on('connect', () => {
      client.subscribe(topics.resp, { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timer);
          finished = true;
          try { client.end(); } catch {}
          return resolve({ ok: false, error: `Subscribe error: ${err.message}`, requestId });
        }
        const payload = JSON.stringify({ requestId, commandKey, timestamp: Date.now() });
        client.publish(topics.cmd, payload, { qos: 1 }, (err) => {
          if (err) {
            clearTimeout(timer);
            finished = true;
            try { client.end(); } catch {}
            return resolve({ ok: false, error: `Publish error: ${err.message}`, requestId });
          }
        });
      });
    });

    client.on('message', (topic, message) => {
      if (topic !== topics.resp) return;
      try {
        const data = JSON.parse(message.toString());
        if (data.requestId === requestId) {
          clearTimeout(timer);
          if (!finished) {
            finished = true;
            try { client.end(); } catch {}
            resolve({
              ok: data.ok === true,
              requestId: data.requestId,
              result: data.result,
              error: data.error,
              parsed: data.ok ? data.result : null,
              stdout: '',
              stderr: data.error || '',
            });
          }
        }
      } catch (e) {
        // ignore malformed
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      if (!finished) {
        finished = true;
        try { client.end(); } catch {}
        resolve({ ok: false, error: `MQTT error: ${err.message}`, requestId });
      }
    });
  });
}

export function testMQTT({ broker, port, username, password, storeId, timeout = 10000 }) {
  return publishCommand({
    broker,
    port,
    username,
    password,
    storeId,
    commandKey: 'status_dashboard',
    timeout,
  });
}
