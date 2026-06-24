// ============================================================================
// LDE — Motor de calcul «Completare carduri» (cât combustibil pe cardul mașinii)
// Funcție PURĂ (fără side-effects, fără DB) — testabilă.
//
// Pe baza km planificați și a normei efective a mașinii, calculează:
//   liters            — litri stricti după normă  = plannedKm × norm / 100
//   litersWithReserve — + rezervă procentuală      = liters × (1 + reservePct/100)
//   lei               — costul (dacă știm prețul)  = round2(litersWithReserve × fuelPriceLei)
//                       sau null dacă prețul nu e cunoscut.
//
// Sursă unică: alimentează calculul de completare card — folosit identic de
// server action și de UI.
// ============================================================================

export interface CardTopup {
  liters: number;
  litersWithReserve: number;
  lei: number | null;            // null când fuelPriceLei nu e furnizat
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // normalizează -0 → 0
}

/**
 * Cât combustibil de pus pe card pentru `plannedKm` la norma `effectiveNorm`.
 * Funcție pură — fără DB, fără side-effects.
 *
 * @param plannedKm     km planificați.
 * @param effectiveNorm norma efectivă l/100km (COALESCE(measured, type.norm) din DB).
 * @param reservePct    procent de rezervă peste necesarul strict (default 10%).
 * @param fuelPriceLei  prețul lei/litru; dacă lipsește → lei = null.
 */
export function computeCardTopup(
  plannedKm: number,
  effectiveNorm: number,
  reservePct = 10,
  fuelPriceLei?: number,
): CardTopup {
  const liters = round2((plannedKm * effectiveNorm) / 100);
  const litersWithReserve = round2(liters * (1 + reservePct / 100));
  const lei =
    fuelPriceLei != null ? round2(litersWithReserve * fuelPriceLei) : null;
  return { liters, litersWithReserve, lei };
}
