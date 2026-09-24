import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
// Căile publice (fără JWT) stau în lib/public-paths.ts — funcție pură, cu test.
import { isPublicPath } from '@/lib/public-paths';

const DISPATCHER_ALLOWED = ['/grafic', '/drivers', '/vehicles'];
const GRAFIC_ALLOWED = ['/grafic'];
// Grafic uzine a fost șters (ION-53, 24.09); rolului UZINE îi rămâne Parcul.
const UZINE_ALLOWED = ['/lde/parc'];
// DISPECER: doar modulul camioanelor. Fila Analitică e tăiată separat, în layout-ul
// modulului (middleware-ul nu poate deosebi filele fără să dubleze regula).
// Include ȘI calea API a modulului: fără ea harta dispeceratului primea 307 exact
// pentru rolul căruia îi e destinată. NU se lărgește la /api/lde (celelalte rute
// LDE rămân închise pentru DISPECER).
const DISPECER_ALLOWED = ['/lde/camioane', '/api/lde/camioane'];
// OBSERVATOR vede aceleași căi, dar fără drept de scriere — interdicția aceea stă
// în `poateScrie` (lib/lde/camioane-nav.ts), pe fiecare acțiune de server.
const OBSERVATOR_ALLOWED = ['/lde/camioane', '/api/lde/camioane'];
const NUMARARE_ONLY_ROLES = ['OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI'] as const;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
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

    if (role === 'UZINE') {
      const allowed = UZINE_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) return NextResponse.redirect(new URL('/lde/parc', request.url));
    }

    if (role === 'DISPECER') {
      const allowed = DISPECER_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) return NextResponse.redirect(new URL('/lde/camioane', request.url));
    }

    if (role === 'OBSERVATOR') {
      const allowed = OBSERVATOR_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) return NextResponse.redirect(new URL('/lde/camioane', request.url));
    }

    if (NUMARARE_ONLY_ROLES.includes(role as any)) {
      const allowed = pathname === '/numarare' || pathname.startsWith('/numarare/');
      if (!allowed) return NextResponse.redirect(new URL('/numarare', request.url));
    }

    // Rolurile de depozit — CONTABIL, DEPOZITAR (intrări), VINZATOR (ieșiri/vânzări) și MANAGER (supraveghere) —
    // sunt închise în modulul Piese + API-ul lui; restul admin-ului e blocat la URL direct.
    // (drepturile de scriere per operațiune sunt aplicate suplimentar la nivel de pagină/acțiune.)
    if (role === 'CONTABIL' || role === 'DEPOZITAR' || role === 'VINZATOR' || role === 'MANAGER' || role === 'GESTIONAR') {
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
