'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { isCashPatternSuspect } from '@translux/db';

// ============================================================================
// LDE — Indicații AI (semnale soft §3.7) — listare + MOTORUL celor 5 indicații + dismiss.
// Indicațiile NU sunt alerte DT confirmate (acelea trăiesc în lde_dt_alerts). Sunt
// atenționări prietenoase pentru admin: pattern-uri care MERITĂ o privire, nu furt dovedit.
//
// Singurul fragment de logică pură importat din @translux/db este isCashPatternSuspect
// (§3.6). Restul pragurilor sunt simple (oră/loc/km) și trăiesc aici — nu poluăm motorul DT.
// ============================================================================

// indication_type enum — sincron cu CHECK din migrarea 205 (lde_dt_indications.indication_type).
// ATENȚIE: semantica urmează §3.7 (Sinteza-interviuri-autopark.md), care e sursa de adevăr a task-ului.
// Valorile enum sunt cele din CHECK; comentariile din migrare descriu o variantă veche — irelevant pt. CHECK.
export type IndicationType =
  | 'timp_de_alimentare' // preventiv: a făcut mulți km de la ultima alimentare → «timpul să se alimenteze»
  | 'timp_strange' //       alimentare la oră nocturnă / în afara programului (06:00–22:00)
  | 'loc_strange' //        alimentare în afara celor 5 stații proprii
  | 'nu_alimentat_de_mult' // kilometraj activ dar nicio alimentare de mult
  | 'numerar_des'; //       >1 alimentare numerar/lună (isCashPatternSuspect)

export interface IndicationRow {
  id: string;
  vehicle_id: string;
  vehicle_plate: string;
  indication_type: IndicationType;
  generated_at: string;
  message_ro: string;
  context_data: Record<string, unknown> | null;
  dismissed_at: string | null;
}

export interface IndicationFilters {
  type?: IndicationType;
  vehicle_id?: string;
  active_only?: boolean; // dismissed_at IS NULL
}

// ── Listare indicații cu plăcuța mașinii (embedded select, fără N+1) ──
export async function getIndications(filters?: IndicationFilters): Promise<IndicationRow[]> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();

  let query = sb
    .from('lde_dt_indications')
    .select(
      `id, vehicle_id, indication_type, generated_at, message_ro, context_data, dismissed_at,
       vehicles!inner ( plate_number )`,
    )
    .order('generated_at', { ascending: false });

  if (filters?.type) query = query.eq('indication_type', filters.type);
  if (filters?.vehicle_id) query = query.eq('vehicle_id', filters.vehicle_id);
  if (filters?.active_only) query = query.is('dismissed_at', null);

  const { data, error } = await query;
  if (error) return [];

  return (data || []).map((r: any) => ({
    id: r.id,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicles?.plate_number ?? '—',
    indication_type: r.indication_type,
    generated_at: r.generated_at,
    message_ro: r.message_ro,
    context_data: r.context_data ?? null,
    dismissed_at: r.dismissed_at ?? null,
  }));
}

export interface GenerateIndicationsResult {
  generated: number;
  by_type: Record<IndicationType, number>;
}

// ── Praguri MOTOR (simple, documentate) ──────────────────────────────────────
// Cele 5 stații proprii (§3.7.3). Alimentare benzol în afara lor → loc_strange.
const OWN_STATIONS = new Set(['BRICENI', 'BALTI', 'UNGHENI', 'ORHEI', 'PETROM']);
// Normalizare defensivă a câmpului `statie`: upper-case + fără diacritice (Ă/Â→A, Î→I, Ș→S, Ț→T)
// + trim + spații multiple colapsate. ATENȚIE (DORMANT): nu există încă un importer Benzol în repo,
// deci formatul real al câmpului `statie` e NECONFIRMAT. Dacă Benzol livrează coduri compuse
// (ex. 'PETROM BALTI', 'BRICENI 1'), egalitatea strictă de mai jos NU se va potrivi și mașina va fi
// marcată fals «în afara stațiilor proprii». Confirmă un eșantion real ÎNAINTE de a activa loc_strange
// în producție; abia atunci decide matching prin prefix/substring sau o coloană de referință în DB.
function normalizeStation(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}
// Program normal de alimentare (oră locală). În afara [06:00, 22:00) → timp_strange (nocturn).
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
// «nu_alimentat_de_mult»: privim ultimele N zile ale lunii. Km activ acolo dar 0 alimentări → indicație.
const TAIL_DAYS = 7;
// «timp_de_alimentare» — PRAG ALES: 800 km parcurși de la ultima alimentare, cu km activ în coadă.
// Justificare: autobuzele LDE au rezervor mare; ~800 km e un plin tipic apropiat de epuizare →
// preventiv «e timpul să alimenteze». Prag simplu, fără odometru (lde_fuel_alimentari nu-l are);
// km vine din GPS pe intervalul de la ultima alimentare până la sfârșitul lunii.
const REFUEL_KM_THRESHOLD = 800;

// Borna de luni: 'YYYY-MM-01' → margini UTC + cheia 'YYYY-MM' pentru ancorarea idempotentă în context_data.
function monthBounds(period_month: string): {
  monthKey: string;
  startDate: string;
  endDate: string;
  startISO: string;
  endISO: string;
} {
  const start = new Date(period_month + 'T00:00:00Z');
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return {
    monthKey: period_month.slice(0, 7), // 'YYYY-MM'
    startDate: period_month, // 'YYYY-MM-01'
    endDate: end.toISOString().slice(0, 10),
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}

// Ora locală Moldova (0–23) a unui timestamp ISO. Convenția proiectului = Europe/Chisinau
// (UTC+2/+3 cu DST). getHours() pe Vercel ar da ora UTC → fals negativ/pozitiv la check-ul nocturn.
function chisinauHour(iso: string): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Chisinau',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  // 'en-GB' + hour12:false → '00'..'23' (uneori '24' la miezul nopții pe unele runtime-uri → normalizăm).
  return Number(h) % 24;
}

// Sumă km GPS pe interval [fromDate, toDate] inclusiv, dintr-o listă pre-sortată.
function sumGpsKm(
  gps: Array<{ date: string; km: number }>,
  fromDate: string,
  toDate: string,
): { km: number; hasData: boolean } {
  let km = 0;
  let hasData = false;
  for (const g of gps) {
    if (g.date >= fromDate && g.date <= toDate) {
      km += g.km;
      hasData = true;
    }
  }
  return { km: Math.round(km * 100) / 100, hasData };
}

type PendingIndication = {
  vehicle_id: string;
  indication_type: IndicationType;
  message_ro: string;
  context_data: Record<string, unknown>;
};

// ── MOTORUL: generează cele 5 indicații AI pentru o lună (batch-fetch, fără N+1) ──
export async function generateIndications(period_month: string): Promise<GenerateIndicationsResult> {
  requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { monthKey, startDate, endDate, startISO, endISO } = monthBounds(period_month);

  const empty: GenerateIndicationsResult = {
    generated: 0,
    by_type: {
      timp_de_alimentare: 0,
      timp_strange: 0,
      loc_strange: 0,
      nu_alimentat_de_mult: 0,
      numerar_des: 0,
    },
  };

  // a) Vehiculele LDE = cele cu rând în lde_vehicle_norms (același univers ca alertele DT).
  const { data: norms } = await sb.from('lde_vehicle_norms').select('vehicle_id');
  const vehicleIds = [...new Set((norms || []).map((n: any) => n.vehicle_id as string))];
  if (vehicleIds.length === 0) {
    // Niciun vehicul LDE → curăță indicațiile ne-dismissed ale lunii și ieși.
    await deleteActiveIndicationsForMonth(sb, monthKey);
    return empty;
  }

  // Placa per vehicul — message_ro e standalone (nu depinde de JOIN la afișare).
  const plateByVehicle = new Map<string, string>();
  {
    const { data: vehicles } = await sb.from('vehicles').select('id, plate_number').in('id', vehicleIds);
    for (const v of vehicles || []) plateByVehicle.set(v.id, v.plate_number);
  }
  const plate = (vid: string) => plateByVehicle.get(vid) ?? '—';

  // b) Batch-fetch tot ce ține de lună, o singură interogare pe sursă (fără N+1).
  const [{ data: fuelRows }, { data: cashRows }, { data: gpsRows }] = await Promise.all([
    sb
      .from('lde_fuel_alimentari')
      .select('vehicle_id, alimentat_at, litri, statie')
      .gte('alimentat_at', startISO)
      .lte('alimentat_at', endISO)
      .in('vehicle_id', vehicleIds)
      .order('alimentat_at', { ascending: true }),
    sb
      .from('lde_fuel_alimentari_cash')
      .select('vehicle_id, alimentat_at')
      .gte('alimentat_at', startISO)
      .lte('alimentat_at', endISO)
      .in('vehicle_id', vehicleIds),
    sb
      .from('lde_vehicle_gps_daily')
      .select('vehicle_id, date, km_total')
      .gte('date', startDate)
      .lte('date', endDate)
      .in('vehicle_id', vehicleIds)
      .order('date', { ascending: true }),
  ]);

  // Grupare pe vehicul.
  const fuelByVehicle = new Map<string, Array<{ alimentat_at: string; litri: number; statie: string }>>();
  for (const f of fuelRows || []) {
    const arr = fuelByVehicle.get(f.vehicle_id) || [];
    arr.push({ alimentat_at: f.alimentat_at, litri: Number(f.litri), statie: (f.statie || '').trim() });
    fuelByVehicle.set(f.vehicle_id, arr);
  }
  const cashCountByVehicle = new Map<string, number>();
  for (const c of cashRows || []) {
    cashCountByVehicle.set(c.vehicle_id, (cashCountByVehicle.get(c.vehicle_id) || 0) + 1);
  }
  const gpsByVehicle = new Map<string, Array<{ date: string; km: number }>>();
  for (const g of gpsRows || []) {
    const arr = gpsByVehicle.get(g.vehicle_id) || [];
    arr.push({ date: g.date, km: Number(g.km_total) });
    gpsByVehicle.set(g.vehicle_id, arr);
  }

  // Coada lunii [tailStart, endDate] pentru «nu_alimentat_de_mult» (ultimele TAIL_DAYS zile).
  const endDateObj = new Date(endDate + 'T00:00:00Z');
  const tailStartObj = new Date(endDateObj);
  tailStartObj.setUTCDate(endDateObj.getUTCDate() - (TAIL_DAYS - 1));
  const tailStart = tailStartObj.toISOString().slice(0, 10);

  const pending: PendingIndication[] = [];
  const by_type = { ...empty.by_type };

  for (const vehicleId of vehicleIds) {
    const fuel = fuelByVehicle.get(vehicleId) || [];
    const gps = gpsByVehicle.get(vehicleId) || [];

    // 1) numerar_des — >1 alimentare numerar/lună (§3.6, isCashPatternSuspect).
    const cashCount = cashCountByVehicle.get(vehicleId) || 0;
    if (isCashPatternSuspect(cashCount)) {
      pending.push({
        vehicle_id: vehicleId,
        indication_type: 'numerar_des',
        message_ro: `Mașina ${plate(vehicleId)}: ${cashCount} alimentări în numerar luna asta (>1).`,
        context_data: { period: monthKey, cash_count: cashCount },
      });
      by_type.numerar_des++;
    }

    // 2) loc_strange — alimentare benzol într-o stație din afara celor 5 proprii.
    //    (cash are stație text-liber → sărim, conform task.)
    const foreignStations = [...new Set(fuel.map((f) => f.statie).filter((s) => s && !OWN_STATIONS.has(normalizeStation(s))))];
    if (foreignStations.length > 0) {
      pending.push({
        vehicle_id: vehicleId,
        indication_type: 'loc_strange',
        message_ro: `Mașina ${plate(vehicleId)}: alimentare în afara stațiilor proprii (${foreignStations.join(', ')}).`,
        context_data: { period: monthKey, stations: foreignStations },
      });
      by_type.loc_strange++;
    }

    // 3) timp_strange — alimentare benzol la oră nocturnă (în afara [06:00, 22:00) oră Moldova).
    const nightHours = fuel
      .map((f) => chisinauHour(f.alimentat_at))
      .filter((h) => h < DAY_START_HOUR || h >= DAY_END_HOUR);
    if (nightHours.length > 0) {
      const hoursLabel = [...new Set(nightHours)]
        .sort((a, b) => a - b)
        .map((h) => `${String(h).padStart(2, '0')}:00`)
        .join(', ');
      pending.push({
        vehicle_id: vehicleId,
        indication_type: 'timp_strange',
        message_ro: `Mașina ${plate(vehicleId)}: ${nightHours.length} alimentări la oră nocturnă (${hoursLabel}).`,
        context_data: { period: monthKey, night_count: nightHours.length, hours: [...new Set(nightHours)].sort((a, b) => a - b) },
      });
      by_type.timp_strange++;
    }

    // 4) nu_alimentat_de_mult — km activ în coada lunii DAR nicio alimentare în acel interval.
    const { km: tailKm, hasData: hasTailGps } = sumGpsKm(gps, tailStart, endDate);
    if (hasTailGps && tailKm > 0) {
      const refueledInTail = fuel.some((f) => {
        const d = f.alimentat_at.slice(0, 10);
        return d >= tailStart && d <= endDate;
      });
      if (!refueledInTail) {
        pending.push({
          vehicle_id: vehicleId,
          indication_type: 'nu_alimentat_de_mult',
          message_ro: `Mașina ${plate(vehicleId)}: ${Math.round(tailKm)} km în ultimele ${TAIL_DAYS} zile, dar nicio alimentare.`,
          context_data: { period: monthKey, tail_days: TAIL_DAYS, tail_km: tailKm, tail_from: tailStart, tail_to: endDate },
        });
        by_type.nu_alimentat_de_mult++;
      }
    }

    // 5) timp_de_alimentare — preventiv: km de la ultima alimentare > REFUEL_KM_THRESHOLD, cu km activ.
    //    «ultima alimentare» = cel mai recent alimentat_at din lună (fuel e sortat crescător).
    if (fuel.length > 0) {
      const lastFuelDate = fuel[fuel.length - 1].alimentat_at.slice(0, 10);
      const { km: kmSinceLast, hasData: hasGpsAfter } = sumGpsKm(gps, lastFuelDate, endDate);
      if (hasGpsAfter && kmSinceLast > REFUEL_KM_THRESHOLD) {
        pending.push({
          vehicle_id: vehicleId,
          indication_type: 'timp_de_alimentare',
          message_ro: `Mașina ${plate(vehicleId)}: ${Math.round(kmSinceLast)} km de la ultima alimentare (prag ${REFUEL_KM_THRESHOLD} km) — timpul să se alimenteze.`,
          context_data: {
            period: monthKey,
            km_since_last: kmSinceLast,
            threshold_km: REFUEL_KM_THRESHOLD,
            last_fuel_date: lastFuelDate,
          },
        });
        by_type.timp_de_alimentare++;
      }
    }
  }

  // c) Idempotență: șterge indicațiile NE-dismissed ale lunii (ancoră = context_data.period),
  //    apoi re-inserăm. Cele dismissed rămân (adminul le-a închis deja).
  await deleteActiveIndicationsForMonth(sb, monthKey);

  let generated = 0;
  if (pending.length > 0) {
    // id client-side (crypto.randomUUID) — bulk insert fără dependență de ordine.
    const rows = pending.map((p) => ({
      id: crypto.randomUUID(),
      vehicle_id: p.vehicle_id,
      indication_type: p.indication_type,
      message_ro: p.message_ro,
      context_data: p.context_data,
    }));
    const { error: insErr } = await sb.from('lde_dt_indications').insert(rows);
    if (insErr) throw new Error(`Eroare la salvarea indicațiilor: ${insErr.message}`);
    generated = rows.length;
  }

  revalidatePath('/lde/indicatii');
  return { generated, by_type };
}

// Șterge indicațiile ne-dismissed ancorate la luna respectivă (context_data->>period = 'YYYY-MM').
async function deleteActiveIndicationsForMonth(sb: ReturnType<typeof getSupabase>, monthKey: string): Promise<void> {
  await sb.from('lde_dt_indications').delete().is('dismissed_at', null).eq('context_data->>period', monthKey);
}

// ── Închide o indicație (dismiss) ──
export async function dismissIndication(id: string): Promise<void> {
  const session = requireRole(await verifySession(), 'ADMIN');
  const sb = getSupabase();
  const { error } = await sb
    .from('lde_dt_indications')
    .update({ dismissed_at: new Date().toISOString(), dismissed_by_admin_id: session.id })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/lde/indicatii');
}
