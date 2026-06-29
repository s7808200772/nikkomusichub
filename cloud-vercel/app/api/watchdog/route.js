import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { publishCommandWithRetry, publishBatch } from '@/lib/mqtt';

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, storeId, storeIds, lines = 50 } = body || {};
  const validActions = ['install', 'disable', 'status', 'logs'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, { status: 400 });
  }

  const commandKey = `network_watchdog_${action}`;
  const isBulk = Array.isArray(storeIds) && storeIds.length > 0;

  try {
    if (isBulk) {
      const stores = [];
      for (const id of storeIds) {
        const store = await getStore(id);
        if (!store) continue;
        stores.push({
          storeId: store.storeId,
          mqttBroker: store.mqttBroker,
          mqttPort: store.mqttPort,
          mqttUsername: store.mqttUsername,
          mqttPassword: store.mqttPassword,
          mqttTls: store.mqttTls,
          tlsVerify: store.tlsVerify,
        });
      }
      if (stores.length === 0) {
        return NextResponse.json({ error: 'No valid stores found' }, { status: 404 });
      }
      const job = await publishBatch({ stores, commandKey, payload: { lines }, timeout: 45000 });
      return NextResponse.json({ ok: true, jobId: job.jobId, action, count: stores.length });
    }

    if (!storeId) {
      return NextResponse.json({ error: 'storeId or storeIds is required' }, { status: 400 });
    }
    const store = await getStore(storeId);
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const result = await publishCommandWithRetry({
      broker: store.mqttBroker,
      port: store.mqttPort || (store.mqttTls === true ? 8883 : 1883),
      username: store.mqttUsername,
      password: store.mqttPassword,
      tls: store.mqttTls === true,
      tlsVerify: store.tlsVerify === true,
      storeId: store.storeId,
      commandKey,
      payload: { lines },
      timeout: 45000,
      retries: 2,
    });

    return NextResponse.json({
      ok: result.ok,
      storeId: store.storeId,
      action,
      result: result.parsed || result.result || null,
      error: result.error || null,
      requestId: result.requestId,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Internal error' }, { status: 500 });
  }
}
