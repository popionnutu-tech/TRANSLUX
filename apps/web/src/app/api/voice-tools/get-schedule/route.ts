import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { getSupabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  const body = await req.json();
  const { from, to } = body as { from?: string; to?: string };

  if (!from && !to) {
    return NextResponse.json({ error: 'Provide "from" or "to" (or both) to filter schedule' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get all active routes with their stop fares for the requested cities
  let query = supabase
    .from('crm_routes')
    .select('id, dest_to_ro, dest_from_ro, time_chisinau, time_nord')
    .eq('active', true);

  const { data: routes } = await query;
  if (!routes || routes.length === 0) {
    return NextResponse.json({ schedules: [] });
  }

  // Get stop fares for all active routes to find departure times
  const routeIds = routes.map((r: any) => r.id);
  const { data: stops } = await supabase
    .from('crm_stop_fares')
    .select('crm_route_id, name_ro, hour_from_chisinau, hour_from_nord')
    .in('crm_route_id', routeIds);

  if (!stops) {
    return NextResponse.json({ schedules: [] });
  }

  // Filter stops matching from/to
  const fromNorm = from?.toLowerCase();
  const toNorm = to?.toLowerCase();

  const schedules: { route: string; departure: string; direction: string }[] = [];

  for (const route of routes as any[]) {
    const routeStops = stops.filter((s: any) => s.crm_route_id === route.id);

    const fromStop = fromNorm
      ? routeStops.find((s: any) => s.name_ro.toLowerCase().includes(fromNorm))
      : null;
    const toStop = toNorm
      ? routeStops.find((s: any) => s.name_ro.toLowerCase().includes(toNorm))
      : null;

    if (from && !fromStop) continue;
    if (to && !toStop) continue;

    // Determine direction based on stop ordering
    if (fromStop) {
      const time = fromStop.hour_from_chisinau && fromStop.hour_from_chisinau !== '0:00'
        ? fromStop.hour_from_chisinau
        : fromStop.hour_from_nord;
      if (time && time !== '0:00') {
        const direction = fromStop.hour_from_chisinau && fromStop.hour_from_chisinau !== '0:00'
          ? `Chișinău → ${route.dest_to_ro}`
          : `${route.dest_from_ro} → Chișinău`;
        schedules.push({ route: direction, departure: time, direction });
      }
    } else if (toStop) {
      // Only "to" specified — show all departures arriving at this stop
      const time = toStop.hour_from_chisinau && toStop.hour_from_chisinau !== '0:00'
        ? toStop.hour_from_chisinau
        : toStop.hour_from_nord;
      if (time && time !== '0:00') {
        schedules.push({
          route: `→ ${toStop.name_ro}`,
          departure: time,
          direction: 'arrival',
        });
      }
    }
  }

  schedules.sort((a, b) => {
    const [ah, am] = a.departure.split(':').map(Number);
    const [bh, bm] = b.departure.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });

  return NextResponse.json({ count: schedules.length, schedules });
}
