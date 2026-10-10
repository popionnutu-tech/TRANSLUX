// N4 (dezbaterea Claude–Codex, 10.10.2026): tur-returul cumpărat din mini app-ul Telegram se leagă de cont ÎNTREG —
// turul și returul din pachet (in_pachet, comanda_tur_id = turul). Înainte doar turul primea telegram_id: botul nu livra
// returul în chat (esteDeLivrat cere telegram_id pe rând) și «Biletele mele» nu-l arăta. Contul vine DOAR din initData
// verificat cu tokenul botului (apelantul), niciodată după telefon; se leagă doar rândurile încă nelegate. Livrarea nu se
// dublează: fiecare rând (tur, retur) are propria revendicare în bot (telegram_livrare_la / telegram_livrat_la, migr. 516).

/** Ce cere funcția de la clientul Supabase (lanțul update → or → is). */
export interface DbLegare {
  from(tabel: 'bilete_comenzi'): {
    update(v: { telegram_id: number; telegram_verificat_pentru: number }): {
      or(filtru: string): { is(col: 'telegram_id', v: null): PromiseLike<{ error: { message: string } | null }> };
    };
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtrul PostgREST: turul + returul lui din pachet. `turId` e UUID-ul din bază (verificat, intră într-un filtru). */
export function filtruPachet(turId: string): string {
  if (!UUID_RE.test(turId)) throw new Error('filtruPachet: id nevalid');
  return `id.eq.${turId},and(comanda_tur_id.eq.${turId},in_pachet.eq.true)`;
}

/** Leagă turul și returul din pachet de contul Telegram verificat; rândurile deja legate rămân neatinse. */
export async function leagaComandaDeTelegram(db: DbLegare, turId: string, telegramId: number): Promise<string | null> {
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return 'telegram_id nevalid';
  const { error } = await db.from('bilete_comenzi')
    .update({ telegram_id: telegramId, telegram_verificat_pentru: telegramId })
    .or(filtruPachet(turId))
    .is('telegram_id', null);
  return error ? error.message : null;
}
