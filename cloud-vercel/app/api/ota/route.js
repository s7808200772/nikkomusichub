import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore, createUpdateLog, finishUpdateLog, listUpdateLogs, isSupabaseConfigured } from '@/lib/db';
import { publishCommandWithRetry } from '@/lib/mqtt';
import { createJob, getJob, updateStoreResult } from '@/lib/jobs';

const OTA_TIMEOUT_MS = 120000;

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

  const job = createJob([storeId], action);

  // Run the long-running OTA command in the background so the API can return
  // immediately with a jobId. Clients poll GET /api/ota?jobId=<id> for status.
  (async () => {
    updateStoreResult(job.id, storeId, 'pending', null, null);
    const result = await publishCommandWithRetry({
      broker: store.mqttBroker,
      port: store.mqttPort || (store.mqttTls === true ? 8883 : 1883),
      username: store.mqttUsername,
      password: store.mqttPassword,
      tls: store.mqttTls === true,
      tlsVerify: store.tlsVerify === true,
      storeId: store.storeId,
      commandKey: action,
      timeout: OTA_TIMEOUT_MS,
      retries: 1,
    });

    if (result.ok) {
      updateStoreResult(job.id, storeId, 'success', result.parsed || result.result || null, null);
    } else if (/timeout|no response|waiting for response/i.test(result.error || '')) {
      updateStoreResult(job.id, storeId, 'no_response', null, result.error);
    } else {
      updateStoreResult(job.id, storeId, 'failed', null, result.error);
    }

    await finishUpdateLog(log.id, {
      status: result.ok ? 'success' : 'failed',
      versionAfter: result.parsed?.git?.commit || result.parsed?.version || '',
      error: result.error || '',
    });
  })().catch(() => {});

  return NextResponse.json({ ok: true, jobId: job.id, logId: log.id });
}

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (jobId) {
    const job = getJob(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json({ job });
  }

  const logs = await listUpdateLogs();
  return NextResponse.json({ logs });
}
