import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores, isSupabaseConfigured, redactStore, listUpdateLogs, getSettings } from '@/lib/db';

import SupabaseWarning from '@/components/SupabaseWarning';
import StoresHubClient from './StoresHubClient';

export default async function StoresPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const supabaseOk = isSupabaseConfigured();
  const stores = (await listStores()).map(redactStore);
  const logs = await listUpdateLogs(50);
  const settings = await getSettings();

  return (
    <main className="container">
      <div className="page-header">
        <h1>店點管理</h1>
        <p>管理店點、音樂庫、OTA 更新與 MQTT Broker 設定</p>
      </div>
      {!supabaseOk && <SupabaseWarning />}
      <StoresHubClient
        initialStores={stores}
        initialLogs={logs}
        initialSettings={settings}
        supabaseOk={supabaseOk}
      />
    </main>
  );
}
