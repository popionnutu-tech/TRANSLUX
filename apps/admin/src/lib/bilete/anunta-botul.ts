import 'server-only';

// ION-274 («Telegram ultrafast» P10): după ce plata a emis bilete, panoul anunță botul (POST /bilete/v1/livreaza) ca biletul
// să apară în chatul clientului la secundă, nu la tickul de 1 min. Fără aruncare și cu timeout de 3 s: dacă botul nu
// răspunde (rollover Railway), jobul lui de 1 min livrează oricum. Se cheamă din route handlers (în `after()`) sau din lib
// ca apel simplu — niciodată `after()` din lib (ar arunca în afara unei cereri, ex. scripturile «Run admin lib locally»).
// Env: BOT_BASE_URL (adresa botului pe Railway) + BILETE_LIVRARE_KEY (cheie nouă, ≥ 64, aceeași în Railway).

export async function anuntaBotul(checkoutId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const baza = (process.env.BOT_BASE_URL ?? '').replace(/\/+$/, '');
  const cheie = process.env.BILETE_LIVRARE_KEY ?? '';
  if (!baza || cheie.length < 64) return false;
  try {
    const r = await fetchImpl(`${baza}/bilete/v1/livreaza`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cheie}` },
      body: JSON.stringify({ checkout_id: checkoutId }), signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) console.warn('[bilete/anunta-botul]', checkoutId.slice(0, 8), 'HTTP', r.status);
    return r.ok;
  } catch (e) {
    console.warn('[bilete/anunta-botul]', checkoutId.slice(0, 8), e instanceof Error ? e.message : e);
    return false;
  }
}
