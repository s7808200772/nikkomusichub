import { NextResponse } from 'next/server';
import { createToken, checkCredentials } from '@/lib/auth';

export async function POST(request) {
  const form = await request.formData();
  const username = form.get('username');
  const password = form.get('password');

  if (!checkCredentials(username, password)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await createToken(username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set('nikko_cloud_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('nikko_cloud_token');
  return response;
}
