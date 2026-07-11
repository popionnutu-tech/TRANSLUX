'use server';

import { createSale } from '@/lib/piese-ops';
import { requirePieseIssue, canSeeCost, assertWarehouseAllowed } from '@/lib/piese-access';

export async function submitSale(payload: { warehouse_id: number; client_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_price: number }[] }) {
  const session = await requirePieseIssue();
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate vinde din alt depozit
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const res = await createSale({ ...payload, lines, userId: session.id });
  // Vânzătorul nu primește cost/profit nici în răspunsul vânzării (ar fi vizibile în Network tab) — doar docId + total.
  if (!canSeeCost(session.role)) return { docId: res.docId, total: res.total };
  return res;
}
