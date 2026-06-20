import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { getCommand, runSSH, listCommands } from '@/lib/ssh';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ commands: listCommands() });
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await request.json();
  const store = await getStore(data.storeId);
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const command = getCommand(data.commandKey);
  if (!command) return NextResponse.json({ error: 'Command not allowed' }, { status: 400 });

  const result = await runSSH({
    host: store.tailscaleIp,
    port: store.sshPort,
    username: store.sshUsername,
    password: store.sshPassword,
    command,
    timeout: 15000,
  });

  let parsed = null;
  if (result.ok && result.stdout) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch (e) {
      // not JSON
    }
  }

  return NextResponse.json({ ...result, parsed });
}
