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
    return new Response(`Facebook OAuth Error: ${escapeHtml(error)}`, { status: 400 });
  }

  if (!code) {
    return new Response('No code received', { status: 400 });
  }

  const appId = process.env.FB_APP_ID!;
  const appSecret = process.env.FB_APP_SECRET!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/facebook/callback`;

  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }),
  );
  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    const html = `
      <html>
      <head><title>Facebook OAuth Error</title></head>
      <body style="font-family: monospace; padding: 40px; background: #1e293b; color: #e2e8f0;">
        <h1 style="color: #ef4444;">Facebook OAuth — Error</h1>
        <p>${escapeHtml(tokenData.error.message)}</p>
        <p style="color: #94a3b8;">Full response: ${escapeHtml(JSON.stringify(tokenData))}</p>
      </body>
      </html>
    `;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  const userToken = tokenData.access_token;

  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
  );
  const pagesData = await pagesRes.json();
  const pages = pagesData.data || [];

  const pageRows = pages
    .map(
      (p: { id: string; name: string; access_token: string }) => `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #334155;">${escapeHtml(p.name)}</td>
        <td style="padding:8px; border-bottom:1px solid #334155; font-size:12px;">${escapeHtml(p.id)}</td>
        <td style="padding:8px; border-bottom:1px solid #334155;">
          <textarea readonly style="width:100%; height:40px; background:#1e293b; color:#fff; border:1px solid #475569; padding:4px; font-size:11px;">${escapeHtml(p.access_token)}</textarea>
        </td>
      </tr>`,
    )
    .join('');

  const html = `
    <html>
    <head><title>Facebook OAuth Result</title></head>
    <body style="font-family: monospace; padding: 40px; background: #1e293b; color: #e2e8f0;">
      <h1 style="color: #3b82f6;">Facebook OAuth — Success!</h1>
      <p>Pages found: ${escapeHtml(pages.length)}</p>
      <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin: 20px 0; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="color:#94a3b8;">
              <th style="text-align:left; padding:8px;">Page</th>
              <th style="text-align:left; padding:8px;">Page ID</th>
              <th style="text-align:left; padding:8px;">Page Access Token</th>
            </tr>
          </thead>
          <tbody>${pageRows || '<tr><td colspan="3" style="padding:8px;">No pages</td></tr>'}</tbody>
        </table>
      </div>
      <p style="color: #94a3b8; font-size:12px;">User token: ${escapeHtml(userToken?.slice(0, 20))}...</p>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
