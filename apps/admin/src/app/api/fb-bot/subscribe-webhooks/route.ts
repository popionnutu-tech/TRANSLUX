import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getSupabase } from '@/lib/supabase';
import { subscribePageWebhooks } from '@/lib/fb-bot/sender';
import type { FbMessagingConfig } from '@translux/db';

export const runtime = 'nodejs';

async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('translux-session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { pageId } = (await req.json().catch(() => ({}))) as { pageId?: string };
  if (!pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }

  const { data } = await getSupabase()
    .from('fb_messaging_config')
    .select('*')
    .eq('page_id', pageId)
    .maybeSingle();
  const config = data as FbMessagingConfig | null;
  if (!config) {
    return NextResponse.json({ error: 'Page not configured' }, { status: 404 });
  }

  const result = await subscribePageWebhooks(config.page_id, config.page_access_token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
