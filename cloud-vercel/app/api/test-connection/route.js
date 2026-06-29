import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore, isSupabaseConfigured } from '@/lib/db';
import { testMQTT } from '@/lib/mqtt';

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required for connection tests' }, { status: 503 });
  }

  const data = await request.json();
  const store = await getStore(data.storeId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const result = await testMQTT({
    broker: store.mqttBroker,
    port: store.mqttPort || (store.mqttTls ? 8883 : 1883),
    username: store.mqttUsername,
    password: store.mqttPassword,
    tls: store.mqttTls === true,
    tlsVerify: store.tlsVerify === true,
    storeId: store.storeId,
    timeout: 15000,
  });

  return NextResponse.json({
    ok: result.ok,
    storeId: store.storeId,
    error: result.error || null,
    result: result.result || null,
    requestId: result.requestId,
  });
}
