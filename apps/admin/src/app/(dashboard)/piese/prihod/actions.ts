'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { createReceipt } from '@/lib/piese';

export async function submitReceipt(payload: { warehouse_id: number; supplier_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'GESTIONAR');
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate face recepție în alt depozit
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const docId = await createReceipt({ ...payload, lines });
  return { ok: true, docId };
}
