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
  km: number;               // km_total (GPS curat + porțiuni recuperate) — aceeași cifră ca în salarii/acte
  probleme: string[];       // motive de divergență majoră — menționate, NU corectate
  traseu?: string;          // doar «Fără direcție»: localitățile zilei din GPS — unde a fost auto
  directie_probabila?: string; // doar «Fără direcție»: direcția dedusă din suprapunerea traseului cu flota
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
  suspect: boolean | null;
  suspect_reason: string | null;
  vehicles: { plate_number: string; directions: string[] | null } | null;
};

// praguri «divergență majoră» — doar menționăm motivul, nu cârpim nimic
const KM_LIPSA_MAJOR = 5;      // km pierduți în găuri GPS demni de menționat

/** Km zilnic per direcție/mașină (default = ieri). Km = km_total (ca în salarii); recuperările din găuri menționate la probleme. */
export async function getKmZilnic(date?: string): Promise<KmZilnic> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const day = date ?? yesterdayIso();

  const { data, error } = await sb
    .from('lde_vehicle_gps_daily')
    .select('vehicle_id, km_total, km_patched, suspect, suspect_reason, vehicles ( plate_number, directions )')
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

    const probleme: string[] = [];
    if (kmPatched >= KM_LIPSA_MAJOR) {
      probleme.push(`Sare GPS-ul — ~${kmPatched.toFixed(1)} km`);
    }
    if (raw.suspect_reason?.startsWith('km_parcare')) {
      probleme.push('Km numărați la parcare — GPS tremură pe loc');
    }

    const row: KmZiRow = {
      vehicle_id: raw.vehicle_id,
      // render standardizat: fără spații în numărul auto («692 TWK» → «692TWK»)
      plate_number: (raw.vehicles?.plate_number ?? '?').replace(/\s+/g, ''),
      km: kmTotal,
      probleme,
    };
    const directie = raw.vehicles?.directions?.[0] ?? 'Fără direcție';
    if (!byDir.has(directie)) {
      byDir.set(directie, { directie, km_total: 0, masini: 0, cu_probleme: 0, rows: [] });
    }
    const g = byDir.get(directie)!;
    g.rows.push(row);
    g.km_total += kmTotal;
    g.masini += 1;
    if (probleme.length) g.cu_probleme += 1;
    kmFlota += kmTotal;
    if (probleme.length) problemeTotal += 1;
  }

  // «Fără direcție»: din opririle GPS ale zilei arătăm UNDE a fost auto și deducem
  // direcția probabilă prin suprapunerea localităților cu mașinile care AU direcție.
  const faraDir = byDir.get('Fără direcție');
  if (faraDir?.rows.length) {
    // opriri paginat (PostgREST taie tăcut la 1000 — zilele aglomerate depășesc pragul)
    const stops: Array<{ vehicle_id: string; seq: number; locality: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await sb
        .from('lde_gps_stops')
        .select('vehicle_id, seq, locality')
        .eq('date', day)
        .order('vehicle_id', { ascending: true })
        .order('seq', { ascending: true })
        .range(from, from + 999);
      stops.push(...((page ?? []) as typeof stops));
      if (!page || page.length < 1000) break;
    }
    const locByVeh = new Map<string, string[]>();
    for (const s of stops) {
      if (!s.locality) continue;
      const arr = locByVeh.get(s.vehicle_id) ?? [];
      if (arr[arr.length - 1] !== s.locality) arr.push(s.locality);
      locByVeh.set(s.vehicle_id, arr);
    }
    // localitățile fiecărei direcții (din mașinile atribuite, aceeași zi)
    const dirLoc = new Map<string, Set<string>>();
    for (const g of byDir.values()) {
      if (g.directie === 'Fără direcție') continue;
      const set = dirLoc.get(g.directie) ?? new Set<string>();
      for (const r of g.rows) for (const l of locByVeh.get(r.vehicle_id) ?? []) set.add(l);
      dirLoc.set(g.directie, set);
    }
    for (const r of faraDir.rows) {
      const chain = locByVeh.get(r.vehicle_id) ?? [];
      if (!chain.length) continue;
      const uniq = [...new Set(chain)];
      r.traseu = uniq.length > 6 ? `${uniq.slice(0, 5).join(' → ')} → … → ${uniq[uniq.length - 1]}` : uniq.join(' → ');
      let best: { dir: string; score: number } | null = null;
      for (const [dir, set] of dirLoc) {
        const score = uniq.filter((l) => set.has(l)).length;
        if (score >= 2 && (best == null || score > best.score)) best = { dir, score };
      }
      if (best) r.directie_probabila = best.dir;
    }
  }

  const directii = [...byDir.values()].sort((a, b) => b.km_total - a.km_total);
  for (const g of directii) {
    g.rows.sort((a, b) =>
      a.probleme.length === 0 && b.probleme.length === 0
        ? b.km - a.km
        : b.probleme.length - a.probleme.length || b.km - a.km
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
