import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

function detectDevice(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const country = request.headers.get('x-vercel-ip-country') || null;
    const ua = request.headers.get('user-agent') || '';
    const device = detectDevice(ua);

    if (body.event_type === 'call') {
      getSupabase().from('call_clicks').insert({
        from_locality: body.from_locality || null,
        to_locality: body.to_locality || null,
        driver_phone: body.driver_phone || null,
        country,
        device,
      }).then(() => {});
      return NextResponse.json({ ok: true });
    }

    // Default: page view
    const { path } = body;
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const referrer = request.headers.get('referer') || null;
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
