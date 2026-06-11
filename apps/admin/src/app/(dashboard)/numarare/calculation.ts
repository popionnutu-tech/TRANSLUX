// calculation.ts
// Logica de calcul sume — funcții pure, fără dependențe externe

export interface StopEntry {
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  alighted: number;
  shortPassengers: ShortPassengerGroup[];
  district?: string | null;
}

export interface ShortPassengerGroup {
  boardedStopOrder: number;
  boardedStopNameRo: string;
  kmDistance: number;
  passengerCount: number;
  boardedDistrict?: string | null;
  exitDistrict?: string | null;
}

export interface CalculationResult {
  longSum: number;
  shortSum: number;
  total: number;
  details: TronsonDetail[];
}

export interface TronsonDetail {
  fromStop: string;
  toStop: string;
  km: number;
  longPassengers: number;
  shortInTransit: number;
  tronsonSum: number;
}

/**
 * Calculează suma pentru o direcție (tur sau retur).
 *
 * Lungi: pe fiecare tronson [oprire_i → oprire_i+1]:
 *   pasageri_lungi = total[i] - scurți_în_tranzit[i]
 *   suma = km_tronson × pasageri_lungi × rată
 *
 * Scurți: pentru fiecare grup de scurți:
 *   suma = km_distanță × nr_pasageri × rată
 *
 * District-aware: dacă AMBELE opriri ale unui tronson (sau ambele
 * districte pentru un scurt) sunt în `startDistrict` al rutei →
 * folosim `ratePerKmSuburban` în loc de `ratePerKm*`.
 * Replică logica migrației `recalc_totals_with_suburban_district`
 * (19 mai 2026).
 */
export function calculateDirection(
  entries: StopEntry[],
  ratePerKmLong: number,
  ratePerKmShort: number,
  opts?: { startDistrict?: string | null; ratePerKmSuburban?: number },
): CalculationResult {
  if (entries.length < 2) {
    return { longSum: 0, shortSum: 0, total: 0, details: [] };
  }

  const startDistrict = opts?.startDistrict ?? null;
  const ratePerKmSuburban = opts?.ratePerKmSuburban ?? null;
  const districtAware = !!(startDistrict && ratePerKmSuburban);

  const sorted = [...entries].sort((a, b) => a.stopOrder - b.stopOrder);

  // Colectăm toți scurții — mapă: boardedStopOrder → { exitStopOrder, count }
  const shortRides: {
    boardedOrder: number; exitOrder: number;
    count: number; km: number;
    boardedDistrict: string | null; exitDistrict: string | null;
  }[] = [];
  for (const entry of sorted) {
    for (const sp of entry.shortPassengers) {
      shortRides.push({
        boardedOrder: sp.boardedStopOrder,
        exitOrder: entry.stopOrder,
        count: sp.passengerCount,
        km: sp.kmDistance,
        boardedDistrict: sp.boardedDistrict ?? null,
        exitDistrict: sp.exitDistrict ?? entry.district ?? null,
      });
    }
  }

  // Calcul scurți.
  // Pe rute interurbane modulul „dual interurban tariff" NU e aplicat în prezent:
  // se folosește rate_long pentru tot ce-i în afara districtului de start și
  // rate_suburban pentru tronsoane în interiorul districtului. Mirror exactly
  // logica din migrarea `recalc_totals_with_suburban_district` (19.05.2026),
  // care ignoră `rate_short` și aplică `rate_long` la scurți non-suburbani.
  // (rate_short rămâne în signatură pentru compatibilitate / suburban mode.)
  let shortSum = 0;
  for (const ride of shortRides) {
    const isSuburbanShort = districtAware
      && ride.boardedDistrict === startDistrict
      && ride.exitDistrict === startDistrict;
    const rate = isSuburbanShort ? (ratePerKmSuburban as number) : ratePerKmLong;
    shortSum += ride.km * ride.count * rate;
  }

  // Calcul lungi pe tronsoane
  const details: TronsonDetail[] = [];
  let longSum = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const kmTronson = next.kmFromStart - current.kmFromStart;

    // Câți scurți sunt "în tranzit" pe acest tronson?
    let shortInTransit = 0;
    for (const ride of shortRides) {
      if (ride.boardedOrder <= current.stopOrder && ride.exitOrder > current.stopOrder) {
        shortInTransit += ride.count;
      }
    }

    const longPassengers = Math.max(0, current.totalPassengers - shortInTransit);
    const isSuburbanTronson = districtAware
      && current.district === startDistrict
      && next.district === startDistrict;
    const rate = isSuburbanTronson ? (ratePerKmSuburban as number) : ratePerKmLong;
    const tronsonSum = kmTronson * longPassengers * rate;

    details.push({
      fromStop: current.stopNameRo,
      toStop: next.stopNameRo,
      km: kmTronson,
      longPassengers,
      shortInTransit,
      tronsonSum,
    });

    longSum += tronsonSum;
  }

  return {
    longSum: Math.round(longSum * 100) / 100,
    shortSum: Math.round(shortSum * 100) / 100,
    total: Math.round((longSum + shortSum) * 100) / 100,
    details,
  };
}

/**
 * Calculează suma totală pentru o direcție aplicând UN SINGUR tarif (rate_interurban_long)
 * la toți pasagerii (atât lungi cât și scurți). Folosit pentru afișarea diferenței
 * "dual tariff vs single tariff" în vizualizarea admin.
 *
 * Matematic echivalent cu calculateDirection(entries, rate, rate).total.
 */
export function calculateSingleTariff(
  entries: StopEntry[],
  ratePerKm: number,
  opts?: { startDistrict?: string | null; ratePerKmSuburban?: number },
): number {
  return calculateDirection(entries, ratePerKm, ratePerKm, opts).total;
}

/**
 * Rotunjește la leu întreg tariful unui pasager pe un tronson suburban,
 * după regula 0.20 (decisă de business, 11.06.2026): fracțiune ≤ 0.20 → în jos,
 * > 0.20 → în sus (7.02 → 7, 7.20 → 7, 7.25 → 8). Calculăm în bani (întregi)
 * ca să evităm zgomotul de virgulă mobilă — 6 × 1.2 trebuie să fie exact 7.20.
 * Folosit identic în UI (cycleTotal) și pe server (computeSuburbanSessionTotal)
 * ca suma afișată să coincidă cu cea salvată.
 *
 * ⚠ ACEEAȘI regulă există și în BD: funcția `recompute_suburban_session_total`
 * (trigger pe counting_entries, migrarea 097). Dacă schimbi regula aici,
 * SCHIMB-O ȘI ACOLO printr-o migrație nouă — altfel triggerul rescrie suma
 * salvată cu formula veche la următoarea salvare de cursă suburbană.
 */
export function suburbanFareRound(km: number, rate: number): number {
  const bani = Math.round(km * rate * 100);
  const lei = Math.floor(bani / 100);
  return bani - lei * 100 <= 20 ? lei : lei + 1;
}

/**
 * Calcul suburban: un singur tarif per km, fără distincție lung/scurt, fără pasageri scurți.
 * Formula pe fiecare tronson: km_tronson × pasageri_în_autobuz × rate_suburban.
 */
export function calculateSuburban(
  entries: StopEntry[],
  ratePerKmSuburban: number,
): CalculationResult {
  const entriesNoShort = entries.map(e => ({ ...e, shortPassengers: [] as ShortPassengerGroup[] }));
  return calculateDirection(entriesNoShort, ratePerKmSuburban, 0);
}

/**
 * Fereastra de corectare a operatorului după finalizarea unei sesiuni de numărare.
 * Limita e strictă: la exact GRACE_MINUTES fereastra e EXPIRATĂ; NULL sau timestamp
 * invalid => expirată (sesiunile finalizate înainte de coloana completed_at rămân blocate).
 */
export const GRACE_MINUTES = 10;

export function isWithinGrace(completedAt: string | null, now: Date): boolean {
  if (!completedAt) return false;
  const completedMs = Date.parse(completedAt);
  if (Number.isNaN(completedMs)) return false;
  return now.getTime() - completedMs < GRACE_MINUTES * 60_000;
}

/**
 * Pentru o oprire dată (unde au ieșit scurți), returnează lista opririlor
 * de pe rută care sunt ≤ maxKm distanță ȘI sunt ÎNAINTE pe rută.
 */
export function getEligibleBoardingStops(
  allStops: { stopOrder: number; stopNameRo: string; kmFromStart: number }[],
  exitStopOrder: number,
  exitKm: number,
  maxKm: number,
): { stopOrder: number; stopNameRo: string; kmDistance: number }[] {
  return allStops
    .filter(s => s.stopOrder < exitStopOrder && (exitKm - s.kmFromStart) <= maxKm && (exitKm - s.kmFromStart) > 0)
    .map(s => ({
      stopOrder: s.stopOrder,
      stopNameRo: s.stopNameRo,
      kmDistance: Math.round((exitKm - s.kmFromStart) * 100) / 100,
    }))
    .sort((a, b) => b.stopOrder - a.stopOrder); // cele mai apropiate primele
}
