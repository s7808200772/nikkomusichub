import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listStores, getStore, isSupabaseConfigured } from '@/lib/db';
import { publishCommandWithRetry } from '@/lib/mqtt';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const source = searchParams.get('source') || 'store';
  const stores = storeId ? [await getStore(storeId)].filter(Boolean) : await listStores();
  const commandKey = source === 'webdav' ? 'webdav_list_music' : 'library_list';

  const results = await Promise.all(
    stores.map(async (store) => {
      const result = await publishCommandWithRetry({
        broker: store.mqttBroker,
        port: store.mqttPort || (store.mqttTls === true ? 8883 : 1883),
        username: store.mqttUsername,
        password: store.mqttPassword,
        tls: store.mqttTls === true,
        tlsVerify: store.tlsVerify === true,
        storeId: store.storeId,
        commandKey,
        timeout: 30000,
        retries: 1,
      });
      return {
        storeId: store.storeId,
        storeName: store.storeName,
        ok: result.ok,
        error: result.error,
        data: result.parsed || result.result || null,
      };
    })
  );

  return NextResponse.json({ stores: results });
}
