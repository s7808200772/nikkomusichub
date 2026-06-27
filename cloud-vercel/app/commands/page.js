import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores, isSupabaseConfigured, redactStore } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SupabaseWarning from '@/components/SupabaseWarning';
import CommandsClient from './CommandsClient';

export default async function CommandsPage() {
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
          <h1>遠端指令</h1>
          <p>對所有店點執行播放控制、同步、重啟等操作</p>
        </div>
        {!supabaseOk && <SupabaseWarning />}
        <CommandsClient initialStores={stores} supabaseOk={supabaseOk} />
      </main>
    </>
  );
}
