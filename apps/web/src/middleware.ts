import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware-ul site-ului public translux.md.
 *
 * Singura responsabilitate: redirect de la translux.com (vechiul domeniu) la translux.md.
 * Toate paginile admin/dashboard au fost mutate la apps/admin (proiect Vercel separat).
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  if (host === 'transportlux.com' || host === 'www.transportlux.com') {
    const url = new URL(request.url);
    url.host = 'translux.md';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.txt$).*)'],
};
