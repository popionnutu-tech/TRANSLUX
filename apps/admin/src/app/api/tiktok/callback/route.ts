import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  // Verify ADMIN session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('translux-session')?.value;
  if (!sessionToken) {
    return new Response('Neautorizat — trebuie sa fii logat ca ADMIN', { status: 401 });
  }
  try {
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) return new Response('Server misconfiguration', { status: 500 });
    const { payload } = await jwtVerify(sessionToken, new TextEncoder().encode(authSecret));
    if (payload.role !== 'ADMIN') {
      return new Response('Acces interzis', { status: 403 });
    }
  } catch {
    return new Response('Sesiune invalidă', { status: 401 });
  }

  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return new Response(`TikTok OAuth Error: ${escapeHtml(error)}`, { status: 400 });
  }

  if (!code) {
    return new Response('No code received', { status: 400 });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/tiktok/callback`;

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();

  const html = `
    <html>
    <head><title>TikTok OAuth Result</title></head>
    <body style="font-family: monospace; padding: 40px; background: #1e293b; color: #e2e8f0;">
      <h1 style="color: #3b82f6;">TikTok OAuth — Success!</h1>
      <p>Copy these and add the account on the SMM page:</p>
      <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>open_id (platform_id):</strong> ${escapeHtml(tokenData.open_id || 'N/A')}</p>
        <p><strong>access_token:</strong></p>
        <textarea readonly style="width:100%; height:60px; background:#1e293b; color:#fff; border:1px solid #475569; padding:8px;">${escapeHtml(tokenData.access_token || 'ERROR: ' + JSON.stringify(tokenData))}</textarea>
        <p><strong>refresh_token:</strong></p>
        <textarea readonly style="width:100%; height:60px; background:#1e293b; color:#fff; border:1px solid #475569; padding:8px;">${escapeHtml(tokenData.refresh_token || 'N/A')}</textarea>
        <p><strong>expires_in:</strong> ${escapeHtml(tokenData.expires_in || 'N/A')} seconds</p>
        <p><strong>scope:</strong> ${escapeHtml(tokenData.scope || 'N/A')}</p>
      </div>
      <p style="color: #94a3b8;">Full response: ${escapeHtml(JSON.stringify(tokenData))}</p>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
