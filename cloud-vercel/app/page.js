import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { listStores } from '@/lib/db';
import Navbar from '@/components/Navbar';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
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
          <h1>中央 Dashboard</h1>
          <p>即時掌握所有店點狀態</p>
        </div>
        <DashboardClient initialStores={stores} />
      </main>
    </>
  );
}
