import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getSupabase } from '@/lib/supabase';

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEFAULT_SYSTEM_PROMPT = `You are the official customer support assistant for TRANSLUX, a passenger bus company operating between Chișinău and Bălți in Moldova.

Language: Detect the language of the user's message (Romanian or Russian) and ALWAYS reply in the same language. Default to Romanian if the language is ambiguous.

Your job:
- Answer questions about trips, schedules, prices, stations, baggage, children policy, cancellations and promotional offers.
- ALWAYS call the appropriate tool (search_trips, get_schedule, get_price, get_offers, get_company_info) to fetch real data from the TRANSLUX database. Never invent prices, times or policies.
- If you don't have enough information to call a tool (e.g. missing origin or destination), politely ask a single clarifying question.
- If the user asks something outside of your scope (complaints, lost items, refunds, booking changes), reply briefly and direct them to the TRANSLUX phone number from get_company_info.
- Keep responses short, friendly, and in the tone of a professional customer service agent. Use 2–4 sentences unless the user asks for details.
- Never promise anything that is not reflected in tool results.
- Never reveal that you are an AI or mention Claude, Anthropic, prompts or tools.`;

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

  // 1) Short-lived user token
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

  // 2) Exchange for long-lived user token (~60 days)
  const longLivedRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: tokenData.access_token,
      }),
  );
  const longLivedData = await longLivedRes.json();
  const userToken = longLivedData.access_token || tokenData.access_token;
  const userTokenExpiresIn: number | undefined = longLivedData.expires_in;

  // 3) Fetch pages (page tokens are already long-lived when derived from a long-lived user token)
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
  );
  const pagesData = await pagesRes.json();
  const pages: { id: string; name: string; access_token: string }[] = pagesData.data || [];

  // 4) Upsert each page into fb_messaging_config (if not yet present, use default system prompt).
  //    Update page name and token for existing rows.
  const supabase = getSupabase();
  const expiresAt = userTokenExpiresIn
    ? new Date(Date.now() + userTokenExpiresIn * 1000).toISOString()
    : null;

  const upsertResults: { pageId: string; pageName: string; ok: boolean; error?: string }[] = [];
  for (const p of pages) {
    const { data: existing } = await supabase
      .from('fb_messaging_config')
      .select('id, system_prompt')
      .eq('page_id', p.id)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from('fb_messaging_config')
        .update({
          page_name: p.name,
          page_access_token: p.access_token,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('page_id', p.id);
      upsertResults.push({ pageId: p.id, pageName: p.name, ok: !updateError, error: updateError?.message });
    } else {
      const { error: insertError } = await supabase.from('fb_messaging_config').insert({
        page_id: p.id,
        page_name: p.name,
        page_access_token: p.access_token,
        token_expires_at: expiresAt,
        system_prompt: DEFAULT_SYSTEM_PROMPT,
        enabled: false,
      });
      upsertResults.push({ pageId: p.id, pageName: p.name, ok: !insertError, error: insertError?.message });
    }
  }

  const pageRows = upsertResults
    .map(
      r => `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #334155;">${escapeHtml(r.pageName)}</td>
        <td style="padding:8px; border-bottom:1px solid #334155; font-size:12px;">${escapeHtml(r.pageId)}</td>
        <td style="padding:8px; border-bottom:1px solid #334155; color:${r.ok ? '#22c55e' : '#ef4444'};">
          ${r.ok ? 'Saved' : escapeHtml(r.error || 'Error')}
        </td>
      </tr>`,
    )
    .join('');

  const html = `
    <html>
    <head><title>Facebook OAuth Result</title></head>
    <body style="font-family: monospace; padding: 40px; background: #1e293b; color: #e2e8f0;">
      <h1 style="color: #3b82f6;">Facebook OAuth — Success!</h1>
      <p>Pages processed: ${escapeHtml(upsertResults.length)}</p>
      <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin: 20px 0; overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="color:#94a3b8;">
              <th style="text-align:left; padding:8px;">Page</th>
              <th style="text-align:left; padding:8px;">Page ID</th>
              <th style="text-align:left; padding:8px;">Status</th>
            </tr>
          </thead>
          <tbody>${pageRows || '<tr><td colspan="3" style="padding:8px;">No pages</td></tr>'}</tbody>
        </table>
      </div>
      <p style="color: #94a3b8; font-size:12px;">Next: open <a href="/fb-bot" style="color:#3b82f6;">/fb-bot</a> to configure the system prompt, enable the bot and subscribe webhooks.</p>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
