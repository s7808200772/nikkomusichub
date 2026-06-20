import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listStores, getStore, saveStore, deleteStore } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const stores = await listStores();
  const safe = stores.map((s) => ({ ...s, sshPassword: '***' }));
  return NextResponse.json({ stores: safe });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await request.json();
  const store = {
    storeId: data.storeId?.trim(),
    storeName: data.storeName?.trim(),
    tailscaleIp: data.tailscaleIp?.trim(),
    sshPort: parseInt(data.sshPort || '22', 10),
    sshUsername: data.sshUsername?.trim() || 'pi',
    sshPassword: data.sshPassword?.trim(),
  };
  if (!store.storeId || !store.storeName || !store.tailscaleIp || !store.sshPassword) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const existing = await getStore(store.storeId);
  if (existing) {
    return NextResponse.json({ error: 'storeId already exists' }, { status: 400 });
  }
  await saveStore(store);
  return NextResponse.json({ ...store, sshPassword: '***' });
}

export async function PUT(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await request.json();
  const existing = await getStore(data.storeId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = { ...existing };
  ['storeName', 'tailscaleIp', 'sshPort', 'sshUsername', 'sshPassword'].forEach((k) => {
    if (data[k] === undefined) return;
    if (k === 'sshPort') {
      updated[k] = parseInt(data[k], 10);
    } else if (k === 'sshPassword') {
      const v = data[k]?.trim();
      if (v) updated[k] = v;
    } else {
      updated[k] = data[k]?.trim();
    }
  });
  await saveStore(updated);
  return NextResponse.json({ ...updated, sshPassword: '***' });
}

export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  await deleteStore(storeId);
  return NextResponse.json({ ok: true });
}
