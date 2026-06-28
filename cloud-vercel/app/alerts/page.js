import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listAlerts, isSupabaseConfigured } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SupabaseWarning from '@/components/SupabaseWarning';
import AlertsClient from './AlertsClient';

export default async function AlertsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const alerts = await listAlerts(200);
  const supabaseOk = isSupabaseConfigured();
  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-header">
          <h1>告警中心</h1>
          <p>查看與確認各店異常狀態</p>
        </div>
        {!supabaseOk && <SupabaseWarning />}
        <AlertsClient initialAlerts={alerts} supabaseOk={supabaseOk} />
      </main>
    </>
  );
}
