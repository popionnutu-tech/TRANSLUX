import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';
import { syncWeatherPoints } from '@/lib/weather';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  // Meteo zilnic (scoring operatori) — piggyback pe singurul cron daily liber
  // (Vercel Hobby = max 2 cron-uri). Ne-fatal: copierea graficului nu depinde de meteo.
  let weatherDays = 0;
  try {
    weatherDays = await syncWeatherPoints();
  } catch (e) {
    console.error('syncWeatherPoints error:', e);
  }

  try {
    const db = getSupabase();

    // Today & tomorrow in Europe/Chisinau
    const now = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' })
    );
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const todayStr = fmt(now);
    const tomorrowStr = fmt(tomorrow);

    // Check if tomorrow already has assignments
    const { data: existing } = await db
      .from('daily_assignments')
      .select('id')
      .eq('assignment_date', tomorrowStr)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'assignments already exist for tomorrow',
        date: tomorrowStr,
        weather_days: weatherDays,
      });
    }

    // Fetch today's assignments
    const { data: source, error: fetchErr } = await db
      .from('daily_assignments')
      .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur, retur_route_id')
      .eq('assignment_date', todayStr);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

    if (!source || source.length === 0) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'no assignments found for today',
        date: todayStr,
        weather_days: weatherDays,
      });
    }

    // Copy to tomorrow — mark rows as auto_copied so the dispatcher grafic
    // hides them and sees empty slots; the public site still uses them.
    const rows = source.map((s: any) => ({
      crm_route_id: s.crm_route_id,
      assignment_date: tomorrowStr,
      driver_id: s.driver_id,
      vehicle_id: s.vehicle_id,
      vehicle_id_retur: s.vehicle_id_retur,
      retur_route_id: s.retur_route_id,
      auto_copied: true,
    }));

    const { error: insertErr } = await db.from('daily_assignments').insert(rows);
    if (insertErr) throw new Error(`Insert error: ${insertErr.message}`);

    return NextResponse.json({
      status: 'copied',
      from: todayStr,
      to: tomorrowStr,
      count: rows.length,
      weather_days: weatherDays,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Copy assignments error:', message);
    return NextResponse.json(
      { status: 'error', error: message },
      { status: 500 }
    );
  }
}
