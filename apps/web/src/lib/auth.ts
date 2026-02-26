import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
const { compare } = bcrypt;
import { getSupabase } from './supabase';
import type { AdminAccount } from '@translux/db';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'translux-secret-change-me');
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

  const token = await new SignJWT({ sub: admin.id, email: admin.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);

  return token;
}

export async function verifySession(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub as string, email: payload.email as string };
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
