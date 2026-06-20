import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { testSSH } from '@/lib/ssh';

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await request.json();
  const store = await getStore(data.storeId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const result = await testSSH({
    host: store.tailscaleIp,
    port: store.sshPort,
    username: store.sshUsername,
    password: store.sshPassword,
    timeout: 10000,
  });

  return NextResponse.json(result);
}
