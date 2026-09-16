'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, canOverrideStock } from '@/lib/piese-access';
import { transferSend, transferReceive, transferDestWarehouse, transferCancel, transfersSent } from '@/lib/piese-ops';
import { docLines, issueShortages } from '@/lib/piese';
import { auditWrite, autorFor } from '@/lib/audit';

// Plafon de sanity, ca la rashod: RPC-ul ține un lock pe fiecare piesă, într-o singură tranzacție, iar
// lock-ul e pe rândul din CATALOG — deci agnostic de depozit. O mutare cu zeci de mii de linii ar bloca
// recepții, eliberări și vânzări în toate depozitele cât ține tranzacția.
const MAX_LINES = 200;

export async function submitTransfer(payload: {
  from_warehouse_id: number; to_warehouse_id: number; lines: { part_id: number; qty: number }[];
  vehicle_id?: number | null; mechanic_id?: number | null;
  allow_short?: boolean;
}) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  if (!payload.from_warehouse_id || !payload.to_warehouse_id) throw new Error('Alege depozitul sursă și cel destinație');
  await assertWarehouseAllowed(session, payload.from_warehouse_id); // Etapa 2: poate scoate DOAR din depozitul lui
  if (payload.from_warehouse_id === payload.to_warehouse_id) throw new Error('Alege două depozite diferite');
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  if (lines.length > MAX_LINES) throw new Error(`Prea multe poziții (maxim ${MAX_LINES} pe o mutare).`);
  // Mașina/lăcătușul se validează ca ÎNTREGI POZITIVI, nu doar se convertesc: `Number(undefined)` dă NaN,
  // care pleacă spre bază ca `null` — iar o mutare marcată „pe mașină" cu mașina NULL ar rămâne veșnic pe
  // drum, invizibilă în ambele ecrane. Baza respinge și ea; asta e al doilea strat.
  const vid = Number(payload.vehicle_id);
  const mid = Number(payload.mechanic_id);
  const vehicle_id = Number.isInteger(vid) && vid > 0 ? vid : null;
  const mechanic_id = Number.isInteger(mid) && mid > 0 ? mid : null;
  if (mechanic_id != null && vehicle_id == null) throw new Error('Lăcătușul se alege doar împreună cu mașina');
  // Garda „nu e pe stoc" la MUTĂRI (migr. 355). Până acum exista doar la eliberări: se putea trimite 10
  // bucăți având 2, iar depozitul rămânea pe minus fără ca nimeni să fie întrebat. Așa a apărut, în
  // producție, „Magazin −1" la piesa 21068.
  //
  // `=== true`, nu truthy: acordul vine de la client, deci se acceptă doar forma exactă. Un `"false"` sau
  // un `1` rătăcit într-un payload n-are voie să treacă drept „da, sunt de acord".
  //
  // Dreptul e același ca la eliberări — ADMIN și GESTIONAR, nu vânzătorul (decizia Marianei, 11.09).
  // Dialogul e o măsură de interfață; cine trimite cererea direct poate pune acordul de la început.
  if (payload.allow_short === true && !(await canOverrideStock(session))) {
    // Încercarea refuzată lasă ȘI ea urmă: dacă refuzul e mut, cine sondează o poate face la nesfârșit.
    await auditWrite({
      adminId: session.id, action: 'TRANSFER_SHORT_DENIED', entity: 'transfer',
      after: { depozit: Number(payload.from_warehouse_id), pozitii: lines.length },
      notes: 'Cerere de mutare peste stoc, refuzată — rol fără drept',
    });
    throw new Error('Nu ai dreptul să muți peste stoc. Cheamă gestionarul sau administratorul.');
  }

  // Se ÎNCEARCĂ scrierea, nu se verifică înainte — ca la rashod. Baza refuză cu `SHORTAGE` și anulează
  // tot; lista o compune serverul în același dus-întors, fără o acțiune de server în plus la fiecare
  // salvare și fără fereastră între întrebare și scriere.
  let docId: number;
  try {
    docId = await transferSend({ ...payload, lines, vehicle_id, mechanic_id },
      await autorFor(session.id), payload.allow_short === true);
  } catch (e: any) {
    if ((e?.message || '').trim() !== 'SHORTAGE') throw e;
    try {
      return { ok: false as const, shortages: await issueShortages(payload.from_warehouse_id, lines) };
    } catch {
      throw new Error('Nu ajunge marfa în depozit, iar detaliile nu s-au putut încărca. Reîncearcă.');
    }
  }
  return { ok: true as const, docId, forVehicle: vehicle_id != null };
}

export async function receiveTransfer(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  // Etapa 2: poate confirma primirea DOAR pentru mutările adresate depozitului lui.
  // FAIL-CLOSED: `null` înseamnă document inexistent SAU care nu e mutare. Sărind garda pe null (cum se
  // făcea), un id de alt tip de document ar fi trecut nefiltrat — aceeași regulă ca `loadTransferLines`.
  const dest = await transferDestWarehouse(docId);
  if (dest == null) throw new Error('Mutare inexistentă');
  await assertWarehouseAllowed(session, dest);
  await transferReceive(docId, await autorFor(session.id));
  return { ok: true };
}

// Poziţiile unei mutări „pe drum", pentru extinderea rândului. Doar citire — aceleaşi roluri ca ecranul.
export async function loadTransferLines(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  // FAIL-CLOSED: `transferDestWarehouse` întoarce null și pentru un document inexistent, ȘI pentru unul
  // care nu e mutare. Dacă am sări garda pe null (cum se făcea), un id de recepție din alt depozit ar fi
  // trecut nefiltrat. Aceeași regulă ca `loadReceiptLines`.
  const dest = await transferDestWarehouse(Number(docId));
  if (dest == null) throw new Error('Mutare inexistentă');
  await assertWarehouseAllowed(session, dest); // doar mutările adresate depozitului lui
  // Mutarea nu poartă cost pentru cine o primește — doar ce și cât.
  return docLines(Number(docId), false);
}

// Ce a trimis depozitul ăsta și încă nu s-a confirmat — inclusiv mutările pe mașină, care nu mai apar în
// lista de tranzit. Fără ele, expeditorul nu mai vedea marfa proprie ieșită din stoc.
export async function loadSentTransfers(warehouseId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, Number(warehouseId));
  return transfersSent(Number(warehouseId));
}

// Anulează o mutare pe care destinatarul n-a confirmat-o. Anulează EXPEDITORUL: el primește marfa înapoi.
export async function cancelTransfer(docId: number, fromWarehouseId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, Number(fromWarehouseId));
  const r = await transferCancel(Number(docId), Number(fromWarehouseId),
    await autorFor(session.id));
  // ÎN AFARA unui try: stocul s-a mișcat deja. Anularea readuce marfă în stoc — e singura scriere nouă
  // din acest flux, deci n-are voie să rămână fără autor (migr. 291-293).
  await auditWrite({
    adminId: session.id, action: 'CANCEL_TRANSFER', entity: 'transfer', entityId: Number(docId),
    after: { pozitii_restituite: r.restored, depozit: Number(fromWarehouseId) },
  });
  return r;
}
