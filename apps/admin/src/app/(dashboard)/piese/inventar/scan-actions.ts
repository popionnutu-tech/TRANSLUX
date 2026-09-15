'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, userWarehouseId, PART_WRITE_ROLES } from '@/lib/piese-access';
import { locationError, LOCATION_FORMAT, LOCATION_EXAMPLE } from '@/lib/piese-location';
import { autorFor } from '@/lib/audit';
import { getSupabase } from '@/lib/supabase';
import {
  openSession, scan, unscan, sessionLines, sessionMissing, commitSession, cancelSession, partByCode,
} from '@/lib/piese-inventar-scan';

// Numărarea prin scanare SCRIE adrese de raft la fiecare bip, deci cere PART_WRITE_ROLES — nu lista mai
// largă de la numărarea clasică. Vânzătorul numără mai departe pe ecranul vechi; adresele rafturilor nu
// sunt treaba lui (aceeași graniță ca la Catalog și la inventarul inițial).
async function guard(warehouseId: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  return session;
}

// Sesiunea aparține unui depozit; verificarea de depozit se face la deschidere, iar apoi la fiecare pas
// prin sesiunea însăși — altfel cineva ar putea scana într-o numărare deschisă de altcineva, în alt depozit.
//
// Garda asta se execută la FIECARE bip, deci latența ei e latența scanării. De aceea: fără `autorFor` (ar
// citi eticheta autorului doar ca să obțină un uuid pe care `session.id` îl are deja), iar cele două citiri
// rămase pleacă în paralel — sunt independente. Trei drumuri în șir la bază au devenit unul.
async function guardSession(sessionId: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  const [wh, wid] = await Promise.all([sessionWarehouse(sessionId, session.id), userWarehouseId(session)]);
  if (wid != null && wh !== wid) {
    throw new Error('Nu ai acces la acest depozit (contul tău e legat de alt depozit)');
  }
  return session;
}

async function sessionWarehouse(sessionId: number, adminId: string | null): Promise<number> {
  const { data, error } = await getSupabase().from('piese_inventory_sessions')
    .select('warehouse_id, admin_id').eq('id', sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Numărătoarea nu există.');
  // Numărătoarea e a OMULUI care a deschis-o. Două echipe pot număra în paralel în același depozit, iar
  // scanările uneia n-au ce căuta în foaia celeilalte.
  if ((data as any).admin_id !== adminId) throw new Error('Numărătoarea aparține altui utilizator.');
  return (data as any).warehouse_id as number;
}

export async function startScanSession(warehouseId: number) {
  const session = await guard(warehouseId);
  const id = await openSession(warehouseId, await autorFor(session.id));
  const [lines, missing] = await Promise.all([sessionLines(id), sessionMissing(id)]);
  return { sessionId: id, lines, missing };
}

export async function lookupCode(warehouseId: number, code: string) {
  await guard(warehouseId);
  return partByCode(code);
}

// Întoarce DOAR rândul atins, nu foaia întreagă. Varianta cu foaia întreagă costa ~64 ms la 300 de poziții
// (măsurat), la FIECARE bip, ca să recalculeze stocul din program — o cifră care nici nu se afișează până la
// „Completează după program". Pe un terminal, asta se simte ca o pauză între scanări. Ecranul îmbină rândul
// local; foaia adevărată se reia la deschidere și la dezvăluirea stocului, deci o eventuală nepotrivire se
// repară singură înainte de a conta.
export async function scanPart(sessionId: number, partId: number, location: string, qty: number | null) {
  await guardSession(sessionId);
  const loc = String(location ?? '').trim();
  // Validarea de format e AICI, nu doar în baza de date: RPC-ul acceptă orice etichetă ne-goală, iar o
  // adresă „raft 5" ar intra în piese_part_locations la închidere și ar deforma harta.
  const err = locationError(loc);
  if (err) throw new Error(`Adresa „${loc}" nu e bună (${LOCATION_FORMAT}, ex. ${LOCATION_EXAMPLE}): ${err}`);
  if (!loc) throw new Error(`Pune întâi adresa celulei (${LOCATION_EXAMPLE}).`);
  if (qty != null && (!Number.isFinite(qty) || qty < 0)) throw new Error('Cantitate invalidă.');
  return scan(sessionId, partId, loc, qty);
}

export async function unscanPart(sessionId: number, partId: number) {
  await guardSession(sessionId);
  await unscan(sessionId, partId);
}

// „Заполнить по остаткам" — abia acum se arată cifra programului. Până atunci omul numără ce vede, nu
// spre ce scrie programul.
export async function revealStock(sessionId: number) {
  await guardSession(sessionId);
  const [lines, missing] = await Promise.all([sessionLines(sessionId), sessionMissing(sessionId)]);
  return { lines, missing };
}

export async function finishScanSession(sessionId: number, zeroPartIds: number[]) {
  const session = await guardSession(sessionId);
  const ids = Array.from(new Set((zeroPartIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  const res = await commitSession(sessionId, ids, await autorFor(session.id));
  revalidatePath('/piese/harta');
  revalidatePath('/piese/stoc');
  return res;
}

export async function dropScanSession(sessionId: number) {
  await guardSession(sessionId);
  await cancelSession(sessionId);
}
