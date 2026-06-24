// ============================================================================
// LDE — Motor de calcul «Experimente» (§6 interviu)
// Funcție PURĂ (fără side-effects, fără DB) — testabilă.
//
// Compară o perioadă BASELINE cu o perioadă TEST normalizând pe zi (perioadele
// pot avea lungimi diferite) și extrapolează economia/pierderea la 30 zile (lună).
//
// Verdict pe cost/zi:
//   economie  — testul costă mai puțin pe zi decât baseline (peste pragul neutru)
//   pierdere  — testul costă mai mult pe zi
//   neutru    — diferență sub pragul de zgomot (NEUTRAL_LEI_PER_DAY)
// ============================================================================

// Zile dintr-o lună standard (extrapolarea economiei/pierderii lunare).
const DAYS_PER_MONTH = 30;
// Sub această diferență de cost/zi (lei) considerăm rezultatul «neutru» (zgomot de măsurare).
const NEUTRAL_LEI_PER_DAY = 1;

/**
 * Nr. de zile inclusiv între 2 date 'YYYY-MM-DD' (UTC).
 * 0 dacă lipsește o bornă, e invalidă, sau intervalul e inversat (to < from).
 * Sursă unică: alimentează `days` în compareExperiment — folosit identic de
 * server action (validare/snapshot) și de UI (comparația afișată).
 */
export function inclusiveDays(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1; // +1 = inclusiv ambele capete
}

export type ExperimentVerdict = 'economie' | 'pierdere' | 'neutru';

export interface ExperimentPeriodInput {
  litri: number;
  lei: number;
  km: number;
  days: number;
}

export interface ExperimentSideMetrics {
  lei_per_day: number;        // cost motorină / zi
  km_per_day: number;         // km / zi
  litri_per_100km: number;    // consum normalizat (litri × 100 / km)
}

export interface ExperimentComparison {
  baseline: ExperimentSideMetrics;
  test: ExperimentSideMetrics;
  // Delta = test − baseline, normalizat pe zi (pozitiv = testul e mai scump).
  delta_lei_per_day: number;
  delta_litri_per_100km: number;
  // Extrapolare la 30 zile. economie_lei_per_month > 0 = economie; < 0 = pierdere.
  // (= −delta_lei_per_day × 30, ca «pozitiv = bine»).
  economie_lei_per_month: number;
  verdict: ExperimentVerdict;
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // normalizează -0 → 0 (extrapolarea −delta×30 produce -0 la delta 0)
}

// Metrici normalizate pe zi + litri/100km pentru o singură perioadă.
// days<=0 → 0 (perioadă invalidă/nedefinită, fără diviziune cu zero).
function sideMetrics(p: ExperimentPeriodInput): ExperimentSideMetrics {
  const days = p.days > 0 ? p.days : 0;
  return {
    lei_per_day: days > 0 ? round2(p.lei / days) : 0,
    km_per_day: days > 0 ? round2(p.km / days) : 0,
    litri_per_100km: p.km > 0 ? round2((p.litri * 100) / p.km) : 0,
  };
}

/**
 * Compară baseline vs test (perioade posibil de lungimi diferite).
 * Normalizează pe zi, extrapolează economia/pierderea la o lună (30 zile),
 * și emite un verdict pe diferența de cost/zi.
 *
 * Funcție pură — fără DB, fără side-effects.
 */
export function compareExperiment(
  baseline: ExperimentPeriodInput,
  test: ExperimentPeriodInput,
): ExperimentComparison {
  const b = sideMetrics(baseline);
  const t = sideMetrics(test);

  const delta_lei_per_day = round2(t.lei_per_day - b.lei_per_day);
  const delta_litri_per_100km = round2(t.litri_per_100km - b.litri_per_100km);

  // «pozitiv = bine»: economia lunară = cât scade costul/zi × 30.
  const economie_lei_per_month = round2(-delta_lei_per_day * DAYS_PER_MONTH);

  let verdict: ExperimentVerdict = 'neutru';
  if (delta_lei_per_day < -NEUTRAL_LEI_PER_DAY) verdict = 'economie';   // testul e mai ieftin
  else if (delta_lei_per_day > NEUTRAL_LEI_PER_DAY) verdict = 'pierdere'; // testul e mai scump

  return {
    baseline: b,
    test: t,
    delta_lei_per_day,
    delta_litri_per_100km,
    economie_lei_per_month,
    verdict,
  };
}
