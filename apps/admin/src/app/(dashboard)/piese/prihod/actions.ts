'use server';

import { verifySession, requireRole, type Session } from '@/lib/auth';
import { assertWarehouseAllowed, userWarehouseId, editWindowDays } from '@/lib/piese-access';
import { createReceipt, receiptDocs, receiptDocLines, receiptDocWarehouse, finalizeReceipt,
  receiptDocHeaderForEdit, receiptEditInfo, updateReceiptHeader, replaceReceiptLines,
  supplierNames, receiptLabels} from '@/lib/piese';
import { auditWrite, auditHistoryForDoc, changedFields, type AuditFields } from '@/lib/audit';
import { receiptLinesSum, totalMatches, totalDiffBani } from '@/lib/piese-receipt';
import { chisinauDayStartIso, chisinauDayBounds, chisinauDayOf, chisinauTodayIso } from '@/lib/chisinau-time';

const RECEIPT_ROLES = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'] as const;

// Mesaje prietenoase pentru codurile ridicate de RPC-ul de corecție (și de UPDATE-ul de antet: NOT_CONFIRMED).
const RPC_ERR: Record<string, string> = {
  CONSUMED: 'Marfa din această recepție a fost deja vândută/casată/mutată — nu se pot modifica liniile. Poți modifica doar antetul (furnizor/serie/număr/comentariu/total factură).',
  NOT_CONFIRMED: 'Documentul a fost deja modificat între timp. Reîncarcă lista și încearcă din nou.',
  NOT_RECEIPT: 'Document invalid.',
  SOLD_INITIAL: 'Soldul inițial nu se modifică din acest ecran.',
  SOLD_SERIES: 'Seria „SOLD" e rezervată soldului inițial.',
  NO_LINES: 'Adaugă cel puțin o piesă.',
  BAD_PART: 'O piesă selectată nu există în catalog.',
  BAD_QTY: 'Cantitatea trebuie să fie mai mare ca 0.',
  BAD_COST: 'Prețul unitar nu poate fi negativ.',
};

const NOTE_MAX = 500; // plafon sanity pentru comentariul la factură

// Suma de control a facturii (migr. 288). Dacă depozitarul a tastat totalul de pe factura furnizorului,
// suma liniilor TREBUIE să coincidă. Prinde cantitatea sau prețul tastat greșit ACUM, la introducere —
// altfel greșeala intră în stoc și în costul FIFO și se descoperă abia la inventariere.
// Necompletat (null) = fără verificare, ca recepțiile introduse până acum să rămână valide.
// Însumarea e în piese-receipt.ts, aceeași folosită de formular.
function assertInvoiceTotal(total: number | null, lines: { qty: number; unit_cost: number }[]): void {
  if (total == null) return;
  // Aceeași funcție ca formularul — comparația se face în bani întregi, ca abaterea de exact un ban
  // (rotunjire legitimă pe factura furnizorului) să nu cadă victimă virgulei mobile.
  if (!totalMatches(total, lines)) {
    const sum = receiptLinesSum(lines);
    const fmt = (n: number) => n.toFixed(2);
    throw new Error(
      `Suma liniilor (${fmt(sum)} lei) nu se potrivește cu totalul facturii (${fmt(total)} lei). ` +
      `Diferență: ${fmt(totalDiffBani(total, lines) / 100)} lei. Verifică o cantitate sau un preț.`,
    );
  }
}

// Normalizează totalul primit de la client: gol/necompletat → null (fără verificare), altfel număr >= 0.
function cleanTotal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' && typeof v !== 'string') throw new Error('Total factură invalid');
  if (typeof v === 'string' && v.trim() === '') return null; // câmp gol (inclusiv doar spații) = fără verificare
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('Totalul facturii trebuie să fie un număr pozitiv');
  const r = Math.round(n * 100) / 100;
  if (!Number.isFinite(r)) throw new Error('Totalul facturii e prea mare'); // 1e307 devine Infinity la rotunjire
  return r;
}

export async function submitReceipt(payload: { warehouse_id: number; supplier_id: number | null; invoice_series?: string; invoice_number?: string; note?: string; invoice_total?: number | string | null; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate face recepție în alt depozit
  // Coerciție + validare, la paritate cu RPC-ul de corecție (BAD_QTY/BAD_COST din migr. 244). Calea de
  // CREARE nu avea niciuna, iar `piese_create_receipt` nu verifică nimic: un cost negativ ar fi intrat ca
  // strat FIFO și ar fi otrăvit costul mediu, deci și prețurile de vânzare. Suma de control nu acoperă asta —
  // două linii care se anulează reciproc (200 și −100) se potrivesc perfect cu un total de 100.
  if (!Array.isArray(payload.lines)) throw new Error('Adaugă cel puțin o piesă');
  // Validăm pe valorile BRUTE, ÎNAINTE de filtrare. Ordinea contează: dacă filtrăm întâi, verificările
  // devin cod mort (un `qty` invalid e deja eliminat), iar `Number(x) || 0` ar transforma „abc"/null în
  // cost ZERO — adică marfă gratuită intrată tăcut în stratul FIFO, exact ce voiam să prevenim.
  // Rândurile complet goale (fără piesă) se ignoră: formularul ține mereu un rând liber la final.
  const raw = payload.lines
    .map((l) => ({ part_id: Number(l.part_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost) }))
    .filter((l) => l.part_id);
  if (!raw.length) throw new Error('Adaugă cel puțin o piesă');
  // Aceleași praguri ca RPC-ul de corecție (migr. 244), ca o linie creabilă să fie și corectabilă:
  // sub epsilonul lui, o cantitate ar fi acceptată la creare și refuzată pentru totdeauna la editare.
  if (raw.some((l) => !Number.isFinite(l.qty) || l.qty <= 0.0000001)) throw new Error(RPC_ERR.BAD_QTY);
  if (raw.some((l) => !Number.isFinite(l.unit_cost) || l.unit_cost < 0)) throw new Error(RPC_ERR.BAD_COST);
  const lines = raw;
  const total = cleanTotal(payload.invoice_total);
  assertInvoiceTotal(total, lines); // ÎNAINTE de a scrie: o recepție greșită nu trebuie să intre deloc în stoc
  const docId = await createReceipt({ ...payload, lines });
  // Autor + comentariu + suma de control, într-un singur UPDATE (vezi finalizeReceipt).
  await finalizeReceipt(docId, { createdBy: session.id, note: (payload.note || '').trim().slice(0, NOTE_MAX), invoiceTotal: total });
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
// Regula pe zi: ADMIN modifică orice document; ceilalți, doar în fereastra contului lor (migr. 287):
// edit_window_days = 0 → doar AZI (comportamentul istoric), 7 → ultimele 7 zile, etc. Toate în ora Chișinău.
// NOTĂ: fereastra e doar un strat grosier. Protecția reală a stocului e `receiptEditInfo` (piese.ts), care
// blochează editarea liniilor dacă marfa a fost deja consumată — indiferent cât de largă e fereastra.
function daysBetweenIsoDays(fromIso: string, toIso: string): number {
  // Ambele sunt YYYY-MM-DD (zile calendaristice Chișinău), deci le comparăm ca date UTC pure — fără DST.
  const a = Date.parse(fromIso + 'T00:00:00Z');
  const b = Date.parse(toIso + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY; // fail-closed: pare „prea vechi"
  return Math.round((b - a) / 86400000);
}

async function canEditDay(session: Session, createdAt: string): Promise<boolean> {
  // NU scurtcircuităm pe session.role: rolul din JWT e vechi de până la 24h. `editWindowDays` întoarce
  // Infinity pentru ADMIN pe baza rolului DIN DB, deci retrogradarea unui admin are efect imediat.
  const docDay = chisinauDayOf(createdAt);
  const today = chisinauTodayIso();
  const age = daysBetweenIsoDays(docDay, today);
  if (age < 0) return true;                 // document „din viitor" (ceas/fus) — nu-l blocăm pe seama contului
  return age <= (await editWindowDays(session));
}

function cleanHeader(h: { supplier_id?: number | null; series?: string | null; number?: string | null; note?: string | null; invoice_total?: number | string | null }) {
  return {
    supplier_id: h.supplier_id && Number(h.supplier_id) > 0 ? Number(h.supplier_id) : null,
    invoice_series: (h.series || '').trim().slice(0, 60) || null,
    invoice_number: (h.number || '').trim().slice(0, 60) || null,
    note: (h.note || '').trim().slice(0, NOTE_MAX) || null,
    // `undefined` = apelantul NU a trimis câmpul → nu-l atingem. `null`/'' = golire deliberată.
    // Fără distincția asta, orice apelant care omite câmpul ar șterge tăcut suma de control —
    // exact cum s-a întâmplat înainte ca modalul de editare să înceapă să o trimită.
    invoice_total: h.invoice_total !== undefined ? cleanTotal(h.invoice_total) : undefined,
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
  // Autorizarea ÎNAINTEA regulii de business, la fel ca în loadReceiptForEdit: altfel mesajul „a fost deja
  // corectat" ar confirma statusul unui document din alt depozit, la care contul n-are acces.
  await assertWarehouseAllowed(session, header.warehouseId); // cont legat: doar depozitul lui
  if (header.status !== 'CONFIRMED') throw new Error('Documentul nu mai poate fi modificat (a fost deja corectat).');
  if (!(await canEditDay(session, header.createdAt))) throw new Error('Documentul e mai vechi decât fereastra ta de corecție. Cere administratorului.');
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
  // Fereastra de corecție e independentă de linii/consum → intră în același Promise.all, nu după el.
  const [lines, info, canEdit, history] = await Promise.all([
    receiptDocLines(Number(docId)), receiptEditInfo(Number(docId)), canEditDay(session, header.createdAt),
    // Istoricul intră AICI, nu într-un apel separat din client: altfel ajungea pe ecran după ce omul
    // începuse deja să editeze — exact invers față de scopul lui.
    auditHistoryForDoc('receipt', Number(docId)).catch(() => null),
  ]);
  return {
    header: { supplierId: header.supplierId, series: header.series, number: header.number, note: header.note, invoiceTotal: header.invoiceTotal, createdAt: header.createdAt },
    lines: lines.map((l) => ({ part_id: l.partId, label: l.article ? `${l.name} · ${l.article}` : l.name, qty: l.qty, unit_cost: l.unitCost })),
    canEditLines: info.canEditLines,
    consumedBy: info.consumedBy,
    canEdit, // fereastra de corecție (server o reimpune la salvare)
    history, // `null` = n-am putut citi urma; NU e același lucru cu „documentul n-a fost modificat"
  };
}

// Salvează DOAR antetul (furnizor/serie/număr/comentariu/total factură) — permis chiar și când marfa a fost consumată.
export async function saveReceiptHeader(docId: number, h: { supplier_id?: number | null; series?: string | null; number?: string | null; note?: string | null; invoice_total?: number | string | null }) {
  const { session, header } = await guardReceiptEdit(Number(docId));
  const hh = cleanHeader(h);
  if (hh.invoice_series === 'SOLD') throw new Error('Seria „SOLD" e rezervată soldului inițial.');
  // Totalul se verifică față de liniile CURENTE ale documentului (aici se schimbă doar antetul), ca martorul
  // salvat să nu poată rămâne în dezacord cu marfa. Necompletat → fără verificare.
  if (hh.invoice_total != null) { // undefined (netrimis) sau null (golit) → nimic de verificat
    const cur = await receiptDocLines(Number(docId));
    assertInvoiceTotal(hh.invoice_total, cur.map((l) => ({ qty: l.qty, unit_cost: l.unitCost })));
  }
  try {
    await updateReceiptHeader(Number(docId), hh);
  } catch (e: any) {
    const code = (e?.message || '').trim();
    throw new Error(RPC_ERR[code] || 'Nu am putut salva antetul. Reîncearcă.');
  }
  // Urma modificării. Calea asta e un UPDATE direct — până acum nu lăsa nimic în jurnal, deși e permisă
  // CHIAR ȘI când marfa a fost consumată, adică pe documente deja reconciliate contabil.
  await auditHeaderChange(session.id, Number(docId), header, hh);
  return { ok: true };
}


// Salvează antet + LINII (anulare + refacere prin RPC). Întoarce id-ul documentului nou corectat.
export async function saveReceiptLines(docId: number, payload: { supplier_id?: number | null; series?: string | null; number?: string | null; note?: string | null; invoice_total?: number | string | null; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  const { session, header } = await guardReceiptEdit(Number(docId));
  const hh = cleanHeader(payload);
  const lines = (payload.lines || [])
    .filter((l) => l.part_id && Number(l.qty) > 0)
    .map((l) => ({ part_id: Number(l.part_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost) || 0 }));
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă.');
  // Câmp NETRIMIS (undefined) → păstrăm martorul documentului și verificăm liniile noi față de EL. Altfel
  // un apelant care omite câmpul ar rescrie stocul FIFO fără nicio verificare, iar documentul corectat ar
  // rămâne și fără martor. Golirea rămâne posibilă, dar doar explicit (null/'' trimis de om din formular).
  const effectiveTotal = hh.invoice_total === undefined ? header.invoiceTotal : hh.invoice_total;
  assertInvoiceTotal(effectiveTotal, lines); // verificare pe liniile NOI, înainte de a rescrie stocul
  let newId: number;
  try {
    newId = await replaceReceiptLines(Number(docId), { ...hh, lines });
  } catch (e: any) {
    const code = (e?.message || '').trim();
    throw new Error(RPC_ERR[code] || 'Nu am putut salva modificarea. Reîncearcă.');
  }
  // ÎN AFARA try-ului: corecția a reușit deja și stocul a fost rescris. Dacă am lăsa asta înăuntru, un eșec
  // al scrierii martorului ar raporta „nu am putut salva", deși modificarea e comisă — iar reîncercarea ar
  // primi „documentul a fost deja modificat". finalizeReceipt e oricum non-fatală și loghează.
  // Corecția creează un document NOU (RPC-ul îl anulează pe cel vechi); martorul îl însoțește.
  if (effectiveTotal != null) await finalizeReceipt(newId, { invoiceTotal: effectiveTotal });
  // RPC-ul scrie deja un rând, dar cu `p_user` NULL (BIGINT, pentru utilizatori Telegram) — deci fără autor.
  // Adăugăm urma cu identitatea reală a contului, pe documentul NOU (cel vechi rămâne anulat).
  //
  // `replaces_doc_id` e VERIGA LANȚULUI: corecția nu modifică documentul, ci îl anulează și creează altul.
  // Urmele scrise înainte rămân pe id-ul vechi, care dispare din liste — fără veriga asta, istoricul unei
  // schimbări de furnizor ar deveni invizibil exact când cineva corectează o cantitate.
  await auditWrite({
    adminId: session.id, action: 'EDIT_LINES', entity: 'receipt', entityId: Number(newId),
    before: { replaces_doc_id: Number(docId) },
    after: { pozitii: lines.length },
  });
  // Antetul se poate schimba și pe calea asta — o consemnăm la fel, altfel drumul cel mai distructiv
  // ar lăsa o urmă mai săracă decât cel banal.
  await auditHeaderChange(session.id, Number(newId), header, hh);
  return { ok: true, newId };
}

// Consemnează schimbarea de antet, structurat. Numele furnizorilor se rezolvă DOAR dacă furnizorul
// chiar s-a schimbat — altfel nicio interogare în plus la o corecție de serie sau de comentariu.
async function auditHeaderChange(
  adminId: string,
  docId: number,
  before: { supplierId: number | null; series: string | null; number: string | null; note: string | null; invoiceTotal: number | null },
  after: { supplier_id: number | null; invoice_series: string | null; invoice_number: string | null; note: string | null; invoice_total?: number | null },
): Promise<void> {
  const b: AuditFields = {
    furnizor: before.supplierId, serie: before.series, numar: before.number,
    comentariu: before.note, total_factura: before.invoiceTotal,
  };
  const a: AuditFields = {
    furnizor: after.supplier_id, serie: after.invoice_series, numar: after.invoice_number,
    comentariu: after.note,
    ...(after.invoice_total !== undefined ? { total_factura: after.invoice_total } : {}),
  };
  const diff = changedFields(b, a);
  if (!diff) return; // nimic schimbat → niciun rând (jurnalul rămâne citibil)

  if ('furnizor' in diff.after) {
    const names = await supplierNames([before.supplierId, after.supplier_id].filter((x): x is number => typeof x === 'number'));
    diff.before.furnizor = before.supplierId == null ? null : (names.get(before.supplierId) || `#${before.supplierId}`);
    diff.after.furnizor = after.supplier_id == null ? null : (names.get(after.supplier_id) || `#${after.supplier_id}`);
  }
  await auditWrite({ adminId, action: 'EDIT_HEADER', entity: 'receipt', entityId: docId, before: diff.before, after: diff.after });
}

// Etichetele piesei de raft dintr-o recepție (migr. 318) — pentru tipărire imediat după salvare.
// Aceeași gardă ca `loadReceiptLines`: documentul decide depozitul, nu clientul.
export async function loadReceiptLabels(docId: number) {
  const session = requireRole(await verifySession(), ...RECEIPT_ROLES);
  const wh = await receiptDocWarehouse(Number(docId));
  if (wh == null) throw new Error('Document inexistent');
  await assertWarehouseAllowed(session, wh);
  return receiptLabels(Number(docId), wh);
}
