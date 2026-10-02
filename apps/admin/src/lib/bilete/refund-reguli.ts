/**
 * Regula tare de timp la returnare (pură, testabilă): pasagerul / AI-ul pot anula până la `minInainte` minute
 * înaintea plecării de la oprirea pasagerului (app_config.bilete_anulare_pasager_min, implicit 120). Decizia DACĂ
 * se returnează în interiorul ferestrei e a AI-ului din bot (Ion, 03.10); asta e doar plasa.
 */
export function poateAnulaPasager(departureAt: string, nowMs: number, minInainte: number): boolean {
  const t = Date.parse(departureAt);
  return Number.isFinite(t) && nowMs < t - minInainte * 60_000;
}
