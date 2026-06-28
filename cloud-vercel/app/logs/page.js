import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores, isSupabaseConfigured, redactStore } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SupabaseWarning from '@/components/SupabaseWarning';
import LogsClient from './LogsClient';

export default async function LogsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const stores = (await listStores()).map(redactStore);
  const supabaseOk = isSupabaseConfigured();
  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-header">
          <h1>遠端 Log</h1>
          <p>查看各店最近 player / sync / system log</p>
        </div>
        {!supabaseOk && <SupabaseWarning />}
        <LogsClient initialStores={stores} supabaseOk={supabaseOk} />
      </main>
    </>
  );
}
