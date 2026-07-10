'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type KmZiRow = {
  vehicle_id: string;
  plate_number: string;
  km_real: number;          // DOAR GPS curat: km_total − km_patched (fără nicio cârpire)
  probleme: string[];       // motive de divergență majoră — menționate, NU corectate
};

export type KmZiDirectie = {
  directie: string;
  km_total: number;
  masini: number;
  cu_probleme: number;
  rows: KmZiRow[];
};

export type KmZilnic = {
  date: string;
  km_flota: number;
  masini_total: number;
  probleme_total: number;
  directii: KmZiDirectie[];
};

type GpsJoinRow = {
  vehicle_id: string;
  km_total: number | null;
  km_patched: number | null;
  km_check: number | null;
  suspect: boolean | null;
  suspect_reason: string | null;
  vehicles: { plate_number: string; directions: string[] | null } | null;
};

// praguri «divergență majoră» — doar menționăm motivul, nu cârpim nimic
const KM_LIPSA_MAJOR = 5;      // km pierduți în găuri GPS demni de menționat
const DIVERG_VITEZA = 0.3;     // |verificarea pe viteză − km| > 30% => dispozitiv suspect
const KM_MIN_DIVERG = 20;      // sub 20 km/zi procentele nu înseamnă nimic

/** Km zilnic per direcție/mașină (default = ieri). Km = doar GPS curat, problemele doar menționate. */
export async function getKmZilnic(date?: string): Promise<KmZilnic> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const day = date ?? yesterdayIso();

  const { data, error } = await sb
    .from('lde_vehicle_gps_daily')
    .select(
      'vehicle_id, km_total, km_patched, km_check, suspect, suspect_reason, vehicles ( plate_number, directions )'
    )
    .eq('date', day);

  if (error) {
    return { date: day, km_flota: 0, masini_total: 0, probleme_total: 0, directii: [] };
  }

  const byDir = new Map<string, KmZiDirectie>();
  let kmFlota = 0;
  let problemeTotal = 0;

  for (const raw of (data ?? []) as unknown as GpsJoinRow[]) {
    const kmTotal = Number(raw.km_total ?? 0);
    const kmPatched = Number(raw.km_patched ?? 0);
    const kmReal = Math.max(0, +(kmTotal - kmPatched).toFixed(1));
    const kmCheck = raw.km_check == null ? null : Number(raw.km_check);

    const probleme: string[] = [];
    if (kmPatched >= KM_LIPSA_MAJOR) {
      probleme.push(`Sare GPS-ul — ~${kmPatched.toFixed(1)} km nemăsurați (gaură de semnal)`);
    }
    if (raw.suspect_reason?.startsWith('km_parcare')) {
      probleme.push('Km numărați la parcare — GPS tremură pe loc');
    }
    // km_check e verificarea lui km_total (integrează viteza și pe segmentele cârpite,
    // v. migrația 222) — comparația cu km_real ar da fals «viteză anormală» la zilele cu găuri
    if (
      kmCheck != null &&
      kmTotal > KM_MIN_DIVERG &&
      Math.abs(kmCheck - kmTotal) / kmTotal > DIVERG_VITEZA
    ) {
      probleme.push(`Viteză anormală — vitezometrul zice ${kmCheck.toFixed(0)} km, GPS-ul ${kmTotal.toFixed(0)} km`);
    }

    const row: KmZiRow = {
      vehicle_id: raw.vehicle_id,
      plate_number: raw.vehicles?.plate_number ?? '?',
      km_real: kmReal,
      probleme,
    };
    const directie = raw.vehicles?.directions?.[0] ?? 'Fără direcție';
    if (!byDir.has(directie)) {
      byDir.set(directie, { directie, km_total: 0, masini: 0, cu_probleme: 0, rows: [] });
    }
    const g = byDir.get(directie)!;
    g.rows.push(row);
    g.km_total += kmReal;
    g.masini += 1;
    if (probleme.length) g.cu_probleme += 1;
    kmFlota += kmReal;
    if (probleme.length) problemeTotal += 1;
  }

  const directii = [...byDir.values()].sort((a, b) => b.km_total - a.km_total);
  for (const g of directii) {
    g.rows.sort((a, b) =>
      a.probleme.length === 0 && b.probleme.length === 0
        ? b.km_real - a.km_real
        : b.probleme.length - a.probleme.length || b.km_real - a.km_real
    );
    g.km_total = Math.round(g.km_total);
  }

  return {
    date: day,
    km_flota: Math.round(kmFlota),
    masini_total: (data ?? []).length,
    probleme_total: problemeTotal,
    directii,
  };
}
