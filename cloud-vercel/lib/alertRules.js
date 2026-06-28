import { createAlert } from './db.js';
import { notifyAlert } from './line.js';

// Keep the last known online timestamp per store to avoid alert spam.
const LAST_SEEN = new Map();
const OFFLINE_THRESHOLD_MS = 90_000;

export async function evaluateStoreStatus(store, result) {
  const storeId = store.storeId;
  const now = Date.now();
  const alerts = [];

  if (result.ok) {
    LAST_SEEN.set(storeId, now);
    const dash = result.parsed || result.result || {};

    // Disk low
    if (dash.disk && dash.disk.percent > 90) {
      alerts.push({
        storeId,
        severity: 'critical',
        type: 'disk_low',
        message: `磁碟使用率 ${dash.disk.percent}%（剩餘 ${dash.disk.free_gb} GB）`,
        details: { disk: dash.disk },
      });
    }

    // Sync failed
    if (dash.last_sync_status === 'failed') {
      alerts.push({
        storeId,
        severity: 'warning',
        type: 'sync_failed',
        message: dash.last_sync_message || '最近同步失敗',
        details: { last_sync_at: dash.last_sync_at },
      });
    }

    // Player down when service should be active
    if (dash.player_service_status && dash.player_service_status !== 'active' && dash.player_status !== 'playing') {
      alerts.push({
        storeId,
        severity: 'warning',
        type: 'player_down',
        message: `播放服務狀態為 ${dash.player_service_status}，播放器未運行`,
        details: { player_status: dash.player_status },
      });
    }
  } else {
    const lastSeen = LAST_SEEN.get(storeId) || 0;
    if (now - lastSeen > OFFLINE_THRESHOLD_MS) {
      alerts.push({
        storeId,
        severity: 'offline',
        type: 'offline',
        message: result.error || '無法取得店點狀態，已超過 90 秒無回應',
        details: { lastSeen },
      });
    }
  }

  for (const alert of alerts) {
    try {
      const created = await createAlert(alert);
      await notifyAlert({ ...alert, id: created?.id });
    } catch (err) {
      // Alert creation must not break status responses.
      console.error('Failed to create/notify alert:', err);
    }
  }

  return alerts;
}
