// ============================================================================
// LDE — Motor de calcul DT (motorină / перерасход) — prioritatea #1
// Funcții PURE (fără side-effects, fără DB) — testabile.
// Sursă formule: Sinteza-interviuri-autopark.md §3
//
// Detecție перерасход = (alimentare reală L/100km) − (norma tipului L/100km).
// Praguri: 🟢 ≤ +0.3 / 🟡 +0.3..+2.0 / 🔴 > +2.0 l/100km.
// ============================================================================

export type DtLevel = 'verde' | 'galben' | 'rosu';
export type DtMethod = 'between_alimentari_A' | 'monthly_B' | 'cronic_pattern';

// Praguri перерасход (l/100km peste normă) — §3.1
const THRESHOLD_GALBEN = 0.3;   // ≤0.3 = verde
const THRESHOLD_ROSU = 2.0;     // >2.0 = roșu
// Pattern cronic: același перерасход ±0.3 l/100km, 2 luni la rând — §3.2
const CRONIC_TOLERANCE = 0.3;
const CRONIC_MONTHS = 2;
// Alimentări numerar: >1/lună → 🟡 — §3.6
const CASH_ALERTS_THRESHOLD = 1;

/** Clasifică nivelul în funcție de перерасход (l/100km peste normă). */
export function classifyLevel(pererashodPer100: number): DtLevel {
  if (pererashodPer100 <= THRESHOLD_GALBEN) return 'verde';
  if (pererashodPer100 <= THRESHOLD_ROSU) return 'galben';
  return 'rosu';
}

export interface FuelEvent {
  alimentat_at: string;      // ISO timestamp
  litri: number;
  is_full: boolean;          // marcaj «plin» (отсечка)
  km_at_event: number | null; // odometer la moment (din GPS), dacă există
  driver_id: string | null;
}

export interface DriverKmInWindow {
  driver_id: string;
  km: number;
}

export interface PererashodResult {
  km_in_period: number;
  litri_consumati: number;
  litri_norma: number;            // km × normă / 100
  actual_l_per_100km: number;
  pererashod_l_per_100km: number; // actual − normă (poate fi negativ)
  level: DtLevel;
  /** Reparturizarea responsabilității pe șofer (proporțional cu km în fereastră). */
  drivers_responsibility: Array<{ driver_id: string; proportion: number; km: number }>;
  has_precise_cutoff: boolean;    // false = «formula uscată», fără plin precis
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Metoda A — перерасход între două puncte «plin» consecutive ale aceleiași mașini.
 * §3.3 + §3.4: fereastra plin→plin. Dacă lipsesc cutoff-urile precise → «formula uscată».
 */
export function calcPererashodWindow(
  norm_l_per_100km: number,
  km_in_period: number,
  litri_consumati: number,
  driversKm: DriverKmInWindow[],
  has_precise_cutoff = true,
): PererashodResult {
  const litri_norma = round2((km_in_period * norm_l_per_100km) / 100);
  const actual = km_in_period > 0 ? round2((litri_consumati * 100) / km_in_period) : 0;
  const pererashod = round2(actual - norm_l_per_100km);
  const level = classifyLevel(pererashod);

  // Repartizare proporțională pe șofer (§3.5)
  const totalKm = driversKm.reduce((acc, d) => acc + d.km, 0);
  const drivers_responsibility = driversKm.map((d) => ({
    driver_id: d.driver_id,
    km: d.km,
    proportion: totalKm > 0 ? round2(d.km / totalKm) : 0,
  }));

  return {
    km_in_period,
    litri_consumati: round2(litri_consumati),
    litri_norma,
    actual_l_per_100km: actual,
    pererashod_l_per_100km: pererashod,
    level,
    drivers_responsibility,
    has_precise_cutoff,
  };
}

/**
 * Construiește ferestrele «plin→plin» dintr-un șir de alimentări ordonate cronologic.
 * Fiecare fereastră începe la un «plin» și se termină la următorul «plin».
 * Litrii ferestrei = suma litrilor între cele două pline (exclusiv primul plin, inclusiv ultimul).
 */
export interface FuelWindow {
  from_at: string;
  to_at: string;
  litri: number;
  km: number | null;          // null dacă lipsesc odometer-ele
  has_precise_cutoff: boolean;
  driver_ids: string[];
}

export function buildFuelWindows(events: FuelEvent[]): FuelWindow[] {
  const sorted = [...events].sort((a, b) => a.alimentat_at.localeCompare(b.alimentat_at));
  const fullIdx = sorted.map((e, i) => (e.is_full ? i : -1)).filter((i) => i >= 0);
  const windows: FuelWindow[] = [];

  for (let w = 0; w < fullIdx.length - 1; w++) {
    const start = fullIdx[w];
    const end = fullIdx[w + 1];
    let litri = 0;
    const drivers = new Set<string>();
    // litri între pline (după primul plin, până la și inclusiv al doilea plin)
    for (let i = start + 1; i <= end; i++) {
      litri += sorted[i].litri;
      if (sorted[i].driver_id) drivers.add(sorted[i].driver_id as string);
    }
    const kmStart = sorted[start].km_at_event;
    const kmEnd = sorted[end].km_at_event;
    const hasKm = kmStart != null && kmEnd != null;
    windows.push({
      from_at: sorted[start].alimentat_at,
      to_at: sorted[end].alimentat_at,
      litri: round2(litri),
      km: hasKm ? round2((kmEnd as number) - (kmStart as number)) : null,
      // fără odometer = «formula uscată» (§3.4) — fereastra nu are cutoff precis
      has_precise_cutoff: hasKm,
      driver_ids: [...drivers],
    });
  }
  return windows;
}

/**
 * Metoda B — перерасход pe totalul lunar (între două «plin» de la capete de lună).
 * Identic cu calcPererashodWindow dar pe agregatul lunii.
 */
export function calcPererashodMonthly(
  norm_l_per_100km: number,
  km_month: number,
  litri_month: number,
  driversKm: DriverKmInWindow[],
  has_precise_cutoff = true,
): PererashodResult {
  return calcPererashodWindow(norm_l_per_100km, km_month, litri_month, driversKm, has_precise_cutoff);
}

/**
 * Pattern cronic — aceeași mașină cu același перерасход (±0.3) CRONIC_MONTHS luni la rând.
 * Primește перерасход-ul lunar (cel mai recent ultimul). Întoarce true dacă e cronic.
 */
export function isCronicPattern(monthlyPererashod: number[]): boolean {
  if (monthlyPererashod.length < CRONIC_MONTHS) return false;
  const recent = monthlyPererashod.slice(-CRONIC_MONTHS);
  // toate peste pragul galben ȘI grupate strâns (±tolerance)
  if (recent.some((p) => p <= THRESHOLD_GALBEN)) return false;
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  return max - min <= CRONIC_TOLERANCE * 2;
}

/** §3.6 — pattern «numerar des»: >1 alimentare numerar/lună → alert galben. */
export function isCashPatternSuspect(cashCountThisMonth: number): boolean {
  return cashCountThisMonth > CASH_ALERTS_THRESHOLD;
}
