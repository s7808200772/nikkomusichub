import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listStores, isSupabaseConfigured } from '@/lib/db';

function check(name, ok, detail = '') {
  return { name, ok, detail };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = [];

  const required = [
    'NIKKO_CLOUD_SECRET',
    'SUPABASE_URL',
    'NIKKO_SUPABASE_PROXY_SECRET',
    'NIKKO_MQTT_COMMAND_SECRET',
  ];
  for (const key of required) {
    const ok = Boolean(process.env[key]);
    results.push(check(`01. env ${key}`, ok, ok ? '已設定' : '未設定'));
  }

  results.push(check('02. Supabase 已設定', isSupabaseConfigured()));

  try {
    const stores = await listStores();
    results.push(check('03. 可讀取 stores', true, `${stores.length} 家店點`));
  } catch (e) {
    results.push(check('03. 可讀取 stores', false, e.message));
  }

  const passed = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: passed === results.length,
    passed,
    total: results.length,
    results,
  });
}
