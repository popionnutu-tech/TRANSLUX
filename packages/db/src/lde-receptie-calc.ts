// ============================================================================
// LDE — Motor de calcul «Acte de recepție» (facturare săptămânală către uzine)
// Funcție PURĂ (fără side-effects, fără DB) — testabilă.
//
// Valoarea actului se calculează după modelul de facturare al uzinei:
//   per_cursa       — rate × nr. curse
//   per_pasager     — rate × nr. pasageri
//   per_km          — rate × km (rotunjit la 2 zecimale)
//   fix_saptamanal  — rate (sumă fixă pe săptămână, indiferent de agregate)
//
// Sursă unică: alimentează total_value_lei din lde_receptie_acts — folosit
// identic de server action (generare/snapshot) și de UI (preview valoare).
// ============================================================================

// Modelul de facturare per uzină. Sincronizat cu CHECK din 213_lde_billing_acte.sql.
export type LdeBillingModel =
  | 'per_cursa'
  | 'per_pasager'
  | 'per_km'
  | 'fix_saptamanal';

// Tariful uzinei (interpretat după billing_model).
export interface ReceptieBilling {
  billing_model: LdeBillingModel;
  rate_lei: number;
}

// Agregatele săptămânale care intră în calcul.
export interface ReceptieAgg {
  km: number;
  curse: number;
  passengers: number;
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // normalizează -0 → 0
}

/**
 * Valoarea unui act de recepție = rate × agregatul corespunzător modelului.
 * Funcție pură — fără DB, fără side-effects.
 *
 * per_km e singurul care poate produce zecimale din înmulțire (km e numeric),
 * deci se rotunjește la 2 zecimale; celelalte sunt rate × întreg / rate fix.
 * Aplicăm round2 uniform pe rezultat (rate_lei poate avea oricum 2 zecimale).
 */
export function computeReceptieValue(
  billing: ReceptieBilling,
  agg: ReceptieAgg,
): number {
  switch (billing.billing_model) {
    case 'per_cursa':
      return round2(billing.rate_lei * agg.curse);
    case 'per_pasager':
      return round2(billing.rate_lei * agg.passengers);
    case 'per_km':
      return round2(billing.rate_lei * agg.km);
    case 'fix_saptamanal':
      return round2(billing.rate_lei);
  }
}
