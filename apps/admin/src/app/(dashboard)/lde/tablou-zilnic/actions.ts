'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

// ── Helpers de dată (zi locală, fără TZ-shift) ─────────────────────────────
// Implicit = IERI. Format date string 'YYYY-MM-DD'.
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

// Aceeași zi cu o săptămână în urmă (pentru comparație).
function weekBeforeIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return isoDate(d);
}

// Fereastra timestamptz pentru o zi calendaristică (alimentat_at e timestamptz).
function dayBounds(dateStr: string): { fromIso: string; toIso: string } {
  const from = new Date(`${dateStr}T00:00:00.000Z`);
  const to = new Date(`${dateStr}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export type OwnerDaily = {
  date: string;                 // ziua afișată (default: ieri)
  combustibil_litri: number;    // SUM litri (benzol + cash) pe zi
  combustibil_lei: number;      // SUM lei (benzol + cash) pe zi
  km_total: number;             // SUM lde_vehicle_gps_daily.km_total pe zi
  alerte: { verde: number; galben: number; rosu: number };
  alerte_total: number;
  // Comparație cu aceeași zi săpt. trecută (combustibil lei + km). null dacă nu există date.
  prev_week: { date: string; combustibil_lei: number; km_total: number } | null;
};

type FuelRow = { litri: number | null; suma_lei: number | null };
type GpsRow = { km_total: number | null };

function sumFuel(rows: FuelRow[]): { litri: number; lei: number } {
  return rows.reduce(
    (acc, r) => ({
      litri: acc.litri + Number(r.litri ?? 0),
      lei: acc.lei + Number(r.suma_lei ?? 0),
    }),
    { litri: 0, lei: 0 }
  );
}

function sumKm(rows: GpsRow[]): number {
  return rows.reduce((s, r) => s + Number(r.km_total ?? 0), 0);
}

/**
 * Cele «5 cifre dimineața» pentru OWNER, pentru ziua dată (default = ieri).
 * Toate cifrele sunt NATIV LDE (combustibil, km, alerte). Venitul/profitul
 * NU se calculează aici — vezi modulul Numărare (link în UI).
 */
export async function getOwnerDaily(date?: string): Promise<OwnerDaily> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const day = date ?? yesterdayIso();
  const prevDay = weekBeforeIso(day);
  const { fromIso, toIso } = dayBounds(day);
  const prevBounds = dayBounds(prevDay);

  const [
    fuelBenzolRes,
    fuelCashRes,
    gpsRes,
    alertsRes,
    fuelBenzolPrevRes,
    fuelCashPrevRes,
    gpsPrevRes,
  ] = await Promise.all([
    // combustibil ziua dată — Benzol (card)
    sb
      .from('lde_fuel_alimentari')
      .select('litri, suma_lei')
      .gte('alimentat_at', fromIso)
      .lt('alimentat_at', toIso),
    // combustibil ziua dată — numerar (cash)
    sb
      .from('lde_fuel_alimentari_cash')
      .select('litri, suma_lei')
      .gte('alimentat_at', fromIso)
      .lt('alimentat_at', toIso),
    // km flotă ziua dată
    sb.from('lde_vehicle_gps_daily').select('km_total').eq('date', day),
    // alerte noi pe nivel (status='nou')
    sb.from('lde_dt_alerts').select('level').eq('status', 'nou'),
    // comparație săpt. trecută — combustibil Benzol
    sb
      .from('lde_fuel_alimentari')
      .select('litri, suma_lei')
      .gte('alimentat_at', prevBounds.fromIso)
      .lt('alimentat_at', prevBounds.toIso),
    // comparație săpt. trecută — combustibil cash
    sb
      .from('lde_fuel_alimentari_cash')
      .select('litri, suma_lei')
      .gte('alimentat_at', prevBounds.fromIso)
      .lt('alimentat_at', prevBounds.toIso),
    // comparație săpt. trecută — km
    sb.from('lde_vehicle_gps_daily').select('km_total').eq('date', prevDay),
  ]);

  // combustibil (benzol + cash) — toleranță la tabel gol
  const benzol = sumFuel((fuelBenzolRes.data ?? []) as FuelRow[]);
  const cash = sumFuel((fuelCashRes.data ?? []) as FuelRow[]);
  const combustibil_litri = benzol.litri + cash.litri;
  const combustibil_lei = benzol.lei + cash.lei;

  // km flotă — toleranță la tabel gol
  const km_total = sumKm((gpsRes.data ?? []) as GpsRow[]);

  // alerte noi pe nivel
  const alertRows = (alertsRes.data ?? []) as Array<{ level: string }>;
  const alerte = { verde: 0, galben: 0, rosu: 0 };
  for (const r of alertRows) {
    if (r.level === 'verde') alerte.verde++;
    else if (r.level === 'galben') alerte.galben++;
    else if (r.level === 'rosu') alerte.rosu++;
  }
  const alerte_total = alerte.verde + alerte.galben + alerte.rosu;

  // comparație săpt. trecută (combustibil lei + km)
  const prevBenzol = sumFuel((fuelBenzolPrevRes.data ?? []) as FuelRow[]);
  const prevCash = sumFuel((fuelCashPrevRes.data ?? []) as FuelRow[]);
  const prevKm = sumKm((gpsPrevRes.data ?? []) as GpsRow[]);
  const prevLei = prevBenzol.lei + prevCash.lei;
  const prev_week =
    prevLei === 0 && prevKm === 0
      ? null
      : { date: prevDay, combustibil_lei: prevLei, km_total: prevKm };

  return {
    date: day,
    combustibil_litri,
    combustibil_lei,
    km_total,
    alerte,
    alerte_total,
    prev_week,
  };
}

export type FuelByStatie = { statie: string; litri: number; lei: number; sursa: 'card' | 'numerar' };
export type AlertByLevel = { level: 'verde' | 'galben' | 'rosu'; count: number };

export type DailyBreakdown = {
  date: string;
  combustibil_pe_statii: FuelByStatie[];
  alerte_pe_nivel: AlertByLevel[];
};

/**
 * Drill-down pentru ziua dată: combustibil defalcat pe stații (+ sursă card/numerar)
 * și alertele noi defalcate pe nivel. Toleranță la tabele goale.
 */
export async function getDailyBreakdown(date?: string): Promise<DailyBreakdown> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  const day = date ?? yesterdayIso();
  const { fromIso, toIso } = dayBounds(day);

  const [benzolRes, cashRes, alertsRes] = await Promise.all([
    sb
      .from('lde_fuel_alimentari')
      .select('statie, litri, suma_lei')
      .gte('alimentat_at', fromIso)
      .lt('alimentat_at', toIso),
    sb
      .from('lde_fuel_alimentari_cash')
      .select('statie, litri, suma_lei')
      .gte('alimentat_at', fromIso)
      .lt('alimentat_at', toIso),
    sb.from('lde_dt_alerts').select('level').eq('status', 'nou'),
  ]);

  // grupare combustibil pe (statie, sursă)
  const map = new Map<string, FuelByStatie>();
  const add = (statie: string | null, litri: number | null, lei: number | null, sursa: 'card' | 'numerar') => {
    const key = `${sursa}::${statie ?? '—'}`;
    const cur = map.get(key) ?? { statie: statie ?? '—', litri: 0, lei: 0, sursa };
    cur.litri += Number(litri ?? 0);
    cur.lei += Number(lei ?? 0);
    map.set(key, cur);
  };
  for (const r of (benzolRes.data ?? []) as Array<{ statie: string | null; litri: number | null; suma_lei: number | null }>) {
    add(r.statie, r.litri, r.suma_lei, 'card');
  }
  for (const r of (cashRes.data ?? []) as Array<{ statie: string | null; litri: number | null; suma_lei: number | null }>) {
    add(r.statie, r.litri, r.suma_lei, 'numerar');
  }
  const combustibil_pe_statii = [...map.values()].sort((a, b) => b.lei - a.lei);

  // alerte pe nivel
  const counts = { verde: 0, galben: 0, rosu: 0 };
  for (const r of (alertsRes.data ?? []) as Array<{ level: string }>) {
    if (r.level === 'verde') counts.verde++;
    else if (r.level === 'galben') counts.galben++;
    else if (r.level === 'rosu') counts.rosu++;
  }
  const alerte_pe_nivel: AlertByLevel[] = [
    { level: 'rosu', count: counts.rosu },
    { level: 'galben', count: counts.galben },
    { level: 'verde', count: counts.verde },
  ];

  return { date: day, combustibil_pe_statii, alerte_pe_nivel };
}
