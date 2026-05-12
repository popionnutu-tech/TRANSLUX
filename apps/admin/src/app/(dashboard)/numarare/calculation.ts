// calculation.ts
// Logica de calcul sume — funcții pure, fără dependențe externe

export interface StopEntry {
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  alighted: number;
  shortPassengers: ShortPassengerGroup[];
}

export interface ShortPassengerGroup {
  boardedStopOrder: number;
  boardedStopNameRo: string;
  kmDistance: number;
  passengerCount: number;
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
 *   suma = km_tronson × pasageri_lungi × preț_km_lung
 *
 * Scurți: pentru fiecare grup de scurți:
 *   suma = km_distanță × nr_pasageri × preț_km_scurt
 */
export function calculateDirection(
  entries: StopEntry[],
  ratePerKmLong: number,
  ratePerKmShort: number,
): CalculationResult {
  if (entries.length < 2) {
    return { longSum: 0, shortSum: 0, total: 0, details: [] };
  }

  const sorted = [...entries].sort((a, b) => a.stopOrder - b.stopOrder);

  // Colectăm toți scurții — mapă: boardedStopOrder → { exitStopOrder, count }
  const shortRides: { boardedOrder: number; exitOrder: number; count: number; km: number }[] = [];
  for (const entry of sorted) {
    for (const sp of entry.shortPassengers) {
      shortRides.push({
        boardedOrder: sp.boardedStopOrder,
        exitOrder: entry.stopOrder,
        count: sp.passengerCount,
        km: sp.kmDistance,
      });
    }
  }

  // Calcul scurți
  let shortSum = 0;
  for (const ride of shortRides) {
    shortSum += ride.km * ride.count * ratePerKmShort;
  }

  // Calcul lungi pe tronsoane
  const details: TronsonDetail[] = [];
  let longSum = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const kmTronson = next.kmFromStart - current.kmFromStart;

    // Câți scurți sunt "în tranzit" pe acest tronson?
    // Un scurt e în tranzit dacă: boardedOrder <= current.stopOrder ȘI exitOrder > current.stopOrder
    let shortInTransit = 0;
    for (const ride of shortRides) {
      if (ride.boardedOrder <= current.stopOrder && ride.exitOrder > current.stopOrder) {
        shortInTransit += ride.count;
      }
    }

    const longPassengers = Math.max(0, current.totalPassengers - shortInTransit);
    const tronsonSum = kmTronson * longPassengers * ratePerKmLong;

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
): number {
  return calculateDirection(entries, ratePerKm, ratePerKm).total;
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
