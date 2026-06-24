import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV)) {
  throw new Error('AUTH_SECRET must be set in production and on Vercel');
}
const SECRET = new TextEncoder().encode(AUTH_SECRET || 'dev-only-secret-local-only');

export const VERIFICARE_COOKIE = 'translux-verificare';

// Fără fallback hardcodat: dacă nu sunt setate în env, login-ul eșuează închis (fail-closed).
const VALID_USER = process.env.VERIFICARE_USER?.trim().toLowerCase();
const VALID_PASS = process.env.VERIFICARE_PASS;

export async function verifyVerificareCreds(
  user: string,
  pass: string,
): Promise<string | null> {
  if (!VALID_USER || !VALID_PASS) return null;
  if (user.trim().toLowerCase() !== VALID_USER) return null;
  if (pass !== VALID_PASS) return null;
  const token = await new SignJWT({ sub: VALID_USER, role: 'verificare-operator' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(SECRET);
  return token;
}

export async function isVerificareAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(VERIFICARE_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.role === 'verificare-operator';
  } catch {
    return false;
  }
}
