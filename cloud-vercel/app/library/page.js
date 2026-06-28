import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores, isSupabaseConfigured, redactStore } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SupabaseWarning from '@/components/SupabaseWarning';
import LibraryClient from './LibraryClient';

export default async function LibraryPage() {
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
          <h1>中央音樂庫</h1>
          <p>查看各店音樂檔案並一鍵觸發同步</p>
        </div>
        {!supabaseOk && <SupabaseWarning />}
        <LibraryClient initialStores={stores} supabaseOk={supabaseOk} />
      </main>
    </>
  );
}
