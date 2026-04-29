'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyVerificareCreds, VERIFICARE_COOKIE } from '@/lib/verificare-auth';

export async function loginVerificare(
  user: string,
  pass: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await verifyVerificareCreds(user, pass);
  if (!token) return { ok: false, error: 'Utilizator sau parolă incorectă.' };
  const cookieStore = await cookies();
  cookieStore.set(VERIFICARE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60,
  });
  redirect('/verificare');
}

export async function logoutVerificare(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(VERIFICARE_COOKIE);
  redirect('/verificare/login');
}
