import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const USE_SUPABASE = SUPABASE_URL && SUPABASE_KEY;

export function isSupabaseConfigured() {
  return !!USE_SUPABASE;
}

const localDbPath = path.join(process.cwd(), '.nikko-cloud-db.json');

let supabase = null;
if (USE_SUPABASE) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function readLocalDb() {
  try {
    const raw = await fs.readFile(localDbPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { stores: [], settings: {} };
  }
}

async function writeLocalDb(data) {
  await fs.writeFile(localDbPath, JSON.stringify(data, null, 2), 'utf-8');
}

async function readStores() {
  if (!supabase) {
    const db = await readLocalDb();
    return db.stores || [];
  }
  const { data, error } = await supabase.from('stores').select('data');
  if (error) throw error;
  return (data || []).map((row) => row.data);
}

async function writeStore(store) {
  if (!supabase) {
    const db = await readLocalDb();
    const idx = db.stores.findIndex((s) => s.storeId === store.storeId);
    if (idx >= 0) db.stores[idx] = store;
    else db.stores.push(store);
    await writeLocalDb(db);
    return store;
  }
  const { error } = await supabase
    .from('stores')
    .upsert({ id: store.storeId, data: store }, { onConflict: 'id' });
  if (error) throw error;
  return store;
}

async function removeStore(storeId) {
  if (!supabase) {
    const db = await readLocalDb();
    db.stores = db.stores.filter((s) => s.storeId !== storeId);
    await writeLocalDb(db);
    return;
  }
  const { error } = await supabase.from('stores').delete().eq('id', storeId);
  if (error) throw error;
}

async function readSettings() {
  if (!supabase) {
    const db = await readLocalDb();
    return db.settings || {};
  }
  const { data, error } = await supabase.from('settings').select('data').eq('id', 'global').single();
  if (error) {
    if (error.code === 'PGRST116') return {};
    throw error;
  }
  return data?.data || {};
}

async function writeSettings(settings) {
  if (!supabase) {
    const db = await readLocalDb();
    db.settings = { ...(db.settings || {}), ...settings };
    await writeLocalDb(db);
    return db.settings;
  }
  const { error } = await supabase
    .from('settings')
    .upsert({ id: 'global', data: settings }, { onConflict: 'id' });
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
