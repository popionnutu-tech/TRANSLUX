'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, userWarehouseId, PART_WRITE_ROLES } from '@/lib/piese-access';
import { locationError, LOCATION_FORMAT, LOCATION_EXAMPLE } from '@/lib/piese-location';
import { autorFor } from '@/lib/audit';
import {
  openSession, sessionOwner, scan, unscan, sessionLines, sessionMissing,
  commitSession, cancelSession, partsByCode, type PartMatch,
  scanUnknownCode, resolveCodes, sessionCodes, deleteCode, type ScanCode,
} from '@/lib/piese-inventar-scan';

// Numărarea prin scanare SCRIE adrese de raft la fiecare bip, deci cere PART_WRITE_ROLES — nu lista mai
// largă de la numărarea clasică. Vânzătorul numără mai departe pe ecranul vechi; adresele rafturilor nu
// sunt treaba lui (aceeași graniță ca la Catalog și la inventarul inițial).
async function guard(warehouseId: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  await assertWarehouseAllowed(session, warehouseId);
  return session;
}

// Garda asta se execută la FIECARE bip, deci latența ei e latența scanării: fără `autorFor` (ar citi
// eticheta autorului doar ca să obțină un uuid pe care `session.id` îl are deja), iar cele două citiri
// rămase pleacă în paralel — sunt independente.
//
// Mesajul e ACELAȘI pentru „nu există" și „e a altcuiva". Două mesaje diferite ar fi lăsat pe oricine să
// numere id-uri și să afle ce numărători există, inclusiv în depozite la care n-are acces.
async function guardSession(sessionId: number) {
  const session = requireRole(await verifySession(), ...PART_WRITE_ROLES);
  const [own, wid] = await Promise.all([sessionOwner(sessionId), userWarehouseId(session)]);
  if (own.adminId !== session.id) throw new Error('Numărătoarea nu există sau nu e a ta.');
  if (wid != null && own.warehouseId !== wid) throw new Error('Numărătoarea nu există sau nu e a ta.');
  return session;
}

export async function startScanSession(warehouseId: number) {
  const session = await guard(warehouseId);
  const id = await openSession(warehouseId, await autorFor(session.id));
  // Lista „lipsă" NU se cere aici: ecranul o arată doar după „Completează după program", care o reia oricum.
  // Era muncă aruncată la fiecare deschidere de sesiune.
  return { sessionId: id, lines: await sessionLines(id) };
}

const MAX_QTY = 1_000_000; // o numărătoare de raft nu trece de atât; peste = greșeală de tastare

function verificaAdresa(location: string): string {
  const loc = String(location ?? '').trim();
  if (!loc) throw new Error(`Pune întâi adresa celulei (${LOCATION_EXAMPLE}).`);
  // Validarea de format e AICI, nu doar în baza de date: RPC-ul acceptă orice etichetă ne-goală, iar o
  // adresă „raft 5" ar intra în piese_part_locations la închidere și ar deforma harta.
  const err = locationError(loc);
  if (err) throw new Error(`Adresa „${loc}" nu e bună (${LOCATION_FORMAT}, ex. ${LOCATION_EXAMPLE}): ${err}`);
  return loc;
}

// UN SINGUR drum pentru un bip. Înainte erau două acțiuni de server (`lookupCode`, apoi `scanPart`), iar
// Next le execută SECVENȚIAL — două dus-întorsuri complete client→server pentru fiecare bucată scanată.
// Pe un terminal cu rețea slabă asta se simțea ca o pauză între bipuri.
export async function bipCode(sessionId: number, code: string, location: string): Promise<
  | { ok: true; part: PartMatch; line: { part_id: number; qty: number; location: string } }
  | { ok: false; reason: 'unknown'; cod: { code: string; qty: number; location: string } }
  | { ok: false; reason: 'ambiguous'; options: PartMatch[] }
> {
  await guardSession(sessionId);
  const loc = verificaAdresa(location);
  const gasite = await partsByCode(code);
  // Codul necunoscut nu mai oprește numărătoarea: se reține cu cantitatea lui, iar numele i se dă mai
  // târziu (migr. 397). Omul rămâne la raft, nu intră în nomenclator cu marfa în mână.
  if (!gasite.length) return { ok: false, reason: 'unknown', cod: await scanUnknownCode(sessionId, code, loc, null) };
  // Mai multe piese pe același cod de articol (azi 161 de coduri sunt în situația asta) — nu ghicim.
  if (gasite.length > 1) return { ok: false, reason: 'ambiguous', options: gasite };
  const part = gasite[0];
  return { ok: true, part, line: await scan(sessionId, part.id, loc, null) };
}

// Adăugarea explicită a unei piese alese de om (din căutare sau din lista de ambiguitate) și corecția
// manuală a cantității. `qty` null = +1.
export async function scanPart(sessionId: number, partId: number, location: string, qty: number | null) {
  await guardSession(sessionId);
  const loc = verificaAdresa(location);
  if (qty != null && (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY)) {
    throw new Error(`Cantitate invalidă (între 0 și ${MAX_QTY.toLocaleString('ro-RO')}).`);
  }
  return scan(sessionId, partId, loc, qty);
}

export async function unscanPart(sessionId: number, partId: number) {
  await guardSession(sessionId);
  await unscan(sessionId, partId);
}

// Reîncarcă DOAR foaia, fără să dezvăluie cifrele programului. Necesară fiindcă doi oameni pot număra pe
// două terminale sub același cont (așa lucrează Eduard): foaia din bază e comună, dar fiecare ecran își
// îmbină local propriile bipuri, deci nu le vede pe ale celuilalt până nu recitește.
export async function refreshLines(sessionId: number) {
  await guardSession(sessionId);
  // ÎNTÂI mutăm codurile care au căpătat între timp o piesă, abia apoi citim foaia — altfel reîncărcarea
  // ar arăta și codul, și rândul piesei, până la următoarea apăsare.
  await resolveCodes(sessionId);
  return sessionLines(sessionId);
}

// „Заполнить по остаткам" — abia acum se arată cifra programului. Până atunci omul numără ce vede, nu
// spre ce scrie programul.
// Foaia completă: rândurile cu piesă + codurile rămase fără piesă. Rezolvarea se face întâi, ca un cod
// căruia i s-a dat nume între timp să apară direct ca denumire.
export async function refreshAll(sessionId: number): Promise<{ lines: Awaited<ReturnType<typeof sessionLines>>; codes: ScanCode[]; mutate: number }> {
  await guardSession(sessionId);
  const mutate = await resolveCodes(sessionId);
  const [lines, codes] = await Promise.all([sessionLines(sessionId), sessionCodes(sessionId)]);
  return { lines, codes, mutate };
}

// Corecția manuală a cantității unui cod încă nerezolvat.
export async function setCodeQty(sessionId: number, code: string, qty: number) {
  await guardSession(sessionId);
  if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QTY) {
    throw new Error(`Cantitate invalidă (între 0 și ${MAX_QTY.toLocaleString('ro-RO')}).`);
  }
  const l = await sessionCodes(sessionId);
  const linia = l.find((c) => c.code.toLowerCase() === code.trim().toLowerCase());
  if (!linia) throw new Error('Codul nu mai e în foaie.');
  return scanUnknownCode(sessionId, code, linia.location_label, qty);
}

// Supapa pentru codul care nu e al nimănui (ambalaj străin, etichetă veche). Fără ea, un singur cod
// neidentificabil ar ține numărătoarea deschisă la nesfârșit.
export async function dropCode(sessionId: number, code: string) {
  await guardSession(sessionId);
  await deleteCode(sessionId, code);
}

export async function revealStock(sessionId: number) {
  await guardSession(sessionId);
  const [lines, missing] = await Promise.all([sessionLines(sessionId), sessionMissing(sessionId)]);
  return { lines, missing };
}

const MAX_ZERO = 2000; // același plafon ca la numărarea clasică

export async function finishScanSession(sessionId: number, zeroPartIds: number[], force = false) {
  const session = await guardSession(sessionId);
  const ids = Array.from(new Set((zeroPartIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length > MAX_ZERO) throw new Error('Prea multe poziții trecute la zero într-o singură închidere.');
  try {
    const res = await commitSession(sessionId, ids, await autorFor(session.id), force);
    revalidatePath('/piese/harta');
    revalidatePath('/piese/stoc');
    return { ok: true as const, ...res };
  } catch (e: any) {
    // `MOVED` nu e o eroare a omului: între numărare și închidere s-a mișcat marfă. El decide dacă
    // numărătoarea lui e încă adevărată sau dacă trebuie renumărat.
    const msg = String(e?.message || '');
    if (msg.includes('MOVED')) {
      return { ok: false as const, reason: 'moved' as const, parts: await miscateDeLaNumarare(sessionId) };
    }
    // Coduri scanate care n-au ajuns la nicio piesă. Sunt bucăți numărate pe raft: o închidere care le-ar
    // lăsa deoparte ar scrie un stoc mai mic decât realitatea, fără ca nimeni să afle. Ca și la `MOVED`,
    // lista se RECITEȘTE — DETAIL-ul excepției nu trece prin PostgREST într-o formă pe care să te bazezi.
    if (msg.includes('CODURI_NEREZOLVATE')) {
      return { ok: false as const, reason: 'coduri' as const, codes: await sessionCodes(sessionId) };
    }
    throw e;
  }
}

// Piesele din foaie pe care s-a mișcat stoc de când au fost numărate. Se recitesc pentru mesaj: DETAIL-ul
// excepției nu ajunge prin PostgREST într-o formă pe care să te poți baza.
async function miscateDeLaNumarare(sessionId: number) {
  const [lines, missing] = await Promise.all([sessionLines(sessionId), sessionMissing(sessionId)]);
  void missing;
  return lines.map((l) => ({ part_id: l.part_id, name: l.name, counted: l.counted, stoc_program: l.stoc_program }))
    .filter((l) => Number(l.counted) !== Number(l.stoc_program));
}

export async function dropScanSession(sessionId: number) {
  await guardSession(sessionId);
  await cancelSession(sessionId);
}
