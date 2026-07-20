'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, userWarehouseId } from '@/lib/piese-access';
import { createReceipt, receiptDocs, receiptDocLines, receiptDocWarehouse, setReceiptCreator } from '@/lib/piese';
import { chisinauDayStartIso, chisinauDayBounds } from '@/lib/chisinau-time';

const RECEIPT_ROLES = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'] as const;

export async function submitReceipt(payload: { warehouse_id: number; supplier_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate face recepție în alt depozit
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const docId = await createReceipt({ ...payload, lines });
  await setReceiptCreator(docId, session.id); // „Cine" a făcut recepția (non-fatal dacă pică)
  return { ok: true, docId };
}

// ── Jurnal documente de prihod (tab „Documente") ──
// Listă de recepții, scoped pe depozit (cont legat = forțat pe depozitul lui, ignoră ce cere clientul) + perioadă.
export async function listReceiptDocs(filters: { warehouseId?: number | null; from?: string | null; to?: string | null } = {}) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const bound = await userWarehouseId(session);
  const reqWh = filters.warehouseId && Number(filters.warehouseId) > 0 ? Number(filters.warehouseId) : undefined;
  const wh = bound != null ? bound : reqWh; // cont legat → doar depozitul lui
  // Granițe de zi în ora Chișinău (sursă unică chisinau-time), nu concatenare naivă; validăm formatul YYYY-MM-DD.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = filters.from && dateRe.test(String(filters.from)) ? chisinauDayStartIso(String(filters.from)) : undefined;
  const to = filters.to && dateRe.test(String(filters.to)) ? chisinauDayBounds(String(filters.to)).toIso : undefined; // exclusiv
  return receiptDocs({ warehouseId: wh, from, to });
}

// Liniile unui document — gardate pe depozitul documentului (cont legat nu poate citi documentele altui depozit).
export async function loadReceiptLines(docId: number) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const wh = await receiptDocWarehouse(Number(docId));
  if (wh == null) throw new Error('Document inexistent');
  await assertWarehouseAllowed(session, wh);
  return receiptDocLines(Number(docId));
}
