import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getSettings, isSupabaseConfigured } from '@/lib/db';
import Navbar from '@/components/Navbar';
import SupabaseWarning from '@/components/SupabaseWarning';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token || !(await verifyToken(token))) {
    redirect('/login');
  }
  const settings = await getSettings();
  const supabaseOk = isSupabaseConfigured();
  return (
    <>
      <Navbar />
      <main className="container">
        <div className="page-header">
          <h1>設定</h1>
          <p>設定 MQTT broker 等全域參數</p>
        </div>
        {!supabaseOk && <SupabaseWarning />}
        <SettingsClient initialSettings={settings} supabaseOk={supabaseOk} />
      </main>
    </>
  );
}
