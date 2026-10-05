/**
 * Regula tare de timp la returnare (pură, testabilă): pasagerul / AI-ul pot anula până la `minInainte` minute
 * înaintea plecării de la oprirea pasagerului (app_config.bilete_anulare_pasager_min, implicit 240 din 05.10: sub 4 h grila nu restituie nimic). Decizia DACĂ
 * se returnează în interiorul ferestrei e a AI-ului din bot (Ion, 03.10); asta e doar plasa.
 */
export function poateAnulaPasager(departureAt: string, nowMs: number, minInainte: number): boolean {
  const t = Date.parse(departureAt);
  return Number.isFinite(t) && nowMs <= t - minInainte * 60_000; // la exact 4 h se poate, ca grila (6/9), ION-244
}


/**
 * Grila de restituire a biletelor online (Ion, 05.10.2026: «biletul costă 135 lei, folosim această regulă» —
 * 135 / 120 / 105 / 90 / 0 lei după timpul rămas). Pașii sunt de câte 1/9 din preț (15 lei din 135), deci grila se
 * ține în noimi ca biletul de 135 lei să dea exact sumele lui Ion. Timpul se socotește față de plecarea de la oprirea
 * pasagerului: peste 24 h — 9/9; 24–12 h — 8/9; 12–6 h — 7/9; 6–4 h — 6/9; sub 4 h (sau întârziat) — 0.
 * Cursa anulată, plecată cu peste o oră întârziere sau fără locul promis (vina noastră) — 9/9, separat de grilă.
 */
export const GRILA_RESTITUIRE: ReadonlyArray<{ minOreInainte: number; noimi: number }> = [
  { minOreInainte: 24, noimi: 9 },
  { minOreInainte: 12, noimi: 8 },
  { minOreInainte: 6, noimi: 7 },
  { minOreInainte: 4, noimi: 6 },
];

/** Partea restituită acum, în noimi din preț (0–9); `vinaNoastra` dă mereu 9. */
export function noimiRestituire(departureAt: string, nowMs: number, vinaNoastra = false): number {
  if (vinaNoastra) return 9;
  const t = Date.parse(departureAt);
  if (!Number.isFinite(t)) return 0;
  const oreRamase = (t - nowMs) / 3_600_000;
  for (const p of GRILA_RESTITUIRE) if (oreRamase >= p.minOreInainte) return p.noimi;
  return 0;
}

/** Suma restituită în lei, rotunjită la bani în jos (nu depășește niciodată plata). */
export function sumaRestituire(total: number, noimi: number): number {
  const n = Math.max(0, Math.min(9, noimi));
  return Math.floor((Math.round(Number(total) * 100) * n) / 9) / 100;
}
