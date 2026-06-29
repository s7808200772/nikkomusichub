import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore, isSupabaseConfigured } from '@/lib/db';
import { publishCommandWithRetry } from '@/lib/mqtt';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const logType = searchParams.get('type') || 'system';
  const lines = Math.min(parseInt(searchParams.get('lines') || '100', 10), 500);

  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  }
  const store = await getStore(storeId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const result = await publishCommandWithRetry({
    broker: store.mqttBroker,
    port: store.mqttPort || (store.mqttTls === true ? 8883 : 1883),
    username: store.mqttUsername,
    password: store.mqttPassword,
    tls: store.mqttTls === true,
    tlsVerify: store.tlsVerify === true,
    storeId: store.storeId,
    commandKey: 'get_log',
    timeout: 15000,
    retries: 1,
  });

  return NextResponse.json({
    storeId,
    ok: result.ok,
    error: result.error,
    data: result.parsed || result.result || null,
  });
}
