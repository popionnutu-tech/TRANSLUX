import { NextRequest, NextResponse } from 'next/server';
import { authenticate, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email și parolă sunt obligatorii' }, { status: 400 });
    }

    const token = await authenticate(email, password);
    if (!token) {
      await new Promise(r => setTimeout(r, 1000));
      return NextResponse.json({ error: 'Email sau parolă incorectă' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(setSessionCookie(token));
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Eroare internă' }, { status: 500 });
  }
}
