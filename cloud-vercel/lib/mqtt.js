import mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import { signCommand, verifyResponse } from './mqttAuth.js';
import { createJob, updateStoreResult } from './jobs.js';

const COMMAND_SECRET = process.env.NIKKO_MQTT_COMMAND_SECRET || '';
const TOPIC_PREFIX = process.env.NIKKO_MQTT_TOPIC_PREFIX || 'nikko';
const MQTT_CA = process.env.NIKKO_MQTT_CA || '';
const MQTT_TLS_SERVERNAME = process.env.NIKKO_MQTT_TLS_SERVERNAME || '';
const MQTT_TLS_VERIFY = process.env.NIKKO_MQTT_TLS_VERIFY !== '0' && process.env.NIKKO_MQTT_TLS_VERIFY !== 'false';

const COMMANDS = [
  { key: 'player_play', label: '播放' },
  { key: 'player_pause', label: '暫停' },
  { key: 'player_resume', label: '繼續' },
  { key: 'player_next', label: '下一首' },
  { key: 'player_mute', label: '靜音' },
  { key: 'player_unmute', label: '取消靜音' },
  { key: 'status_dashboard', label: 'Dashboard' },
  { key: 'status_system', label: '系統資訊' },
  { key: 'status_player', label: '播放狀態' },
  { key: 'sync', label: '同步 NAS WebDAV', dangerous: true },
  { key: 'rescan', label: '重新掃描' },
  { key: 'restart_player', label: '重啟播放服務', dangerous: true },
  { key: 'reboot', label: '重開機', dangerous: true },
  { key: 'library_list', label: '音樂庫列表' },
  { key: 'get_log', label: '查看 Log' },
  { key: 'ota_update', label: 'OTA 更新', dangerous: true },
  { key: 'rollback', label: 'Rollback', dangerous: true },
];

const DANGEROUS_KEYS = new Set(COMMANDS.filter((c) => c.dangerous).map((c) => c.key));

export function listCommands() {
  return COMMANDS;
}

export function getTopics(storeId) {
  const prefix = `${TOPIC_PREFIX}/${storeId}`;
  return {
    cmd: `${prefix}/cmd`,
    resp: `${prefix}/resp`,
    status: `${prefix}/status`,
  };
}

function buildClient({ broker, port, username, password, tls = true, tlsVerify = true }) {
  const options = {
    protocol: tls ? 'mqtts' : 'mqtt',
    host: broker,
    port: port || (tls ? 8883 : 1883),
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 0,
    rejectUnauthorized: MQTT_TLS_VERIFY && tlsVerify,
  };
  if (tls && MQTT_CA) {
    options.ca = MQTT_CA;
  }
  if (tls && MQTT_TLS_SERVERNAME) {
    options.servername = MQTT_TLS_SERVERNAME;
  }
  if (username) {
    options.username = username;
    options.password = password;
  }
  return mqtt.connect(options);
}

export function publishCommand({ broker, port, username, password, tls = true, tlsVerify = true, storeId, commandKey, timeout = 25000 }) {
  return new Promise((resolve) => {
    if (!COMMAND_SECRET) {
      resolve({ ok: false, error: 'MQTT command authentication is not configured' });
      return;
    }
    const requestId = randomUUID();
    const topics = getTopics(storeId);
    const client = buildClient({ broker, port, username, password, tls, tlsVerify });
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
        const command = {
          requestId,
          commandKey,
          timestamp: Date.now(),
          nonce: randomUUID(),
          confirm: DANGEROUS_KEYS.has(commandKey),
        };
        command.signature = signCommand(command, storeId, COMMAND_SECRET);
        const payload = JSON.stringify(command);
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
          if (!verifyResponse(data, COMMAND_SECRET)) {
            return;
          }
          const parsedResult = JSON.parse(data.resultJson || 'null');
          clearTimeout(timer);
          if (!finished) {
            finished = true;
            try { client.end(); } catch {}
            resolve({
              ok: data.ok === true,
              requestId: data.requestId,
              result: parsedResult,
              error: data.error,
              parsed: data.ok ? parsedResult : null,
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishCommandWithRetry(options) {
  const retries = options.retries ?? 2; // initial + 2 retries = up to 3 attempts
  const baseDelayMs = options.baseDelayMs ?? 2000;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
    const result = await publishCommand({
      broker: options.broker,
      port: options.port,
      username: options.username,
      password: options.password,
      tls: options.tls,
      tlsVerify: options.tlsVerify,
      storeId: options.storeId,
      commandKey: options.commandKey,
      timeout: options.timeout || 25000,
    });
    if (result.ok) return result;
    lastError = result.error || 'Unknown error';
    const retryable = /timeout|disconnect|network|ECONNREFUSED/i.test(lastError);
    if (!retryable) return result;
  }
  return {
    ok: false,
    error: `重試 ${retries + 1} 次後仍失敗：${lastError}`,
    requestId: options.requestId || randomUUID(),
    stdout: '',
    stderr: lastError,
  };
}

export async function publishBatch({ stores, commandKey, timeout = 25000 }) {
  const job = createJob(
    stores.map((s) => s.storeId),
    commandKey
  );

  // Run commands concurrently; each has its own retry logic.
  await Promise.all(
    stores.map(async (store) => {
      updateStoreResult(job.id, store.storeId, 'pending', null, null);
      const result = await publishCommandWithRetry({
        broker: store.mqttBroker,
        port: store.mqttPort || (store.mqttTls === true ? 8883 : 1883),
        username: store.mqttUsername,
        password: store.mqttPassword,
        tls: store.mqttTls === true,
        tlsVerify: store.tlsVerify === true,
        storeId: store.storeId,
        commandKey,
        timeout,
        retries: 2,
      });
      if (result.ok) {
        updateStoreResult(job.id, store.storeId, 'success', result.parsed || result.result || null, null);
      } else if (/timeout|no response|waiting for response/i.test(result.error || '')) {
        updateStoreResult(job.id, store.storeId, 'no_response', null, result.error);
      } else {
        updateStoreResult(job.id, store.storeId, 'failed', null, result.error);
      }
    })
  );

  return { jobId: job.id };
}

export function testMQTT({ broker, port, username, password, tls = true, tlsVerify = true, storeId, timeout = 20000 }) {
  return publishCommand({
    broker,
    port,
    username,
    password,
    tls,
    tlsVerify,
    storeId,
    commandKey: 'status_dashboard',
    timeout,
  });
}
