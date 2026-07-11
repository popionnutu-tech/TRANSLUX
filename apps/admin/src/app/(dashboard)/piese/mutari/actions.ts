'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { transferSend, transferReceive, transferDestWarehouse } from '@/lib/piese-ops';

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
