import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const ALL_DASHBOARD = ['/reports', '/users', '/drivers', '/trips', '/routes', '/salary', '/smm-accounts', '/assignments', '/grafic', '/numarare'];
const DISPATCHER_ALLOWED = ['/assignments', '/drivers'];
const GRAFIC_ALLOWED = ['/grafic'];
const OPERATOR_CAMERE_ALLOWED = ['/numarare'];
const ADMIN_CAMERE_ALLOWED = ['/numarare'];
const PUBLIC_PREFIXES = ['/login', '/api/', '/ro', '/ru'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/' || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isDashboard = ALL_DASHBOARD.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (!isDashboard) return NextResponse.next();

  const token = request.cookies.get('translux-session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(authSecret));
    const role = (payload.role as string) || 'ADMIN';

    // Dispatcher can only access /assignments and /drivers
    if (role === 'DISPATCHER') {
      const allowed = DISPATCHER_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) {
        return NextResponse.redirect(new URL('/assignments', request.url));
      }
    }

    // Grafic role can only access /grafic
    if (role === 'GRAFIC') {
      const allowed = GRAFIC_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) {
        return NextResponse.redirect(new URL('/grafic', request.url));
      }
    }

    // Operator camere can only access /numarare
    if (role === 'OPERATOR_CAMERE') {
      const allowed = OPERATOR_CAMERE_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) {
        return NextResponse.redirect(new URL('/numarare', request.url));
      }
    }

    // Admin camere can only access /numarare
    if (role === 'ADMIN_CAMERE') {
      const allowed = ADMIN_CAMERE_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) {
        return NextResponse.redirect(new URL('/numarare', request.url));
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.txt$).*)'],
};
