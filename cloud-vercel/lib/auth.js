import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = new TextEncoder().encode(
  process.env.NIKKO_CLOUD_SECRET || 'nikko-cloud-secret-change-me'
);

export async function createToken(username) {
  return await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload;
  } catch (e) {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nikko_cloud_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  return payload?.username || null;
}

export function checkCredentials(username, password) {
  return (
    username === (process.env.NIKKO_ADMIN_USER || 'nikkolh') &&
    password === (process.env.NIKKO_ADMIN_PASS || 'topup30%off')
  );
}
