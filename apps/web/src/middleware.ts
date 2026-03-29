import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root and locale pages to dashboard
  if (pathname === '/' || pathname === '/ro' || pathname === '/ru') {
    return NextResponse.redirect(new URL('/reports', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.txt$).*)'],
};
