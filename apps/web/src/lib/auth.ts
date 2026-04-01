import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
const { compare } = bcrypt;
import { getSupabase } from './supabase';
import type { AdminAccount, AdminRole } from '@translux/db';

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) console.warn('AUTH_SECRET not set — using dev-only fallback');
const secret = new TextEncoder().encode(AUTH_SECRET || 'dev-only-secret');
const COOKIE_NAME = 'translux-session';

export async function authenticate(email: string, password: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('admin_accounts')
    .select('*')
    .eq('email', email)
    .single();

  if (!data) return null;

  const admin = data as AdminAccount;
  const valid = await compare(password, admin.password_hash);
  if (!valid) return null;

  const token = await new SignJWT({ sub: admin.id, email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);

  return token;
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
    return {
      id: payload.sub as string,
      email: payload.email as string,
      role: (payload.role as AdminRole) || 'ADMIN',
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24, // 24h
    path: '/',
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
