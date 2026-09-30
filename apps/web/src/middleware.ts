import { NextResponse, type NextRequest } from 'next/server';
import { legacySearchTarget, parsePair, SITE_URL } from '@/lib/seo';

/**
 * Middleware-ul site-ului public translux.md.
 *
 * 1. transportlux.com (vechiul domeniu) → translux.md.
 * 2. www.translux.md → translux.md (ION-153: www răspundea 200 cu aceeași pagină — duplicat în Google).
 *    308 păstrează metoda, deci și POST-urile server action-urilor unui tab deschis pe www.
 *    NU se pune în Vercel redirectul invers apex → www: cele două ar intra în buclă.
 * 3. /ro|ru/search/<de>/<spre> (adrese vechi, încă în indexul Google, azi 404) → pagina de
 *    direcție /ro/autobuz/<de>-<spre>, sau pagina principală dacă direcția n-are pagină.
 *    De pe transportlux.com se ajunge direct la țintă, într-un singur pas.
 *
 * Toate paginile admin/dashboard au fost mutate la apps/admin (proiect Vercel separat).
 */
const LEGACY_SEARCH = /^\/(ro|ru)\/search\/([^/]+)\/([^/]+)\/?$/;
const ROUTE_PAGE = /^\/(?:ro\/autobuz|ru\/avtobus)\/([^/]+)\/?$/;

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const { pathname, search } = request.nextUrl;
  const legacy = pathname.match(LEGACY_SEARCH);
  // Părțile se iau din URL-ul brut: decodarea o face legacySearchTarget, sigur (fără 500).
  const legacyTarget = legacy ? legacySearchTarget(legacy[1] as 'ro' | 'ru', legacy[2], legacy[3]) : null;

  if (host === 'transportlux.com' || host === 'www.transportlux.com') {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.host = 'translux.md';
    url.port = '';
    if (legacyTarget) {
      url.pathname = legacyTarget;
      url.search = '';
    }
    return NextResponse.redirect(url, 301);
  }

  if (host === 'www.translux.md') {
    return NextResponse.redirect(new URL(`${legacyTarget ?? pathname}${legacyTarget ? '' : search}`, SITE_URL), 308);
  }

  if (legacyTarget) {
    return NextResponse.redirect(new URL(legacyTarget, SITE_URL), 301);
  }

  // Pagina de direcție cu o pereche necunoscută: 404 adevărat. În pagină, notFound() vine
  // după ce loading.tsx a pornit deja răspunsul cu 200 (pentru oameni, nu și pentru roboți).
  const route = pathname.match(ROUTE_PAGE);
  if (route && !parsePair(route[1])) {
    return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.txt$).*)'],
};
