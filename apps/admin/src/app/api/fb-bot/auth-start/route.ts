import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_engagement',
  'pages_messaging',
];

export async function GET(request: NextRequest) {
  // Admin guard
  const cookieStore = await cookies();
  const token = cookieStore.get('translux-session')?.value;
  if (!token) return new NextResponse('Neautorizat', { status: 401 });
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return new NextResponse('Server misconfiguration', { status: 500 });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.role !== 'ADMIN') {
      return new NextResponse('Acces interzis', { status: 403 });
    }
  } catch {
    return new NextResponse('Sesiune invalidă', { status: 401 });
  }

  const appId = process.env.FB_APP_ID;
  if (!appId) return new NextResponse('FB_APP_ID not configured', { status: 500 });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/facebook/callback`;

  const url = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');

  return NextResponse.redirect(url.toString(), 302);
}
