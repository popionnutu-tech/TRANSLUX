'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { LdeVehicleType, LdeOverrideReason } from '@translux/db';

export interface LdeVehicleNormRow {
  vehicle_id: string;
  plate_number: string;
  vehicle_type_id: string | null;
  type_name: string | null;
  norm_type: number | null;                 // norma tipului (COALESCE-able)
  measured: number | null;                  // override măsurat (camioane: gol/min)
  measured_loaded: number | null;           // doar camioane: încărcat (max interval)
  effective_norm: number | null;            // COALESCE(measured_loaded, measured, norm_type)
  in_repair: boolean;
  override_reason: LdeOverrideReason | null;
  override_notes: string | null;
  has_type: boolean;                         // false → DT inactiv pentru mașină
  // Ion, 23.09.2026: «bagă în nomenclator la mașină locul de trai» — declarat, nu dedus.
  home_locality: string | null;
  home_driver: string | null;
  home_since: string | null;
  home_note: string | null;
  // Ce vede GPS-ul în ultimele 30 de zile. Nu suprascrie nimic: stă alături, iar când se
  // desparte de valoarea declarată, ăsta e semnul că s-a schimbat șoferul.
  gps_home: string | null;       // unde a dormit cel mai des în ultimele 30 de zile
  gps_nopti: number;
  gps_recent: string | null;     // unde doarme în ultimele 7 zile — ăsta se mișcă primul
  gps_nopti_recent: number;
  gps_ultima: string | null;     // unde a stat noaptea trecută, fără mediere
  gps_ultima_zi: string | null;
}

/** Tipurile de mașini pentru dropdown. */
export async function getVehicleTypes(): Promise<LdeVehicleType[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data, error } = await getSupabase()
    .from('lde_vehicle_types')
    .select('*')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []) as LdeVehicleType[];
}

/**
 * Toate vehiculele active + LEFT JOIN lde_vehicle_norms + lde_vehicle_types.
 * Norma efectivă = COALESCE(measured, type.norm_l_per_100km).
 * has_type=false → mașina nu are tip atribuit → DT nu poate calcula norma.
 */
export async function getVehicleNorms(): Promise<LdeVehicleNormRow[]> {
  requireRole(await verifySession(), 'ADMIN');

  const sb = getSupabase();

  // vehicles 1:0..1 lde_vehicle_norms, iar norms → lde_vehicle_types (pentru norma tipului).
  const { data, error } = await sb
    .from('vehicles')
    .select(
      'id, plate_number, lde_vehicle_norms ( vehicle_type_id, measured_consumption_l_per_100km, measured_consumption_l_per_100km_loaded, in_repair, override_reason, override_notes, home_locality, home_driver, home_since, home_note, lde_vehicle_types ( display_name, norm_l_per_100km ) )'
    )
    .eq('active', true)
    .order('plate_number');

  if (error) throw new Error(error.message);

  // Unde a dormit fiecare mașină în ultimele 30 de zile, după opririle de bază. PostgREST
  // taie la 1000 de rânduri indiferent de limit, deci se citește pe pagini (vezi nota din
  // memoria proiectului despre plafonul de 1000).
  const de = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  // Ion, 23.09.2026: «locul de trai se mișcă odată cu mișcarea în perioada de odihnă a
  // mașinii». Deci nu e destulă o singură medie pe 30 de zile: aia se mișcă abia după
  // săptămâni. Se ține și fereastra de 7 zile — când ele se despart, mutarea tocmai s-a
  // întâmplat și se vede în aceeași zi, nu peste o lună.
  const deRecent = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const nopti = new Map<string, Map<string, number>>();
  const noptiRecent = new Map<string, Map<string, number>>();
  // Ion, 23.09.2026: «poate punem unde se află mașina în perioada de odihnă». Media spune
  // unde doarme de obicei; asta spune unde a stat noaptea trecută, fără nicio mediere.
  const ultima = new Map<string, { loc: string; zi: string }>();
  for (let d = 0; d < 20000; d += 1000) {
    const { data: st } = await sb
      .from('lde_gps_stops')
      .select('vehicle_id, locality, date')
      .eq('is_base', true)
      .gte('date', de)
      .not('locality', 'is', null)
      .range(d, d + 999);
    if (!st || st.length === 0) break;
    for (const r of st as any[]) {
      for (const [harta, activ] of [[nopti, true], [noptiRecent, r.date >= deRecent]] as const) {
        if (!activ) continue;
        if (!harta.has(r.vehicle_id)) harta.set(r.vehicle_id, new Map());
        const m = harta.get(r.vehicle_id)!;
        m.set(r.locality, (m.get(r.locality) || 0) + 1);
      }
      const u = ultima.get(r.vehicle_id);
      if (!u || r.date > u.zi) ultima.set(r.vehicle_id, { loc: r.locality, zi: r.date });
    }
    if (st.length < 1000) break;
  }

  return (data || []).map((v: any): LdeVehicleNormRow => {
    const norm = Array.isArray(v.lde_vehicle_norms) ? v.lde_vehicle_norms[0] : v.lde_vehicle_norms;
    const type = norm
      ? Array.isArray(norm.lde_vehicle_types)
        ? norm.lde_vehicle_types[0]
        : norm.lde_vehicle_types
      : null;

    const vehicle_type_id: string | null = norm?.vehicle_type_id ?? null;
    const norm_type: number | null = type?.norm_l_per_100km ?? null;
    const measured: number | null = norm?.measured_consumption_l_per_100km ?? null;
    const measured_loaded: number | null = norm?.measured_consumption_l_per_100km_loaded ?? null;

    return {
      vehicle_id: v.id as string,
      plate_number: v.plate_number as string,
      vehicle_type_id,
      type_name: type?.display_name ?? null,
      norm_type,
      measured,
      measured_loaded,
      effective_norm: measured_loaded ?? measured ?? norm_type,
      in_repair: norm?.in_repair ?? false,
      override_reason: (norm?.override_reason ?? null) as LdeOverrideReason | null,
      override_notes: norm?.override_notes ?? null,
      has_type: !!vehicle_type_id,
      home_locality: norm?.home_locality ?? null,
      home_driver: norm?.home_driver ?? null,
      home_since: norm?.home_since ?? null,
      home_note: norm?.home_note ?? null,
      ...(() => {
        const varf = (h: Map<string, Map<string, number>>) => {
          const m = h.get(v.id as string);
          if (!m || m.size === 0) return [null, 0] as const;
          return [...m.entries()].sort((a, b) => b[1] - a[1])[0] as readonly [string, number];
        };
        const [l30, n30] = varf(nopti);
        const [l7, n7] = varf(noptiRecent);
        const u = ultima.get(v.id as string) ?? null;
        return {
          gps_home: l30, gps_nopti: n30, gps_recent: l7, gps_nopti_recent: n7,
          gps_ultima: u?.loc ?? null, gps_ultima_zi: u?.zi ?? null,
        };
      })(),
    };
  });
}

/**
 * Atribuie tipul unei mașini (upsert lde_vehicle_norms).
 * measured rămâne ce era (sau NULL la creare) — atribuirea tipului NU șterge override-ul.
 */
export async function assignVehicleType(vehicle_id: string, vehicle_type_id: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');
  if (!vehicle_type_id) throw new Error('vehicle_type_id este obligatoriu');

  const sb = getSupabase();
  const { error } = await sb
    .from('lde_vehicle_norms')
    .upsert(
      { vehicle_id, vehicle_type_id, updated_at: new Date().toISOString() },
      { onConflict: 'vehicle_id' }
    );
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/**
 * Setează override-ul de consum măsurat + motivul.
 * Necesită ca mașina să aibă deja tip (rândul există) — altfel vehicle_type_id ar fi NULL (NOT NULL în 203).
 */
export async function setMeasuredOverride(
  vehicle_id: string,
  measured: number,
  override_reason: LdeOverrideReason | null,
  measured_loaded: number | null = null
) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');
  if (!Number.isFinite(measured) || measured <= 0) {
    throw new Error('Consumul măsurat trebuie să fie un număr pozitiv');
  }
  if (measured_loaded != null && (!Number.isFinite(measured_loaded) || measured_loaded < measured)) {
    throw new Error('Consumul încărcat trebuie să fie ≥ consumul gol');
  }

  const sb = getSupabase();
  const { data: existing, error: selErr } = await sb
    .from('lde_vehicle_norms')
    .select('vehicle_id')
    .eq('vehicle_id', vehicle_id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) {
    throw new Error('Atribuie întâi un tip mașinii, apoi setează consumul măsurat.');
  }

  const { error } = await sb
    .from('lde_vehicle_norms')
    .update({
      measured_consumption_l_per_100km: measured,
      measured_consumption_l_per_100km_loaded: measured_loaded,
      override_reason,
      updated_at: new Date().toISOString(),
    })
    .eq('vehicle_id', vehicle_id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/** Șterge override-ul (measured NULL) → mașina revine la norma tipului. */
export async function clearMeasured(vehicle_id: string) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');

  const sb = getSupabase();
  const { error } = await sb
    .from('lde_vehicle_norms')
    .update({
      measured_consumption_l_per_100km: null,
      measured_consumption_l_per_100km_loaded: null,
      override_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('vehicle_id', vehicle_id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/** Comută starea «în reparație». Necesită rând existent (tip atribuit). */
export async function toggleInRepair(vehicle_id: string, in_repair: boolean) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');

  const sb = getSupabase();
  const { data: existing, error: selErr } = await sb
    .from('lde_vehicle_norms')
    .select('vehicle_id')
    .eq('vehicle_id', vehicle_id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) {
    throw new Error('Atribuie întâi un tip mașinii.');
  }

  const { error } = await sb
    .from('lde_vehicle_norms')
    .update({ in_repair, updated_at: new Date().toISOString() })
    .eq('vehicle_id', vehicle_id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}

/**
 * Locul de trai al șoferului mașinii.
 *
 * Ion, 23.09.2026: «dacă el se schimbă — apare alt șofer — schimb locul de trai». Deci se
 * scrie cu mâna, nu se deduce: GPS-ul spune unde a dormit mașina, dar nu știe dacă e vorba
 * de un șofer nou sau de o săptămână la reparație. `home_since` ține de când e valabil, ca
 * kilometrii de dinainte și de după schimbare să se poată socoti din case diferite.
 */
export async function setVehicleHome(
  vehicle_id: string,
  home: { locality: string | null; driver: string | null; since: string | null; note: string | null },
) {
  requireRole(await verifySession(), 'ADMIN');
  if (!vehicle_id) throw new Error('vehicle_id este obligatoriu');

  const gol = (x: string | null) => (x && x.trim() ? x.trim() : null);
  const { error } = await getSupabase()
    .from('lde_vehicle_norms')
    .upsert(
      {
        vehicle_id,
        home_locality: gol(home.locality),
        home_driver: gol(home.driver),
        home_since: gol(home.since),
        home_note: gol(home.note),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'vehicle_id' },
    );
  if (error) throw new Error(error.message);
  revalidatePath('/lde/vehicule');
}
