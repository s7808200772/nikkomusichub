import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listStores, getStore, saveStore, deleteStore, isSupabaseConfigured } from '@/lib/db';

const SENSITIVE = ['mqttPassword'];

function sanitize(store) {
  const copy = { ...store };
  SENSITIVE.forEach((k) => {
    if (copy[k]) copy[k] = '***';
  });
  return copy;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }
  const stores = await listStores();
  return NextResponse.json({ stores: stores.map(sanitize) });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  const data = await request.json();
  const store = {
    storeId: data.storeId?.trim(),
    storeName: data.storeName?.trim(),
    mqttBroker: data.mqttBroker?.trim() || 'broker.hivemq.com',
    mqttPort: parseInt(data.mqttPort || '8883', 10),
    mqttUsername: data.mqttUsername?.trim() || '',
    mqttPassword: data.mqttPassword?.trim() || '',
    mqttTls: data.mqttTls !== false,
  };
  if (!store.storeId || !store.storeName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const existing = await getStore(store.storeId);
  if (existing) {
    return NextResponse.json({ error: 'storeId already exists' }, { status: 400 });
  }
  await saveStore(store);
  return NextResponse.json(sanitize(store));
}

export async function PUT(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  const data = await request.json();
  const existing = await getStore(data.storeId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = { ...existing };
  ['storeName', 'mqttBroker', 'mqttPort', 'mqttUsername', 'mqttPassword', 'mqttTls'].forEach((k) => {
    if (data[k] === undefined) return;
    if (k === 'mqttPort') updated[k] = parseInt(data[k], 10);
    else if (k === 'mqttPassword') {
      const v = data[k]?.trim();
      if (v) updated[k] = v;
    } else if (k === 'mqttTls') {
      updated[k] = data[k] !== false;
    } else {
      updated[k] = data[k]?.trim();
    }
  });
  await saveStore(updated);
  return NextResponse.json(sanitize(updated));
}

export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  await deleteStore(storeId);
  return NextResponse.json({ ok: true });
}
