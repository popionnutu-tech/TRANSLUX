'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

const TZ = 'Europe/Chisinau';

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function monthStartIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

function nextDayIso(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function chisinauDay(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
}

export type KmPerioadaRow = {
  vehicle_id: string;
  plate_number: string;
  km: number;                // total km pe perioadă (km_total, aceeași cifră ca în salarii/acte)
  litri: number;             // total litri alimentați pe perioadă (toate sursele: benzol + cash)
  consum: number | null;     // l/100km = litri/km×100 — media pe perioadă; null când km≈0
  probleme: string[];        // motive agregate — menționate, NU corectate
};

export type KmPerioadaDirectie = {
  directie: string;
  km_total: number;
  litri_total: number;
  masini: number;
  cu_probleme: number;
  rows: KmPerioadaRow[];
};

export type KmPerioada = {
  from: string;
  to: string;
  km_flota: number;
  litri_flota: number;
  consum_flota: number | null;  // media flotei = total litri / total km × 100
  masini_total: number;
  probleme_total: number;
  directii: KmPerioadaDirectie[];
};

type GpsJoinRow = {
  vehicle_id: string;
  km_total: number | null;
  km_patched: number | null;
  suspect_reason: string | null;
  vehicles: { plate_number: string; directions: string[] | null } | null;
};

// praguri «divergență majoră» — doar menționăm motivul, nu cârpim nimic
const KM_LIPSA_MAJOR = 5;      // km pierduți în găuri GPS demni de menționat (pe zi)
const PERIOADA_MAX_ZILE = 92;  // plafon interval — un an de rânduri ar însemna zeci de round-trip-uri

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ambele tabele de alimentări — card (Benzol) + numerar; aceeași sumă ca tablou-zilnic și engine-ul DT (§3.6)
const FUEL_TABLES = ['lde_fuel_alimentari', 'lde_fuel_alimentari_cash'] as const;

/**
 * Km + motorină per direcție/mașină pe perioadă (default = luna curentă).
 * Media l/100km = total litri / total km — pe o perioadă lungă eroarea de rezervor e neglijabilă.
 */
export async function getKmPerioada(from?: string, to?: string): Promise<KmPerioada> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const t = to && DATE_RE.test(to) ? to : todayIso();
  let f = from && DATE_RE.test(from) ? from : monthStartIso();
  if (f > t) f = t;
  // plafon: tăiem începutul intervalului, sfârșitul rămâne cel cerut
  const minF = new Date(`${t}T00:00:00Z`);
  minF.setUTCDate(minF.getUTCDate() - (PERIOADA_MAX_ZILE - 1));
  const minFIso = minF.toISOString().slice(0, 10);
  if (f < minFIso) f = minFIso;

  // GPS pe perioadă — paginat (mașini × zile depășește plafonul PostgREST de 1000);
  // order stabil obligatoriu: .range fără .order poate dubla/pierde rânduri între pagini
  const gps: GpsJoinRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('lde_vehicle_gps_daily')
      .select('vehicle_id, km_total, km_patched, suspect_reason, vehicles ( plate_number, directions )')
      .gte('date', f)
      .lte('date', t)
      .order('vehicle_id', { ascending: true })
      .order('date', { ascending: true })
      .range(offset, offset + 999);
    if (error) break;
    gps.push(...((data ?? []) as unknown as GpsJoinRow[]));
    if (!data || data.length < 1000) break;
  }

  // Alimentări pe perioadă (card + numerar) — paginat; alimentat_at e timestamptz, perioada în ore Chișinău
  const litriByVeh = new Map<string, number>();
  for (const table of FUEL_TABLES) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await sb
        .from(table)
        .select('vehicle_id, litri')
        .gte('alimentat_at', `${f}T00:00:00+03:00`)
        .lt('alimentat_at', `${nextDayIso(t)}T00:00:00+03:00`)
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (!data?.length) break;
      for (const r of data) litriByVeh.set(r.vehicle_id, (litriByVeh.get(r.vehicle_id) ?? 0) + Number(r.litri ?? 0));
      if (data.length < 1000) break;
    }
  }

  // agregare per mașină
  type Acc = { plate: string; directie: string; km: number; km_patched: number; zile_sare: number; zile_parcare: number };
  const byVeh = new Map<string, Acc>();
  for (const raw of gps) {
    const acc = byVeh.get(raw.vehicle_id) ?? {
      // render standardizat: fără spații în numărul auto («692 TWK» → «692TWK»)
      plate: (raw.vehicles?.plate_number ?? '?').replace(/\s+/g, ''),
      directie: raw.vehicles?.directions?.[0] ?? 'Fără direcție',
      km: 0, km_patched: 0, zile_sare: 0, zile_parcare: 0,
    };
    acc.km += Number(raw.km_total ?? 0);
    const patched = Number(raw.km_patched ?? 0);
    if (patched >= KM_LIPSA_MAJOR) { acc.zile_sare += 1; acc.km_patched += patched; }
    if (raw.suspect_reason?.startsWith('km_parcare')) acc.zile_parcare += 1;
    byVeh.set(raw.vehicle_id, acc);
  }

  // mașini cu litri dar fără niciun rând GPS în perioadă — semnal important (litri fără km)
  const faraGps = [...litriByVeh.keys()].filter((id) => !byVeh.has(id));
  if (faraGps.length) {
    const { data: vehs } = await sb.from('vehicles').select('id, plate_number, directions').in('id', faraGps);
    for (const v of (vehs ?? []) as Array<{ id: string; plate_number: string | null; directions: string[] | null }>) {
      byVeh.set(v.id, {
        plate: (v.plate_number ?? '?').replace(/\s+/g, ''),
        directie: v.directions?.[0] ?? 'Fără direcție',
        km: 0, km_patched: 0, zile_sare: 0, zile_parcare: 0,
      });
    }
  }

  const byDir = new Map<string, KmPerioadaDirectie>();
  let kmFlota = 0;
  let litriFlota = 0;
  let problemeTotal = 0;

  for (const [vid, acc] of byVeh) {
    const litri = litriByVeh.get(vid) ?? 0;
    const probleme: string[] = [];
    if (acc.zile_sare) probleme.push(`Sare GPS-ul — ${acc.zile_sare} ${acc.zile_sare === 1 ? 'zi' : 'zile'} (~${acc.km_patched.toFixed(1)} km)`);
    if (acc.zile_parcare) probleme.push(`Km la parcare — ${acc.zile_parcare} ${acc.zile_parcare === 1 ? 'zi' : 'zile'}`);
    if (acc.km < 1 && litri > 0) probleme.push('Litri fără km — GPS lipsă în perioadă');

    const row: KmPerioadaRow = {
      vehicle_id: vid,
      plate_number: acc.plate,
      km: acc.km,
      litri,
      consum: acc.km >= 1 && litri > 0 ? (litri / acc.km) * 100 : null,
      probleme,
    };
    if (!byDir.has(acc.directie)) {
      byDir.set(acc.directie, { directie: acc.directie, km_total: 0, litri_total: 0, masini: 0, cu_probleme: 0, rows: [] });
    }
    const g = byDir.get(acc.directie)!;
    g.rows.push(row);
    g.km_total += row.km;
    g.litri_total += litri;
    g.masini += 1;
    if (probleme.length) g.cu_probleme += 1;
    kmFlota += row.km;
    litriFlota += litri;
    if (probleme.length) problemeTotal += 1;
  }

  const directii = [...byDir.values()].sort((a, b) => b.km_total - a.km_total);
  for (const g of directii) {
    g.rows.sort((a, b) =>
      a.probleme.length === 0 && b.probleme.length === 0
        ? b.km - a.km
        : b.probleme.length - a.probleme.length || b.km - a.km
    );
    g.km_total = Math.round(g.km_total);
    g.litri_total = Math.round(g.litri_total);
  }

  return {
    from: f,
    to: t,
    km_flota: Math.round(kmFlota),
    litri_flota: Math.round(litriFlota),
    consum_flota: kmFlota >= 1 && litriFlota > 0 ? (litriFlota / kmFlota) * 100 : null,
    masini_total: byVeh.size,
    probleme_total: problemeTotal,
    directii,
  };
}

export type KmZiDetaliu = {
  date: string;
  km: number;
  litri: number;
  alimentari: number;   // câte alimentări în ziua respectivă
  probleme: string[];
};

/** Drill-down: zilele unei mașini în perioadă (km/zi + alimentări/zi). */
export async function getKmZileMasina(vehicleId: string, from: string, to: string): Promise<KmZiDetaliu[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const { data: gps } = await sb
    .from('lde_vehicle_gps_daily')
    .select('date, km_total, km_patched, suspect_reason')
    .eq('vehicle_id', vehicleId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  // card + numerar — aceeași sumă ca în getKmPerioada
  const fuel: Array<{ alimentat_at: string; litri: number | null }> = [];
  for (const table of FUEL_TABLES) {
    const { data } = await sb
      .from(table)
      .select('alimentat_at, litri')
      .eq('vehicle_id', vehicleId)
      .gte('alimentat_at', `${from}T00:00:00+03:00`)
      .lt('alimentat_at', `${nextDayIso(to)}T00:00:00+03:00`);
    fuel.push(...((data ?? []) as typeof fuel));
  }

  const byDay = new Map<string, KmZiDetaliu>();
  for (const g of (gps ?? []) as Array<{ date: string; km_total: number | null; km_patched: number | null; suspect_reason: string | null }>) {
    const probleme: string[] = [];
    const patched = Number(g.km_patched ?? 0);
    if (patched >= KM_LIPSA_MAJOR) probleme.push(`Sare GPS-ul — ~${patched.toFixed(1)} km`);
    if (g.suspect_reason?.startsWith('km_parcare')) probleme.push('Km numărați la parcare — GPS tremură pe loc');
    byDay.set(g.date, { date: g.date, km: Number(g.km_total ?? 0), litri: 0, alimentari: 0, probleme });
  }
  for (const fr of (fuel ?? []) as Array<{ alimentat_at: string; litri: number | null }>) {
    const day = chisinauDay(fr.alimentat_at);
    const d = byDay.get(day) ?? { date: day, km: 0, litri: 0, alimentari: 0, probleme: [] };
    d.litri += Number(fr.litri ?? 0);
    d.alimentari += 1;
    byDay.set(day, d);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
