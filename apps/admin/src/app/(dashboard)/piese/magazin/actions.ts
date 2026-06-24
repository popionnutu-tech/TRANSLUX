'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { createSale } from '@/lib/piese-ops';

export async function submitSale(payload: { warehouse_id: number; client_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_price: number }[] }) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR');
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  return createSale({ ...payload, lines, userId: session.id });
}
