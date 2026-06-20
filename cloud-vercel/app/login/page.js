import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (token && (await verifyToken(token))) {
    redirect('/');
  }
  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>☁️</div>
          <h1>NikkoMusicHub Cloud</h1>
          <p className="subtitle">中央店點管理平台</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
