import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'translux-secret-change-me');
const COOKIE_NAME = 'translux-session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/api/auth') || pathname.match(/\.(svg|png|jpg|ico|txt)$/)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.txt$).*)'],
};
