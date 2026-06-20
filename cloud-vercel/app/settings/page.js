import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const settings = await getSettings();
  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-header">
          <h1>設定</h1>
          <p>設定 Dropbox 與音樂目錄等全域參數</p>
        </div>
        <SettingsClient initialSettings={settings} />
      </main>
    </>
  );
}
