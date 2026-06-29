import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore, createUpdateLog, finishUpdateLog, listUpdateLogs, isSupabaseConfigured } from '@/lib/db';
import { publishCommandWithRetry } from '@/lib/mqtt';

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }

  const data = await request.json();
  const { storeId, action = 'ota_update' } = data || {};
  if (!storeId || !['ota_update', 'rollback'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const store = await getStore(storeId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const log = await createUpdateLog({
    storeId,
    action,
    status: 'started',
  });

  const result = await publishCommandWithRetry({
    broker: store.mqttBroker,
    port: store.mqttPort || (store.mqttTls === true ? 8883 : 1883),
    username: store.mqttUsername,
    password: store.mqttPassword,
    tls: store.mqttTls === true,
    tlsVerify: store.tlsVerify === true,
    storeId: store.storeId,
    commandKey: action,
    timeout: 20000,
    retries: 1,
  });

  await finishUpdateLog(log.id, {
    status: result.ok ? 'success' : 'failed',
    versionAfter: result.parsed?.git?.commit || '',
    error: result.error || '',
  });

  return NextResponse.json({ ok: result.ok, error: result.error, logId: log.id });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }
  const logs = await listUpdateLogs();
  return NextResponse.json({ logs });
}
