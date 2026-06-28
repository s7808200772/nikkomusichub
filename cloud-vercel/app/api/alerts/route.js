import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listAlerts, acknowledgeAlert, isSupabaseConfigured } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }
  const alerts = await listAlerts(100);
  return NextResponse.json({ alerts });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is required' }, { status: 503 });
  }
  const data = await request.json();
  if (!data.alertId) {
    return NextResponse.json({ error: 'Missing alertId' }, { status: 400 });
  }
  const updated = await acknowledgeAlert(data.alertId);
  return NextResponse.json({ ok: true, alert: updated });
}
