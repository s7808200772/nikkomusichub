import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore, isSupabaseConfigured } from '@/lib/db';
import { publishCommand, listCommands } from '@/lib/mqtt';
import { evaluateStoreStatus } from '@/lib/alertRules';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required for remote commands' }, { status: 503 });
  }
  return NextResponse.json({ commands: listCommands() });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await request.json();
  const store = await getStore(data.storeId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const result = await publishCommand({
    broker: store.mqttBroker,
    port: store.mqttPort,
    username: store.mqttUsername,
    password: store.mqttPassword,
    tls: store.mqttTls !== false,
    tlsVerify: store.tlsVerify !== false,
    storeId: store.storeId,
    commandKey: data.commandKey,
    timeout: 25000,
  });

  // Evaluate alert rules on status checks in the background.
  if (data.commandKey && data.commandKey.startsWith('status_')) {
    evaluateStoreStatus(store, result).catch(() => {});
  }

  return NextResponse.json(result);
}
