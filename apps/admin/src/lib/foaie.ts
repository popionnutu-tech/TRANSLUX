import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Scrierea foii de parcurs (driver_cashin_receipts) — logica unică folosită de
 * /grafic (setCashinReceipt) și mini-app-ul atribuiri (setFoaie).
 *
 * Migr. 246: un șofer poate avea mai multe foi pe zi, câte una per rută;
 * crm_route_id NULL = «foaia zilei» (istoric / fără context de rută), afișată
 * ca fallback pe toate rândurile șoferului. Gol = ștergere (foaia rândului).
 * Numerele pierd zerourile din față ('0142961' → '142961').
 */
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

  const trimmed = /^[0-9]+$/.test(raw) ? String(parseInt(raw, 10)) : raw;

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
