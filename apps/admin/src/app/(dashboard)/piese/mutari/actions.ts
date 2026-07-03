'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { transferSend, transferReceive } from '@/lib/piese-ops';

export async function submitTransfer(payload: { from_warehouse_id: number; to_warehouse_id: number; lines: { part_id: number; qty: number }[] }) {
  requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  if (payload.from_warehouse_id === payload.to_warehouse_id) throw new Error('Alege două depozite diferite');
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const docId = await transferSend({ ...payload, lines });
  return { ok: true, docId };
}

export async function receiveTransfer(docId: number) {
  requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  await transferReceive(docId);
  return { ok: true };
}
