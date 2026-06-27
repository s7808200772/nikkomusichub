import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SUPABASE = SUPABASE_URL && SUPABASE_KEY;

export function isSupabaseConfigured() {
  return !!USE_SUPABASE;
}

export function redactStore(store) {
  const { mqttPassword: _mqttPassword, ...safe } = store;
  return { ...safe, mqttPassword: store.mqttPassword ? '***' : '' };
}

let supabaseClient = null;

function getSupabase() {
  if (!USE_SUPABASE) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

async function readStores() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('stores').select('data');
  if (error) throw error;
  return (data || []).map((row) => row.data);
}

async function writeStore(store) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is required for server-side store persistence');
  }
  const { error } = await supabase
    .from('stores')
    .upsert({ id: store.storeId, data: store, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
  return store;
}

async function removeStore(storeId) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is required for server-side store persistence');
  }
  const { error } = await supabase.from('stores').delete().eq('id', storeId);
  if (error) throw error;
}

async function readSettings() {
  const supabase = getSupabase();
  if (!supabase) return {};
  const { data, error } = await supabase.from('settings').select('data').eq('id', 'global').single();
  if (error) {
    if (error.code === 'PGRST116') return {};
    throw error;
  }
  return data?.data || {};
}

async function writeSettings(settings) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase is required for server-side settings persistence');
  }
  const { error } = await supabase
    .from('settings')
    .upsert({ id: 'global', data: settings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
  return settings;
}

export async function listStores() {
  return await readStores();
}

export async function getStore(storeId) {
  const stores = await readStores();
  return stores.find((s) => s.storeId === storeId) || null;
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
