import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { visitorHash } from '@/lib/visitor';

const MODS = ['acum', 'mai_tarziu'];

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
    // Oamenii unici și sursele anormale în /analytics (ION-142).
    const vizitator = visitorHash(request.headers);

    if (body.event_type === 'call') {
      getSupabase().from('call_clicks').insert({
        from_locality: body.from_locality || null,
        to_locality: body.to_locality || null,
        driver_phone: body.driver_phone || null,
        mod: MODS.includes(body.mod) ? body.mod : null,
        country,
        device,
        vizitator,
      }).then(() => {});
      return NextResponse.json({ ok: true });
    }

    // «Acum» deschis (ION-102): o căutare fără dată, pentru azi. Fără ip_hash — anti-scraperul
    // (cautari_recente) numără doar căutările pe dată, iar «Acum» nu dă orarul întreg.
    if (body.event_type === 'now') {
      if (typeof body.from_locality !== 'string' || typeof body.to_locality !== 'string') {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      getSupabase().from('search_log').insert({
        from_locality: body.from_locality.slice(0, 100),
        to_locality: body.to_locality.slice(0, 100),
        search_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' }),
        mod: 'acum',
        vizitator,
        user_agent: ua.slice(0, 200) || null,
      }).then(({ error }) => {
        if (error) console.warn('[search_log] insert acum eșuat:', error.message);
      });
      return NextResponse.json({ ok: true });
    }

    // Default: page view
    const { path } = body;
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Pagina biletului are codul secret în cale (ION-197): nu intră în page_views.
    if (path.includes('/bilet/')) return NextResponse.json({ ok: true });

    const referrer = request.headers.get('referer') || null;
    getSupabase().from('page_views').insert({
      path,
      country,
      device,
      referrer,
      vizitator,
    }).then(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
