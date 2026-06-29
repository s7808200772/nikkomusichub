import { NextResponse } from 'next/server';
import { createToken, checkCredentials, isAuthConfigured } from '@/lib/auth';

const attempts = globalThis.__nikkoLoginAttempts || new Map();
globalThis.__nikkoLoginAttempts = attempts;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function failuresFor(ip) {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = (attempts.get(ip) || []).filter((at) => at > cutoff);
  attempts.set(ip, recent);
  return recent;
}

export async function POST(request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: 'Cloud authentication is not configured' }, { status: 503 });
  }
  const ip = clientIp(request);
  const failures = failuresFor(ip);
  if (failures.length >= MAX_FAILURES) {
    return NextResponse.json({ error: 'Too many login attempts' }, { status: 429 });
  }
  const form = await request.formData();
  const username = form.get('username');
  const password = form.get('password');

  if (!checkCredentials(username, password)) {
    failures.push(Date.now());
    attempts.set(ip, failures);
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  attempts.delete(ip);

  const token = await createToken(username);
  const response = NextResponse.json({ ok: true });
  // __Host- prefix requires Secure, Path=/, and no Domain attribute.
  response.cookies.set('__Host-nikko_cloud_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('__Host-nikko_cloud_token');
  return response;
}
