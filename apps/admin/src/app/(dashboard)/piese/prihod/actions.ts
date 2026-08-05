'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, userWarehouseId } from '@/lib/piese-access';
import { createReceipt, receiptDocs, receiptDocLines, receiptDocWarehouse, setReceiptCreator, setReceiptNote,
  receiptDocHeaderForEdit, receiptEditInfo, updateReceiptHeader, replaceReceiptLines } from '@/lib/piese';
import { chisinauDayStartIso, chisinauDayBounds, chisinauDayOf, chisinauTodayIso } from '@/lib/chisinau-time';

const RECEIPT_ROLES = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'] as const;
const NOTE_MAX = 500; // plafon sanity pentru comentariul la factură

export async function submitReceipt(payload: { warehouse_id: number; supplier_id: number | null; invoice_series?: string; invoice_number?: string; note?: string; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate face recepție în alt depozit
  const lines = payload.lines.filter((l) => l.part_id && l.qty > 0);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă');
  const docId = await createReceipt({ ...payload, lines });
  await setReceiptCreator(docId, session.id); // „Cine" a făcut recepția (non-fatal dacă pică)
  const note = (payload.note || '').trim().slice(0, NOTE_MAX);
  if (note) await setReceiptNote(docId, note); // comentariu la factură (non-fatal dacă pică)
  return { ok: true, docId };
}

// ── Jurnal documente de prihod (tab „Documente") ──
// Listă de recepții, scoped pe depozit (cont legat = forțat pe depozitul lui, ignoră ce cere clientul) + perioadă.
export async function listReceiptDocs(filters: { warehouseId?: number | null; supplierId?: number | null; search?: string | null; from?: string | null; to?: string | null } = {}) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const bound = await userWarehouseId(session);
  const reqWh = filters.warehouseId && Number(filters.warehouseId) > 0 ? Number(filters.warehouseId) : undefined;
  const wh = bound != null ? bound : reqWh; // cont legat → doar depozitul lui
  const supplierId = filters.supplierId && Number(filters.supplierId) > 0 ? Number(filters.supplierId) : undefined;
  const search = (filters.search || '').trim().slice(0, 100) || undefined; // căutare serie/număr/comentariu, plafon
  // Granițe de zi în ora Chișinău (sursă unică chisinau-time), nu concatenare naivă; validăm formatul YYYY-MM-DD.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = filters.from && dateRe.test(String(filters.from)) ? chisinauDayStartIso(String(filters.from)) : undefined;
  const to = filters.to && dateRe.test(String(filters.to)) ? chisinauDayBounds(String(filters.to)).toIso : undefined; // exclusiv
  return receiptDocs({ warehouseId: wh, supplierId, search, from, to });
}

// Liniile unui document — gardate pe depozitul documentului (cont legat nu poate citi documentele altui depozit).
export async function loadReceiptLines(docId: number) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const wh = await receiptDocWarehouse(Number(docId));
  if (wh == null) throw new Error('Document inexistent');
  await assertWarehouseAllowed(session, wh);
  return receiptDocLines(Number(docId));
}

// ── Modificarea unui document de recepție (#1b) ──
// Regula pe zi: ADMIN modifică orice document; ceilalți doar documentele create AZI (ora Chișinău).
function canEditDay(role: string, createdAt: string): boolean {
  return role === 'ADMIN' || chisinauDayOf(createdAt) === chisinauTodayIso();
}

function cleanHeader(h: { supplier_id?: number | null; series?: string | null; number?: string | null; note?: string | null }) {
  return {
    supplier_id: h.supplier_id && Number(h.supplier_id) > 0 ? Number(h.supplier_id) : null,
    invoice_series: (h.series || '').trim().slice(0, 60) || null,
    invoice_number: (h.number || '').trim().slice(0, 60) || null,
    note: (h.note || '').trim().slice(0, NOTE_MAX) || null,
  };
}

// Refuză documentele care nu pot fi editate din acest ecran (soldul inițial). Aceeași regulă ca RPC-ul (SOLD_INITIAL),
// impusă și pe calea „doar antet" (care ocolește RPC-ul) — altfel s-ar putea de-marca un sold inițial prin UPDATE direct.
function assertEditableDoc(series: string | null): void {
  if (series === 'SOLD') throw new Error('Soldul inițial nu se modifică din acest ecran.');
}

// Gardă comună la salvare: rol + depozit + status + regula pe zi + nu-e-sold. Reîncarcă antetul (sursă de adevăr pe server).
async function guardReceiptEdit(docId: number) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const header = await receiptDocHeaderForEdit(Number(docId));
  if (!header) throw new Error('Document inexistent');
  assertEditableDoc(header.series);
  await assertWarehouseAllowed(session, header.warehouseId); // cont legat: doar depozitul lui
  if (header.status !== 'CONFIRMED') throw new Error('Documentul nu mai poate fi modificat (a fost deja corectat).');
  if (!canEditDay(session.role, header.createdAt)) throw new Error('Doar administratorul poate modifica documente din zile anterioare.');
  return { session, header };
}

// Încarcă un document pentru ecranul de modificare: antet + linii + dacă liniile se pot edita (neconsumat) + dreptul pe zi.
export async function loadReceiptForEdit(docId: number) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const header = await receiptDocHeaderForEdit(Number(docId));
  if (!header) throw new Error('Document inexistent');
  assertEditableDoc(header.series);
  await assertWarehouseAllowed(session, header.warehouseId);
  if (header.status !== 'CONFIRMED') throw new Error('Documentul nu mai poate fi modificat.');
  const [lines, info] = await Promise.all([receiptDocLines(Number(docId)), receiptEditInfo(Number(docId))]);
  return {
    header: { supplierId: header.supplierId, series: header.series, number: header.number, note: header.note, createdAt: header.createdAt },
    lines: lines.map((l) => ({ part_id: l.partId, label: l.article ? `${l.name} · ${l.article}` : l.name, qty: l.qty, unit_cost: l.unitCost })),
    canEditLines: info.canEditLines,
    consumedBy: info.consumedBy,
    canEdit: canEditDay(session.role, header.createdAt), // dreptul pe zi (server îl reimpune la salvare)
  };
}

// Salvează DOAR antetul (furnizor/serie/număr/comentariu) — permis chiar și când marfa a fost consumată.
export async function saveReceiptHeader(docId: number, h: { supplier_id?: number | null; series?: string | null; number?: string | null; note?: string | null }) {
  await guardReceiptEdit(Number(docId));
  const hh = cleanHeader(h);
  if (hh.invoice_series === 'SOLD') throw new Error('Seria „SOLD" e rezervată soldului inițial.');
  try {
    await updateReceiptHeader(Number(docId), hh);
  } catch (e: any) {
    const code = (e?.message || '').trim();
    throw new Error(RPC_ERR[code] || 'Nu am putut salva antetul. Reîncearcă.');
  }
  return { ok: true };
}

// Mesaje prietenoase pentru codurile ridicate de RPC-ul de corecție (și de UPDATE-ul de antet: NOT_CONFIRMED).
const RPC_ERR: Record<string, string> = {
  CONSUMED: 'Marfa din această recepție a fost deja vândută/casată/mutată — nu se pot modifica liniile. Poți modifica doar antetul (furnizor/serie/număr/comentariu).',
  NOT_CONFIRMED: 'Documentul a fost deja modificat între timp. Reîncarcă lista și încearcă din nou.',
  NOT_RECEIPT: 'Document invalid.',
  SOLD_INITIAL: 'Soldul inițial nu se modifică din acest ecran.',
  SOLD_SERIES: 'Seria „SOLD" e rezervată soldului inițial.',
  NO_LINES: 'Adaugă cel puțin o piesă.',
  BAD_PART: 'O piesă selectată nu există în catalog.',
  BAD_QTY: 'Cantitatea trebuie să fie mai mare ca 0.',
  BAD_COST: 'Prețul unitar nu poate fi negativ.',
};

// Salvează antet + LINII (anulare + refacere prin RPC). Întoarce id-ul documentului nou corectat.
export async function saveReceiptLines(docId: number, payload: { supplier_id?: number | null; series?: string | null; number?: string | null; note?: string | null; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  await guardReceiptEdit(Number(docId));
  const hh = cleanHeader(payload);
  const lines = (payload.lines || [])
    .filter((l) => l.part_id && Number(l.qty) > 0)
    .map((l) => ({ part_id: Number(l.part_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0 }));
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă.');
  try {
    const newId = await replaceReceiptLines(Number(docId), { ...hh, lines });
    return { ok: true, newId };
  } catch (e: any) {
    const code = (e?.message || '').trim();
    throw new Error(RPC_ERR[code] || 'Nu am putut salva modificarea. Reîncearcă.');
  }
}
