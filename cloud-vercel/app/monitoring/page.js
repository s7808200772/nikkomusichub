import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listAlerts, listStores, listUpdateLogs, isSupabaseConfigured, redactStore } from '@/lib/db';

import SupabaseWarning from '@/components/SupabaseWarning';
import MonitoringClient from './MonitoringClient';

export default async function MonitoringPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }

  const alerts = await listAlerts(200);
  const stores = (await listStores()).map(redactStore);
  const logs = await listUpdateLogs(50);
  const supabaseOk = isSupabaseConfigured();

  return (
    <main className="container">
      <div className="page-header">
        <h1>監控與紀錄</h1>
        <p>查看告警中心、各店遠端 Log 與 OTA 更新紀錄</p>
      </div>
      {!supabaseOk && <SupabaseWarning />}
      <MonitoringClient initialAlerts={alerts} initialStores={stores} initialLogs={logs} supabaseOk={supabaseOk} />
    </main>
  );
}
