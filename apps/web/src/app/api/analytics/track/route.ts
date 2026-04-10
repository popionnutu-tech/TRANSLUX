import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

function detectDevice(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const country = request.headers.get('x-vercel-ip-country') || null;
    const ua = request.headers.get('user-agent') || '';
    const device = detectDevice(ua);
    const referrer = request.headers.get('referer') || null;

    // Fire-and-forget insert
    getSupabase().from('page_views').insert({
      path,
      country,
      device,
      referrer,
    }).then(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
