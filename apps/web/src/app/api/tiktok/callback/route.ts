import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return new Response(`TikTok OAuth Error: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response('No code received', { status: 400 });
  }

  // Exchange code for access token
  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'https://translux-web.vercel.app/api/tiktok/callback',
    }),
  });

  const tokenData = await tokenRes.json();

  // Display the tokens so admin can copy them
  const html = `
    <html>
    <head><title>TikTok OAuth Result</title></head>
    <body style="font-family: monospace; padding: 40px; background: #1e293b; color: #e2e8f0;">
      <h1 style="color: #3b82f6;">TikTok OAuth — Success!</h1>
      <p>Скопируй эти данные и добавь аккаунт на странице SMM:</p>
      <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>open_id (platform_id):</strong> ${tokenData.open_id || 'N/A'}</p>
        <p><strong>access_token:</strong></p>
        <textarea readonly style="width:100%; height:60px; background:#1e293b; color:#fff; border:1px solid #475569; padding:8px;">${tokenData.access_token || 'ERROR: ' + JSON.stringify(tokenData)}</textarea>
        <p><strong>refresh_token:</strong></p>
        <textarea readonly style="width:100%; height:60px; background:#1e293b; color:#fff; border:1px solid #475569; padding:8px;">${tokenData.refresh_token || 'N/A'}</textarea>
        <p><strong>expires_in:</strong> ${tokenData.expires_in || 'N/A'} seconds</p>
        <p><strong>scope:</strong> ${tokenData.scope || 'N/A'}</p>
      </div>
      <p style="color: #94a3b8;">Полный ответ: ${JSON.stringify(tokenData)}</p>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
