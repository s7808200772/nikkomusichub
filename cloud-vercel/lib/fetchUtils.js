export function humanizeCommandError(error, timeoutMs) {
  if (!error) return '發生未知錯誤';
  const text = String(error);
  if (/timeout|timed out|waiting for response/i.test(text)) {
    return `操作失敗：無法連線到 Pi。可能原因：Pi 離線、Tailscale 未連線。技術訊息：${text}${timeoutMs ? `（timeout after ${timeoutMs}ms）` : ''}`;
  }
  if (/ECONNREFUSED|connection refused|not authorized|bad auth/i.test(text)) {
    return `操作失敗：無法連線到 MQTT broker。請確認 broker 位址、port、TLS 與帳號密碼是否正確。技術訊息：${text}`;
  }
  if (/not allowed|forbidden|unauthorized/i.test(text)) {
    return `操作失敗：權限不足。技術訊息：${text}`;
  }
  return `操作失敗：${text}`;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error(`timeout after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}
