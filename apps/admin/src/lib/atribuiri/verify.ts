import { getSupabase } from '@/lib/supabase';
import { sendTelegram, escapeHtml } from '@/lib/telegram-notify';
import { ensureDayMaterialized } from './core';

// Verificarea «a doua zi»: după worker-ul nocturn (03:00, lde_gps_stops pentru ieri),
// comparăm atribuirile de uzină cu GPS-ul real. Mașina a fost în orașul uzinei →
// confirmat_auto; lipsă date GPS → fara_date_gps (fără alarmă); altfel → nepotrivire
// + push managerilor direcției cu buton web_app spre mini-app/atribuiri/verifica.
// Interurban/suburban v1: fără verdict automat (rafinare ulterioară) — zero spam.

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'https://central-hub-md.vercel.app';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export interface VerifySummary {
  date: string;
  verificate: number;
  confirmate_auto: number;
  nepotriviri: number;
  fara_date_gps: number;
  fara_masina: number;
  push_trimise: number;
  dry: boolean;
}

/** Toate opririle GPS ale zilei — paginat (PostgREST taie tăcut la 1000). */
async function stopsOfDay(date: string): Promise<Map<string, { locs: Set<string>; firstAt: Map<string, string> }>> {
  const db = getSupabase();
  const byVeh = new Map<string, { locs: Set<string>; firstAt: Map<string, string> }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('lde_gps_stops')
      .select('vehicle_id, locality, arrival_at')
      .eq('date', date)
      .order('vehicle_id', { ascending: true }).order('seq', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`lde_gps_stops: ${error.message}`);
    for (const s of data ?? []) {
      if (!s.locality) continue;
      const key = norm(s.locality);
      const e = byVeh.get(s.vehicle_id) ?? { locs: new Set<string>(), firstAt: new Map<string, string>() };
      e.locs.add(key);
      if (!e.firstAt.has(key)) e.firstAt.set(key, s.arrival_at as string);
      byVeh.set(s.vehicle_id, e);
    }
    if (!data || data.length < 1000) break;
  }
  return byVeh;
}

export async function verificaZi(date: string, dry: boolean): Promise<VerifySummary> {
  const db = getSupabase();
  await ensureDayMaterialized(date);

  const [{ data: rows }, { data: uzine }, gpsDaily, stops] = await Promise.all([
    db.from('lde_atribuiri_zilnice')
      .select('id, direction, vehicle_id, status')
      .eq('date', date).eq('route_kind', 'uzina')
      .in('status', ['planificat', 'modificat_proactiv', 'modificat_reactiv']),
    db.from('lde_uzine').select('id, city'),
    db.from('lde_vehicle_gps_daily').select('vehicle_id').eq('date', date).then((r) => new Set((r.data ?? []).map((x) => x.vehicle_id as string))),
    stopsOfDay(date),
  ]);
  const cityOf = new Map((uzine ?? []).map((u) => [u.id as string, u.city as string]));

  const summary: VerifySummary = {
    date, verificate: 0, confirmate_auto: 0, nepotriviri: 0, fara_date_gps: 0, fara_masina: 0, push_trimise: 0, dry,
  };
  const nepotriviriByDir = new Map<string, number>();
  const updates: Array<{ id: string; status: string; note: string }> = [];

  for (const r of rows ?? []) {
    summary.verificate++;
    if (!r.vehicle_id) { summary.fara_masina++; continue; } // «de completat» — nu e verdict GPS
    const city = cityOf.get(r.direction as string);
    if (!city) continue;

    if (!gpsDaily.has(r.vehicle_id as string)) {
      summary.fara_date_gps++;
      updates.push({ id: r.id as string, status: 'fara_date_gps', note: 'fără date GPS în ziua respectivă' });
      continue;
    }
    const veh = stops.get(r.vehicle_id as string);
    const cityKey = norm(city);
    if (veh?.locs.has(cityKey)) {
      summary.confirmate_auto++;
      const at = veh.firstAt.get(cityKey);
      const ora = at ? new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' }).format(new Date(at)) : '';
      updates.push({ id: r.id as string, status: 'confirmat_auto', note: `GPS: ${city}${ora ? ` ${ora}` : ''}` });
    } else {
      summary.nepotriviri++;
      nepotriviriByDir.set(r.direction as string, (nepotriviriByDir.get(r.direction as string) ?? 0) + 1);
      updates.push({ id: r.id as string, status: 'nepotrivire', note: `GPS: nu a ajuns în ${city}` });
    }
  }

  if (!dry) {
    for (const u of updates) {
      await db.from('lde_atribuiri_zilnice')
        .update({ status: u.status, verification_note: u.note, ...(u.status === 'confirmat_auto' ? { confirmed_at: new Date().toISOString() } : {}) })
        .eq('id', u.id);
    }
    summary.push_trimise = await pushManagers(date, nepotriviriByDir, summary);
  }
  return summary;
}

/** Digest de dimineață per manager: doar managerii direcțiilor cu nepotriviri. */
async function pushManagers(date: string, nepotriviriByDir: Map<string, number>, s: VerifySummary): Promise<number> {
  if (!nepotriviriByDir.size) return 0;
  const db = getSupabase();
  const { data: mds } = await db.from('lde_manager_directions').select('user_id, direction');
  const dirsByUser = new Map<string, string[]>();
  for (const m of mds ?? []) {
    const mine = nepotriviriByDir.get(m.direction as string);
    if (!mine) continue;
    dirsByUser.set(m.user_id as string, [...(dirsByUser.get(m.user_id as string) ?? []), m.direction as string]);
  }
  if (!dirsByUser.size) return 0;

  const { data: users } = await db.from('users')
    .select('id, telegram_id').in('id', [...dirsByUser.keys()]).eq('active', true).not('telegram_id', 'is', null);

  let sent = 0;
  for (const u of users ?? []) {
    const dirs = dirsByUser.get(u.id as string) ?? [];
    const n = dirs.reduce((a, d) => a + (nepotriviriByDir.get(d) ?? 0), 0);
    const text =
      `⚠️ <b>Atribuiri ${escapeHtml(date)}</b>\n` +
      `${s.confirmate_auto} curse confirmate automat de GPS · <b>${n} nepotriviri</b> pe direcțiile tale (${escapeHtml(dirs.join(', '))}).\n` +
      `Corectează mașina reală sau confirmă că a fost ok:`;
    const ok = await sendTelegram(u.telegram_id as number, text, {
      inline_keyboard: [[{ text: '🔍 Deschide verificarea', web_app: { url: `${ADMIN_BASE_URL}/mini-app/atribuiri/verifica?date=${date}` } }]],
    });
    if (ok) sent++;
  }
  return sent;
}
