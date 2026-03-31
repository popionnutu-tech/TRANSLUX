import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const DASHBOARD_ROUTES = ['/reports', '/users', '/drivers', '/trips', '/routes', '/salary', '/smm-accounts'];
const PUBLIC_PREFIXES = ['/login', '/api/', '/ro', '/ru'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/' || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isDashboard = DASHBOARD_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (!isDashboard) return NextResponse.next();

  const token = request.cookies.get('translux-session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return NextResponse.next();

  try {
    await jwtVerify(token, new TextEncoder().encode(authSecret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.txt$).*)'],
};
