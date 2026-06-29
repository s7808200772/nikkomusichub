import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const CLOUD_SECRET = process.env.NIKKO_CLOUD_SECRET || '';
const ADMIN_USER = process.env.NIKKO_ADMIN_USER || '';
const ADMIN_PASS = process.env.NIKKO_ADMIN_PASS || '';

function secretKey() {
  return CLOUD_SECRET ? new TextEncoder().encode(CLOUD_SECRET) : null;
}

export function isAuthConfigured() {
  return CLOUD_SECRET.length >= 32 && !!ADMIN_USER && ADMIN_PASS.length >= 8;
}

export async function createToken(username) {
  const key = secretKey();
  if (!key) throw new Error('Cloud authentication is not configured');
  return await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifyToken(token) {
  try {
    const key = secretKey();
    if (!key) return null;
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch (e) {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('__Host-nikko_cloud_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.username || null;
}

export function checkCredentials(username, password) {
  return isAuthConfigured() && username === ADMIN_USER && password === ADMIN_PASS;
}
