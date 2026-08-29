'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { transferSend, transferReceive, transferDestWarehouse } from '@/lib/piese-ops';
import { docLines } from '@/lib/piese';

export async function submitTransfer(payload: { from_warehouse_id: number; to_warehouse_id: number; lines: { part_id: number; qty: number }[] }) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  if (!payload.from_warehouse_id || !payload.to_warehouse_id) throw new Error('Alege depozitul sursă și cel destinație');
  await assertWarehouseAllowed(session, payload.from_warehouse_id); // Etapa 2: poate scoate DOAR din depozitul lui
  if (payload.from_warehouse_id === payload.to_warehouse_id) throw new Error('Alege două depozite diferite');
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const docId = await transferSend({ ...payload, lines });
  return { ok: true, docId };
}

export async function receiveTransfer(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  // Etapa 2: poate confirma primirea DOAR pentru mutările adresate depozitului lui.
  const dest = await transferDestWarehouse(docId);
  if (dest != null) await assertWarehouseAllowed(session, dest);
  await transferReceive(docId);
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
