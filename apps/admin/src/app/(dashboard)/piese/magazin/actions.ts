'use server';

import { autorFor } from '@/lib/audit';

import { createSale, cecVanzare } from '@/lib/piese-ops';
import { requirePieseIssue, canSeeCost, assertWarehouseAllowed } from '@/lib/piese-access';

export async function submitSale(payload: { warehouse_id: number; client_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_price: number }[] }) {
  const session = await requirePieseIssue();
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate vinde din alt depozit
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const res = await createSale({ ...payload, lines, userId: session.id }, await autorFor(session.id));
  // Vânzătorul nu primește cost/profit nici în răspunsul vânzării (ar fi vizibile în Network tab) — doar docId + total.
  if (!canSeeCost(session.role)) return { docId: res.docId, total: res.total };
  return res;
}

// Conținutul cecului unei vânzări (migr. 373-374), pentru tipărire imediat după emitere.
export async function incarcaCec(docId: number) {
  const session = await requirePieseIssue();
  const cec = await cecVanzare(Number(docId));
  // Garda de depozit: un vânzător legat de un depozit n-are de ce să vadă cecurile altuia.
  await assertWarehouseAllowed(session, cec.warehouse_id);
  return cec;
}
