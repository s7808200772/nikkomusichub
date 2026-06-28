const SUPABASE_URL = process.env.SUPABASE_URL;
const PROXY_SECRET = process.env.NIKKO_SUPABASE_PROXY_SECRET;
const USE_SUPABASE = SUPABASE_URL && PROXY_SECRET;
const DATABASE_ENDPOINT = `${SUPABASE_URL}/functions/v1/nikko-cloud-db`;

export function isSupabaseConfigured() {
  return !!USE_SUPABASE;
}

export function requireSupabase() {
  if (!USE_SUPABASE) {
    throw new Error('Supabase database proxy is not configured');
  }
}

export function redactStore(store) {
  const { mqttPassword: _mqttPassword, ...safe } = store;
  return { ...safe, mqttPassword: store.mqttPassword ? '***' : '' };
}

async function databaseRequest(action, payload = {}) {
  if (!USE_SUPABASE) {
    throw new Error('Supabase database proxy is not configured');
  }
  const response = await fetch(DATABASE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nikko-secret': PROXY_SECRET,
    },
    body: JSON.stringify({ action, ...payload }),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Supabase request failed (${response.status})`);
  return result.data;
}

async function readStores() {
  if (!USE_SUPABASE) return [];
  return (await databaseRequest('listStores')) || [];
}

async function writeStore(store) {
  requireSupabase();
  await databaseRequest('saveStore', { store });
  return store;
}

async function removeStore(storeId) {
  requireSupabase();
  await databaseRequest('deleteStore', { storeId });
}

async function readSettings() {
  if (!USE_SUPABASE) return {};
  return (await databaseRequest('getSettings')) || {};
}

async function writeSettings(settings) {
  requireSupabase();
  await databaseRequest('saveSettings', { settings });
  return settings;
}

export async function listStores() {
  return await readStores();
}

export async function getStore(storeId) {
  if (!USE_SUPABASE) return null;
  return await databaseRequest('getStore', { storeId });
}

export async function saveStore(store) {
  return await writeStore(store);
}

export async function deleteStore(storeId) {
  await removeStore(storeId);
}

export async function getSettings() {
  return await readSettings();
}

export async function saveSettings(settings) {
  return await writeSettings(settings);
}

export async function listAlerts(limit = 50) {
  if (!USE_SUPABASE) return [];
  return (await databaseRequest('listAlerts', { limit })) || [];
}

export async function createAlert(alert) {
  requireSupabase();
  return await databaseRequest('createAlert', { alert });
}

export async function acknowledgeAlert(alertId) {
  requireSupabase();
  return await databaseRequest('acknowledgeAlert', { alertId });
}
