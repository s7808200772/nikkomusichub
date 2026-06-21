import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSettings, saveSettings } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await request.json();
  const settings = {
    defaultMqttBroker: data.defaultMqttBroker?.trim() || '',
    defaultMqttPort: data.defaultMqttPort ? parseInt(data.defaultMqttPort, 10) : '',
  };
  await saveSettings(settings);
  return NextResponse.json({ settings });
}
