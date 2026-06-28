const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_USER_ID = process.env.LINE_USER_ID || '';
const WEBHOOK_URL = process.env.NIKKO_WEBHOOK_URL || '';

export async function sendLinePush(message) {
  if (!LINE_TOKEN || !LINE_USER_ID) return { ok: false, skipped: true, reason: 'LINE not configured' };
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_USER_ID,
        messages: [{ type: 'text', text: message }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendWebhook(payload) {
  if (!WEBHOOK_URL) return { ok: false, skipped: true, reason: 'Webhook URL not configured' };
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function notifyAlert(alert) {
  const text = `【NikkoMusicHub 告警】\n店點：${alert.storeId}\n等級：${alert.severity}\n類型：${alert.type}\n內容：${alert.message}`;
  const results = await Promise.all([sendLinePush(text), sendWebhook({ event: 'alert', alert })]);
  return { line: results[0], webhook: results[1] };
}
