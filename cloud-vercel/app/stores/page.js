import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores } from '@/lib/db';
import Navbar from '@/components/Navbar';
import StoresClient from './StoresClient';

export default async function StoresPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const stores = await listStores();
  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-header">
          <h1>店點管理</h1>
          <p>新增與管理各店 Raspberry Pi 連線資訊</p>
        </div>
        <StoresClient initialStores={stores} />
      </main>
    </>
  );
}
