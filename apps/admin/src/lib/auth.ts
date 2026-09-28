import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
const { compare } = bcrypt;
import { getSupabase } from './supabase';
import type { AdminAccount, AdminRole } from '@translux/db';
import { accountState } from './account-state';
import { sesiuneValida } from './login-guard';

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV)) {
  throw new Error('AUTH_SECRET must be set in production and on Vercel');
}
const secret = new TextEncoder().encode(AUTH_SECRET || 'dev-only-secret-local-only');
const COOKIE_NAME = 'translux-session';

export type AuthResult =
  | { ok: true; token: string; admin: AdminAccount }
  | { ok: false; motiv: 'necunoscut' | 'inactiv' | 'parola'; adminId: string | null };

export async function authenticate(email: string, password: string): Promise<AuthResult> {
  email = (email || '').trim().toLowerCase();
  const { data } = await getSupabase()
    .from('admin_accounts')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (!data) return { ok: false, motiv: 'necunoscut', adminId: null };

  const admin = data as AdminAccount;
  if (admin.active === false) return { ok: false, motiv: 'inactiv', adminId: admin.id };
  const valid = await compare(password, admin.password_hash);
  if (!valid) return { ok: false, motiv: 'parola', adminId: admin.id };

  // `sv` (migr. 428): tokenul cade când versiunea sesiunii contului crește — schimbarea parolei,
  // a rolului, dezactivarea sau butonul «Închide sesiunile» de pe /users.
  const token = await new SignJWT({ sub: admin.id, email: admin.email, role: admin.role, sv: admin.session_version ?? 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);

  return { ok: true, token, admin };
}

export interface Session {
  id: string;
  email: string;
  role: AdminRole;
}

export async function verifySession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    // `sub` e la fel de esențial ca rolul: din el iese Session.id, folosit ca filtru de proprietate
    // (facturile mele, depozitul meu, fereastra mea). Un `sub` lipsă ar da `undefined`, iar filtrele
    // care tratează valoarea falsy drept „fără restricție" s-ar deschide tăcut.
    if (!payload.role || !payload.sub) return null;
    // Semnătura singură nu mai ajunge (ION-126): contul trebuie să fie activ și cu aceeași versiune
    // de sesiune, iar rolul se ia din bază — o retrogradare lucrează fără să aștepte expirarea tokenului.
    const cont = await accountState(payload.sub);
    if (!sesiuneValida(payload.sv, cont)) return null;
    return {
      id: payload.sub as string,
      email: payload.email as string,
      role: cont!.role as AdminRole,
    };
  } catch {
    return null;
  }
}

/** Decodează rolul direct dintr-un token (folosit la login pentru redirect pe rol). */
export async function roleFromToken(token: string): Promise<AdminRole | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return (payload.role as AdminRole) || null;
  } catch {
    return null;
  }
}

export function requireRole(session: Session | null, ...roles: AdminRole[]): Session {
  if (!session) throw new Error('Neautorizat');
  if (!roles.includes(session.role)) throw new Error('Acces interzis');
  return session;
}

export function setSessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24,
    path: '/',
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
