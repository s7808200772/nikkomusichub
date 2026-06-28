import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listStores, getStore, isSupabaseConfigured } from '@/lib/db';
import { publishBatch, listCommands } from '@/lib/mqtt';
import { getJob, listRecentJobs } from '@/lib/jobs';

const VALID_COMMANDS = new Set(listCommands().map((c) => c.key));

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (jobId) {
    const job = getJob(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json({ job });
  }
  return NextResponse.json({ jobs: listRecentJobs() });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required for remote commands' }, { status: 503 });
  }

  const data = await request.json();
  const { storeIds, commandKey } = data || {};
  if (!Array.isArray(storeIds) || storeIds.length === 0) {
    return NextResponse.json({ error: 'storeIds array required' }, { status: 400 });
  }
  if (!VALID_COMMANDS.has(commandKey)) {
    return NextResponse.json({ error: 'Invalid commandKey' }, { status: 400 });
  }

  const stores = [];
  for (const id of storeIds) {
    const store = await getStore(id);
    if (store) stores.push(store);
  }
  if (stores.length === 0) {
    return NextResponse.json({ error: 'No valid stores found' }, { status: 404 });
  }

  const { jobId } = await publishBatch({ stores, commandKey });
  return NextResponse.json({ ok: true, jobId, total: stores.length });
}
