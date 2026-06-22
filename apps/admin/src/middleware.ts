import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Маршруты которые middleware пропускает без JWT-проверки.
// Они защищаются собственными механизмами (CRON_SECRET, VOICE_API_KEY,
// подпись Facebook/TikTok webhook'ов, и т.д.).
const PUBLIC_PREFIXES = [
  '/login',
  '/access-denied',
  '/api/auth/',
  '/api/cron/',
  '/api/voice-tools/',
  '/api/fb-bot/',
  '/api/facebook/',
  '/api/tiktok/',
  '/api/schedule-image',
  // Mini App задачника: открывается в Telegram, защищается сам через initData (без cookie-сессии).
  '/mini-app/',
  '/api/zadachnik/',
];

const DISPATCHER_ALLOWED = ['/grafic', '/drivers', '/vehicles'];
const GRAFIC_ALLOWED = ['/grafic'];
const NUMARARE_ONLY_ROLES = ['OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI'] as const;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

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
    const role = payload.role as string;
    if (!role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (role === 'DISPATCHER') {
      const allowed = DISPATCHER_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) return NextResponse.redirect(new URL('/grafic', request.url));
    }

    if (role === 'GRAFIC') {
      const allowed = GRAFIC_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) return NextResponse.redirect(new URL('/grafic', request.url));
    }

    if (NUMARARE_ONLY_ROLES.includes(role as any)) {
      const allowed = pathname === '/numarare' || pathname.startsWith('/numarare/');
      if (!allowed) return NextResponse.redirect(new URL('/numarare', request.url));
    }

    // CONTABIL (contabil-șef) e închis în modulul Piese + API-ul lui; restul admin-ului e blocat la URL direct.
    if (role === 'CONTABIL') {
      const allowed = pathname.startsWith('/piese') || pathname.startsWith('/api/piese');
      if (!allowed) return NextResponse.redirect(new URL('/piese', request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.txt$).*)'],
};
