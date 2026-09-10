import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Scrierea foii de parcurs (driver_cashin_receipts) — logica unică folosită de
 * /grafic (setCashinReceipt) și mini-app-ul atribuiri (setFoaie).
 *
 * Migr. 246: un șofer poate avea mai multe foi pe zi, câte una per rută;
 * crm_route_id NULL = «foaia zilei» (istoric / fără context de rută), afișată
 * ca fallback pe toate rândurile șoferului. Gol = ștergere (foaia rândului).
 * Numerele pierd zerourile din față ('0142961' → '142961').
 *
 * Formatul: doar cifre, cel mult 7 — tomberon-sync refuză orice altceva și
 * foaia nu ajunge la terminal (pe 08.09 și 10.09.2026 dispecerul a pus un «0»
 * la coadă ca să treacă de «foaia e deja folosită» → 8 cifre → șoferul n-avea
 * f/parcurs la terminal).
 */
const FOAIE_RE = /^[0-9]{1,7}$/;

export async function scrieFoaie(
  db: SupabaseClient,
  driverId: string,
  ziua: string,
  receiptNr: string,
  crmRouteId: number | null,
  createdBy?: string,
): Promise<{ error?: string; foaie?: string | null }> {
  const raw = receiptNr.trim();

  const { data: existing, error: exErr } = await db.from('driver_cashin_receipts')
    .select('id, crm_route_id')
    .eq('driver_id', driverId)
    .eq('ziua', ziua);
  if (exErr) return { error: exErr.message };
  const boundRow = (existing ?? []).find((r) => r.crm_route_id === crmRouteId) ?? null;
  const legacyRow = crmRouteId != null
    ? (existing ?? []).find((r) => r.crm_route_id === null) ?? null
    : null;

  if (raw === '') {
    const target = boundRow ?? legacyRow;
    if (!target) return { foaie: null };
    const { error } = await db.from('driver_cashin_receipts').delete().eq('id', target.id);
    if (error) return { error: error.message };
    return { foaie: null };
  }

  if (!FOAIE_RE.test(raw)) {
    return { error: `Numărul foii «${raw}»: doar cifre, cel mult 7 — altfel nu ajunge la terminal` };
  }
  const trimmed = String(parseInt(raw, 10));

  // Foaia zilei (fără rută) se «revendică» doar dacă șoferul are o singură
  // cursă azi (corecția clasică de typo). Cu 2+ curse rămâne neatinsă și
  // inserăm una nouă, legată de rută — cazul «două foi pe zi».
  let target = boundRow;
  if (!target && legacyRow) {
    const { count } = await db.from('daily_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_date', ziua)
      .eq('driver_id', driverId);
    if ((count ?? 0) <= 1) target = legacyRow;
  }

  // Corectare înainte de plecarea graficului: numărul e deja pe un rând din
  // ACEEAȘI zi al unui șofer care nu mai e pe cursa aceea (dispecerul a mutat
  // cursa pe alt șofer). Rândul vechi e orfan — nu se vede nicăieri în grafic
  // și ar bloca numărul pe veci. Îl ștergem și numărul trece pe șoferul nou.
  const { data: dup } = await db.from('driver_cashin_receipts')
    .select('id, driver_id, ziua, crm_route_id')
    .eq('receipt_nr', trimmed)
    .maybeSingle();
  if (dup && dup.id !== target?.id && dup.ziua === ziua && dup.crm_route_id != null
    && !(await soferPeCursa(db, ziua, dup.crm_route_id, dup.driver_id))) {
    const { error } = await db.from('driver_cashin_receipts').delete().eq('id', dup.id);
    if (error) return { error: error.message };
  }

  const payload = {
    receipt_nr: trimmed,
    crm_route_id: crmRouteId,
    ...(createdBy ? { created_by: createdBy } : {}),
    updated_at: new Date().toISOString(),
  };
  const { error } = target
    ? await db.from('driver_cashin_receipts').update(payload).eq('id', target.id)
    : await db.from('driver_cashin_receipts').insert({ driver_id: driverId, ziua, ...payload });
  if (error) return { error: await mesajEroareFoaie(db, error, trimmed) };
  return { foaie: trimmed };
}

/** Șoferul mai e pe cursa asta în ziua asta (tur sau retur, ca titular sau ca șofer de retur)? */
async function soferPeCursa(db: SupabaseClient, ziua: string, crmRouteId: number, driverId: string): Promise<boolean> {
  const { data, error } = await db.from('daily_assignments')
    .select('driver_id, driver_id_retur')
    .eq('assignment_date', ziua)
    .or(`crm_route_id.eq.${crmRouteId},retur_route_id.eq.${crmRouteId}`);
  // la eroare de citire NU declarăm rândul orfan — mai bine «foaia e deja folosită» decât o ștergere greșită
  if (error) return true;
  return (data ?? []).some((a) => a.driver_id === driverId || a.driver_id_retur === driverId);
}

/**
 * Șoferul unei curse s-a schimbat → foaia legată de cursă (ziua + ruta) trece
 * pe șoferul nou. Foaia de parcurs se scrie per cursă: pe 10.09.2026 dispecerul
 * a mutat cursa Chișinău–Otaci 18:55 de pe Oglasevici pe Goreaci, iar foaia a
 * rămas pe Oglasevici — invizibilă în grafic și trimisă la terminal pe el.
 * Dacă șoferul nou are deja o foaie pe cursă, nu atingem nimic (o corectează
 * dispecerul). Eșecul nu blochează schimbarea șoferului — doar se loghează.
 */
export async function mutaFoaiaLaSofer(
  db: SupabaseClient,
  ziua: string,
  crmRouteId: number,
  soferVechi: string | null | undefined,
  soferNou: string,
): Promise<void> {
  if (!soferVechi || soferVechi === soferNou) return;
  const { data: rows, error } = await db.from('driver_cashin_receipts')
    .select('id, driver_id')
    .eq('ziua', ziua)
    .eq('crm_route_id', crmRouteId)
    .in('driver_id', [soferVechi, soferNou]);
  if (error) { console.error(`mutaFoaiaLaSofer ${ziua} ruta ${crmRouteId}:`, error.message); return; }
  const aVechiului = rows?.find((r) => r.driver_id === soferVechi);
  if (!aVechiului || rows?.some((r) => r.driver_id === soferNou)) return;
  const { error: upErr } = await db.from('driver_cashin_receipts')
    .update({ driver_id: soferNou, updated_at: new Date().toISOString() })
    .eq('id', aVechiului.id);
  if (upErr) console.error(`mutaFoaiaLaSofer ${ziua} ruta ${crmRouteId}:`, upErr.message);
}

/** Traduce erorile de unicitate (23505) în mesaje pe înțelesul dispecerului. */
export async function mesajEroareFoaie(
  db: SupabaseClient,
  error: { code?: string; message: string },
  trimmed: string,
): Promise<string> {
  if (error.code !== '23505') return error.message;
  // gonire pe același rând din două tab-uri → conflict pe (șofer, zi, rută)
  if (error.message.includes('uq_dcr_driver_ziua_ruta')) {
    return 'Foaia a fost salvată în paralel din altă parte — reîncarcă pagina și verifică';
  }
  // fereastra dintre migr. 246 și 247: constraint-ul vechi «o foaie pe zi» încă există
  if (error.message.includes('driver_id_ziua')) {
    return 'A doua foaie pe zi se activează în câteva minute (actualizare în curs) — reîncearcă';
  }
  const { data: existing } = await db.from('driver_cashin_receipts')
    .select('ziua, drivers:driver_id(full_name)')
    .eq('receipt_nr', trimmed)
    .maybeSingle();
  if (existing) {
    const nume = (existing as unknown as { drivers?: { full_name?: string } }).drivers?.full_name || 'alt șofer';
    const [y, m, d] = String(existing.ziua).split('-');
    return `Foaia #${trimmed} e deja folosită de ${nume} pe ${d}.${m}.${y}`;
  }
  return `Foaia #${trimmed} e deja folosită`;
}
