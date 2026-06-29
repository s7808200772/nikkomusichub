import mqtt from 'mqtt';
import { randomUUID } from 'crypto';
import { signCommand, verifyResponse } from './mqttAuth.js';
import { createJob, updateStoreResult } from './jobs.js';

const COMMAND_SECRET = process.env.NIKKO_MQTT_COMMAND_SECRET || '';
const TOPIC_PREFIX = process.env.NIKKO_MQTT_TOPIC_PREFIX || 'nikko';
const MQTT_CA = process.env.NIKKO_MQTT_CA || '';
const MQTT_TLS_SERVERNAME = process.env.NIKKO_MQTT_TLS_SERVERNAME || '';
const MQTT_TLS_VERIFY = process.env.NIKKO_MQTT_TLS_VERIFY !== '0' && process.env.NIKKO_MQTT_TLS_VERIFY !== 'false';
const DEFAULT_BROKER = process.env.NIKKO_MQTT_BROKER || '114.55.1.51';
const DEFAULT_PORT = parseInt(process.env.NIKKO_MQTT_PORT || '1883', 10);
const DEFAULT_USERNAME = process.env.NIKKO_MQTT_USERNAME || 'admin';
const DEFAULT_PASSWORD = process.env.NIKKO_MQTT_PASSWORD || 'topup30%off';

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
  { key: 'network_watchdog_install', label: '安裝/更新網路看門狗', dangerous: true },
  { key: 'network_watchdog_disable', label: '停用網路看門狗', dangerous: true },
  { key: 'network_watchdog_status', label: '看門狗狀態' },
  { key: 'network_watchdog_logs', label: '看門狗 Log' },
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

function buildClient({ broker, port, username, password, tls = false, tlsVerify = false }) {
  const useTls = tls === true;
  const finalBroker = broker || DEFAULT_BROKER;
  const finalPort = port || (useTls ? 8883 : DEFAULT_PORT);
  const finalUsername = username || DEFAULT_USERNAME;
  const finalPassword = password || DEFAULT_PASSWORD;
  const options = {
    protocol: useTls ? 'mqtts' : 'mqtt',
    host: finalBroker,
    port: finalPort,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 0,
    rejectUnauthorized: MQTT_TLS_VERIFY && tlsVerify === true,
  };
  if (useTls && MQTT_CA) {
    options.ca = MQTT_CA;
  }
  if (useTls && MQTT_TLS_SERVERNAME) {
    options.servername = MQTT_TLS_SERVERNAME;
  }
  options.username = finalUsername;
  options.password = finalPassword;
  return mqtt.connect(options);
}

export function publishCommand({ broker, port, username, password, tls = false, tlsVerify = false, storeId, commandKey, payload, timeout = 25000 }) {
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
          ...(payload || {}),
          requestId,
          commandKey,
          timestamp: Date.now(),
          nonce: randomUUID(),
          confirm: DANGEROUS_KEYS.has(commandKey),
        };
        command.signature = signCommand(command, storeId, COMMAND_SECRET);
        const message = JSON.stringify(command);
        client.publish(topics.cmd, message, { qos: 1 }, (err) => {
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

async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
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
      payload: options.payload,
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

export async function publishBatch({ stores, commandKey, timeout = 25000, concurrency = 5 }) {
  const job = await createJob(
    stores.map((s) => s.storeId),
    commandKey
  );

  // Run commands with a concurrency limit to avoid exhausting broker connections.
  const tasks = stores.map((store) => async () => {
    await updateStoreResult(job.id, store.storeId, 'pending', null, null);
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
      await updateStoreResult(job.id, store.storeId, 'success', result.parsed || result.result || null, null);
    } else if (/timeout|no response|waiting for response/i.test(result.error || '')) {
      await updateStoreResult(job.id, store.storeId, 'no_response', null, result.error);
    } else {
      await updateStoreResult(job.id, store.storeId, 'failed', null, result.error);
    }
  });

  await runWithConcurrency(tasks, concurrency);

  return { jobId: job.id };
}

export async function testMQTT({ broker, port, username, password, tls = false, tlsVerify = false, storeId, timeout = 30000 }) {
  const result = await publishCommand({
    broker,
    port,
    username,
    password,
    tls,
    tlsVerify,
    storeId,
    commandKey: 'status_system',
    timeout,
  });

  if (!result.ok) {
    const baseError = result.error || 'Unknown error';
    let help = '';
    if (/timeout|waiting for response/i.test(baseError)) {
      help = `Pi did not respond on ${getTopics(storeId).resp}. Check that the Pi's MQTT_STORE_ID / storeId matches '${storeId}', the broker address/port/TLS settings are correct, and the nikko-music-mqtt.service is running.`;
    } else if (/ECONNREFUSED|connection refused|not authorized/i.test(baseError)) {
      help = `Cannot reach the MQTT broker. Verify broker host, port, TLS settings, and credentials for store '${storeId}'.`;
    }
    return {
      ...result,
      error: help ? `${baseError} (${help})` : baseError,
    };
  }

  return result;
}
