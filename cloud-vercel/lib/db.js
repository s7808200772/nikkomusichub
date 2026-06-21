import { kv } from '@vercel/kv';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const USE_KV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// Use project-local file for local dev so data persists across restarts.
// On Vercel /tmp is ephemeral per function instance, so KV is required for production persistence.
const isVercel = process.env.VERCEL === '1';
const localDbPath = isVercel
  ? path.join(os.tmpdir(), 'nikko-cloud-local-db.json')
  : path.join(process.cwd(), '.nikko-cloud-db.json');

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

function getStoreKey(storeId) {
  return `nikko:store:${storeId}`;
}

export async function listStores() {
  if (USE_KV) {
    const ids = (await kv.get('nikko:store_ids')) || [];
    const stores = [];
    for (const id of ids) {
      const s = await kv.get(getStoreKey(id));
      if (s) stores.push(s);
    }
    return stores;
  }
  const db = await readLocalDb();
  return db.stores;
}

export async function getStore(storeId) {
  if (USE_KV) {
    return await kv.get(getStoreKey(storeId));
  }
  const db = await readLocalDb();
  return db.stores.find((s) => s.storeId === storeId) || null;
}

export async function saveStore(store) {
  if (USE_KV) {
    const ids = new Set((await kv.get('nikko:store_ids')) || []);
    ids.add(store.storeId);
    await kv.set('nikko:store_ids', Array.from(ids));
    await kv.set(getStoreKey(store.storeId), store);
    return store;
  }
  const db = await readLocalDb();
  const idx = db.stores.findIndex((s) => s.storeId === store.storeId);
  if (idx >= 0) db.stores[idx] = store;
  else db.stores.push(store);
  await writeLocalDb(db);
  return store;
}

export async function deleteStore(storeId) {
  if (USE_KV) {
    const ids = new Set((await kv.get('nikko:store_ids')) || []);
    ids.delete(storeId);
    await kv.set('nikko:store_ids', Array.from(ids));
    await kv.del(getStoreKey(storeId));
    return;
  }
  const db = await readLocalDb();
  db.stores = db.stores.filter((s) => s.storeId !== storeId);
  await writeLocalDb(db);
}

export async function getSettings() {
  if (USE_KV) {
    return (await kv.get('nikko:settings')) || {};
  }
  const db = await readLocalDb();
  return db.settings || {};
}

export async function saveSettings(settings) {
  if (USE_KV) {
    await kv.set('nikko:settings', settings);
    return settings;
  }
  const db = await readLocalDb();
  db.settings = { ...(db.settings || {}), ...settings };
  await writeLocalDb(db);
  return db.settings;
}
