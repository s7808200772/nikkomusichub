import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores, isSupabaseConfigured, redactStore, listUpdateLogs } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SupabaseWarning from '@/components/SupabaseWarning';
import OtaClient from './OtaClient';

export default async function OtaPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const stores = (await listStores()).map(redactStore);
  const logs = await listUpdateLogs(50);
  const supabaseOk = isSupabaseConfigured();
  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-header">
          <h1>OTA 更新</h1>
          <p>遠端更新 Raspberry Pi 程式與Rollback</p>
        </div>
        {!supabaseOk && <SupabaseWarning />}
        <OtaClient initialStores={stores} initialLogs={logs} supabaseOk={supabaseOk} />
      </main>
    </>
  );
}
