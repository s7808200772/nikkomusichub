import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores, isSupabaseConfigured, redactStore } from '@/lib/db';
import SupabaseWarning from '@/components/SupabaseWarning';
import DashboardClient from './DashboardClient';
import CommandsClient from './commands/CommandsClient';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('__Host-nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const stores = (await listStores()).map(redactStore);
  const supabaseOk = isSupabaseConfigured();
  return (
    <main className="container">
      <div className="page-header">
        <h1>總覽控制台</h1>
        <p>即時掌握所有店點狀態，並直接下達遠端指令</p>
      </div>
      {!supabaseOk && <SupabaseWarning />}
      <DashboardClient initialStores={stores} supabaseOk={supabaseOk}>
        <CommandsClient initialStores={stores} supabaseOk={supabaseOk} />
      </DashboardClient>
    </main>
  );
}
