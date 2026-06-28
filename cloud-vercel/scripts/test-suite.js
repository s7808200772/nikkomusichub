#!/usr/bin/env node
/* Cloud self-test runner.
 * Usage: node scripts/test-suite.js [--json]
 */
const required = [
  'NIKKO_CLOUD_SECRET',
  'SUPABASE_URL',
  'NIKKO_SUPABASE_PROXY_SECRET',
  'NIKKO_MQTT_COMMAND_SECRET',
];

function check(name, ok, detail = '') {
  return { name, ok, detail };
}

async function main() {
  const json = process.argv.includes('--json');
  const results = [];

  for (const key of required) {
    const ok = Boolean(process.env[key]);
    results.push(check(`01. env ${key}`, ok, ok ? '已設定' : '未設定'));
  }

  let stores = [];
  try {
    const { listStores, isSupabaseConfigured } = await import('../lib/db.js');
    results.push(check('02. Supabase 已設定', isSupabaseConfigured()));
    stores = await listStores();
    results.push(check('03. 可讀取 stores', true, `${stores.length} 家店點`));
  } catch (e) {
    results.push(check('03. 可讀取 stores', false, e.message));
  }

  const passed = results.filter((r) => r.ok).length;
  const allOk = passed === results.length;

  if (json) {
    console.log(JSON.stringify({ ok: allOk, passed, total: results.length, results }, null, 2));
  } else {
    console.log(`\nNikkoMusicHub Cloud Self-Test: ${passed}/${results.length} passed\n`);
    for (const r of results) {
      const mark = r.ok ? '✅' : '❌';
      const detail = r.detail ? ` (${r.detail})` : '';
      console.log(`${mark} ${r.name}${detail}`);
    }
    console.log();
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
