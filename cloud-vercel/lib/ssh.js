import { Client } from 'ssh2';

const REMOTE_COMMANDS = {
  status_dashboard: {
    label: '取得 Dashboard 狀態',
    cmd: () => `curl -s http://localhost:8080/api/dashboard`,
  },
  status_system: {
    label: '取得系統資訊',
    cmd: () => `curl -s http://localhost:8080/api/system/info`,
  },
  status_player: {
    label: '取得播放狀態',
    cmd: () => `curl -s http://localhost:8080/api/player/status`,
  },
  player_play: {
    label: '開始播放',
    cmd: () => `curl -s -X POST http://localhost:8080/api/player/play`,
  },
  player_pause: {
    label: '暫停',
    cmd: () => `curl -s -X POST http://localhost:8080/api/player/pause`,
  },
  player_resume: {
    label: '繼續',
    cmd: () => `curl -s -X POST http://localhost:8080/api/player/resume`,
  },
  player_next: {
    label: '下一首',
    cmd: () => `curl -s -X POST http://localhost:8080/api/player/next`,
  },
  sync: {
    label: '手動同步 Dropbox',
    cmd: () => `curl -s -X POST http://localhost:8080/api/dropbox/sync`,
  },
  rescan: {
    label: '重新掃描音樂',
    cmd: () => `curl -s -X POST http://localhost:8080/api/system/rescan`,
  },
  restart_player: {
    label: '重啟播放服務',
    cmd: () => 'sudo systemctl restart nikko-music-player.service',
  },
  reboot: {
    label: '重開機 Raspberry Pi',
    cmd: () => 'sudo reboot',
  },
};

export function listCommands() {
  return Object.entries(REMOTE_COMMANDS).map(([key, val]) => ({ key, label: val.label }));
}

export function getCommand(key) {
  if (!REMOTE_COMMANDS[key]) return null;
  return REMOTE_COMMANDS[key].cmd();
}

function finish(resolve, result, timer, conn, finishedRef) {
  clearTimeout(timer);
  if (!finishedRef.current) {
    finishedRef.current = true;
    try { conn.end(); } catch {}
    resolve(result);
  }
}

function createDebugLogger() {
  const lines = [];
  return {
    log: (msg) => {
      const line = typeof msg === 'string' ? msg : JSON.stringify(msg);
      lines.push(line);
    },
    getLines: () => lines,
  };
}

function baseConnectOptions({ host, port, username, password, timeout, debug }) {
  return {
    host,
    port: port || 22,
    username,
    password,
    readyTimeout: timeout,
    // Force IPv4 to avoid Node.js trying IPv6 first and timing out on mixed networks
    family: 4,
    // Allow both password and keyboard-interactive password prompts
    tryKeyboard: true,
    // Capture handshake debug info
    debug,
  };
}

export function runSSH({ host, port, username, password, command, timeout = 20000 }) {
  return new Promise((resolve) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    const finished = { current: false };
    let stage = 'connecting';
    const debugLog = createDebugLogger();

    const timer = setTimeout(() => {
      finish(resolve, {
        ok: false,
        error: `SSH timeout at stage: ${stage}`,
        stage,
        stdout,
        stderr,
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    }, timeout);

    conn.on('ready', () => {
      stage = 'exec';
      conn.exec(command, (err, stream) => {
        if (err) {
          return finish(resolve, {
            ok: false,
            error: `Exec error: ${err.message}`,
            stage,
            stdout,
            stderr,
            debug: debugLog.getLines(),
          }, timer, conn, finished);
        }
        stream
          .on('close', (code) => {
            finish(resolve, {
              ok: code === 0,
              returncode: code,
              stage: 'done',
              stdout,
              stderr,
              debug: debugLog.getLines(),
            }, timer, conn, finished);
          })
          .on('data', (data) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data) => {
            stderr += data.toString();
          });
      });
    });

    conn.on('error', (err) => {
      finish(resolve, {
        ok: false,
        error: err.message,
        stage,
        stdout,
        stderr,
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    });

    conn.on('banner', () => { stage = 'banner'; });
    conn.on('authentication', () => { stage = 'authentication'; });
    conn.on('handshake', () => { stage = 'handshake'; });

    try {
      conn.connect(baseConnectOptions({ host, port, username, password, timeout, debug: debugLog.log }));
    } catch (err) {
      finish(resolve, {
        ok: false,
        error: `Connect exception: ${err.message}`,
        stage,
        stdout,
        stderr,
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    }
  });
}

export function testSSH({ host, port, username, password, timeout = 20000 }) {
  return new Promise((resolve) => {
    const conn = new Client();
    const finished = { current: false };
    let stage = 'connecting';
    const debugLog = createDebugLogger();

    const timer = setTimeout(() => {
      finish(resolve, {
        ok: false,
        error: `SSH connection timeout at stage: ${stage}`,
        stage,
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    }, timeout);

    conn.on('ready', () => {
      finish(resolve, {
        ok: true,
        stage: 'ready',
        message: 'SSH connection established successfully',
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    });

    conn.on('error', (err) => {
      finish(resolve, {
        ok: false,
        error: err.message,
        stage,
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    });

    conn.on('banner', () => { stage = 'banner'; });
    conn.on('authentication', () => { stage = 'authentication'; });
    conn.on('handshake', () => { stage = 'handshake'; });

    try {
      conn.connect(baseConnectOptions({ host, port, username, password, timeout, debug: debugLog.log }));
    } catch (err) {
      finish(resolve, {
        ok: false,
        error: `Connect exception: ${err.message}`,
        stage,
        debug: debugLog.getLines(),
      }, timer, conn, finished);
    }
  });
}
