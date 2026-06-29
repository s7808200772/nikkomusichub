import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSettings, saveSettings, isSupabaseConfigured } from '@/lib/db';

const DEFAULT_SETTINGS = {
  defaultMqttBroker: '114.55.1.51',
  defaultMqttPort: 1883,
  defaultMqttUsername: 'admin',
  defaultMqttPassword: 'topup30%off',
  defaultMqttTls: false,
  defaultMqttTlsVerify: false,
  webdavUrl: 'http://100.106.208.65:5005/',
  webdavRemotePath: '/NikkoMusic',
  webdavUsername: '',
  webdavPassword: '',
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }
  const settings = await getSettings();
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  // Treat empty strings as defaults for core fields so the UI shows white pre-filled values.
  ['defaultMqttBroker', 'defaultMqttPort', 'defaultMqttUsername', 'defaultMqttPassword', 'webdavUrl', 'webdavRemotePath'].forEach((k) => {
    if (!merged[k]) merged[k] = DEFAULT_SETTINGS[k];
  });
  return NextResponse.json({ settings: merged });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }
  const data = await request.json();
  const settings = {
    defaultMqttBroker: data.defaultMqttBroker?.trim() || '',
    defaultMqttPort: data.defaultMqttPort ? parseInt(data.defaultMqttPort, 10) : '',
    defaultMqttUsername: data.defaultMqttUsername?.trim() || '',
    defaultMqttPassword: data.defaultMqttPassword || '',
    defaultMqttTls: data.defaultMqttTls === true,
    defaultMqttTlsVerify: data.defaultMqttTlsVerify === true,
    webdavUrl: data.webdavUrl?.trim() || '',
    webdavRemotePath: data.webdavRemotePath?.trim() || '',
    webdavUsername: data.webdavUsername?.trim() || '',
    webdavPassword: data.webdavPassword || '',
  };
  await saveSettings(settings);
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  ['defaultMqttBroker', 'defaultMqttPort', 'defaultMqttUsername', 'defaultMqttPassword', 'webdavUrl', 'webdavRemotePath'].forEach((k) => {
    if (!merged[k]) merged[k] = DEFAULT_SETTINGS[k];
  });
  return NextResponse.json({ settings: merged });
}
