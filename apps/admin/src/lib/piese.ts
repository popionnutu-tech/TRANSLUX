import { getSupabase } from './supabase';

// Strat de date pentru modulul „Piese" — citește din view-urile piese_* și apelează funcțiile Postgres (FIFO etc.).

// PostgREST tratează , ( ) ca structură în interiorul .or(...). Cităm valoarea utilizatorului (escapând " și \)
// ca să fie tratată ca DATE, nu ca filtru — altfel un termen cu virgulă/paranteze poate injecta condiții.
export const orVal = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Filtrul .or(...) comun pentru catalog (căutare pe 6 coloane). SURSĂ UNICĂ — folosit de
// catalogRows (liste/forme) și catalogPage (browse), ca predicatele să nu diverge. `s` trebuie deja escapat cu orVal.
const catalogSearchOr = (s: string) => `name_long.ilike."%${s}%",name_ro.ilike."%${s}%",group_name.ilike."%${s}%",article_code.ilike."%${s}%",oem_code.ilike."%${s}%",barcode.ilike."%${s}%",model.ilike."%${s}%"`;

export async function listWarehouses() {
  const { data } = await getSupabase().from('piese_warehouses').select('*').order('id');
  return data || [];
}
export async function listGroups() {
  const { data } = await getSupabase().from('piese_part_groups').select('*').order('name_ro');
  return data || [];
}
export async function listVehicles(search?: string) {
  let q = getSupabase().from('piese_vehicles').select('*').order('plate').limit(500);
  if (search?.trim()) { const s = orVal(search.trim()); q = q.or(`plate.ilike."%${s}%",model.ilike."%${s}%"`); }
  const { data } = await q;
  return data || [];
}
export async function listMechanics() {
  const { data } = await getSupabase().from('piese_mechanics').select('*').order('name');
  return data || [];
}
export async function listReasons() {
  const { data } = await getSupabase().from('piese_breakdown_reasons').select('*').order('name');
  return data || [];
}
export async function listSuppliers() {
  const { data } = await getSupabase().from('piese_suppliers').select('*').order('name');
  return data || [];
}

// Datele pentru eticheta de tipărit a unei piese: denumire, marcă, cod intern (articol), cod de bare,
// stoc (în depozitul dat, sau TOTAL dacă warehouseId e null) și preț de vânzare. Stoc/preț citite live la tipărire.
export async function partLabelInfo(partId: number, warehouseId: number | null) {
  const sb = getSupabase();
  const { data: p } = await sb.from('piese_parts')
    .select('id, name_long, name_ro, manufacturer, article_code, barcode, unit').eq('id', partId).maybeSingle();
  if (!p) return null;
  const part = p as any;
  let qty = 0;
  if (warehouseId == null) {
    const { data } = await sb.from('piese_current_stock').select('qty').eq('part_id', partId);
    qty = (data as any[] || []).reduce((s, r) => s + Number(r.qty || 0), 0);
  } else {
    const { data } = await sb.from('piese_current_stock').select('qty').eq('part_id', partId).eq('warehouse_id', warehouseId).maybeSingle();
    qty = Number((data as any)?.qty || 0);
  }
  const { data: pr } = await sb.from('piese_part_sale_price').select('sale_price').eq('part_id', partId).maybeSingle();
  return {
    id: part.id,
    name: (part.name_ro && String(part.name_ro).trim()) || part.name_long || '',
    manufacturer: part.manufacturer || '',
    articleCode: part.article_code || '',
    barcode: (part.barcode && String(part.barcode).trim()) || part.article_code || '',
    unit: part.unit || 'buc',
    qty,
    price: pr && (pr as any).sale_price != null ? Number((pr as any).sale_price) : null,
  };
}

// Filtrele ecranului Stoc (depozit / grupă / căutare). SURSĂ UNICĂ — folosite identic
// și de query-ul de rânduri, și de cel care însumează valoarea, ca totalul să corespundă listei.
type StockFilters = { warehouseId?: number; groupId?: number; search?: string };
const stockSearchOr = (s: string) => `name_long.ilike."%${s}%",name_ro.ilike."%${s}%",group_name.ilike."%${s}%",article_code.ilike."%${s}%",oem_code.ilike."%${s}%",barcode.ilike."%${s}%",model.ilike."%${s}%"`;
function stockFiltered(select: string, opts: StockFilters, exactCount = false): any {
  let q: any = exactCount
    ? getSupabase().from('piese_stock_rows').select(select, { count: 'exact' })
    : getSupabase().from('piese_stock_rows').select(select);
  if (opts.warehouseId) q = q.eq('warehouse_id', opts.warehouseId);
  if (opts.groupId) q = q.eq('group_id', opts.groupId);
  if (opts.search?.trim()) q = q.or(stockSearchOr(orVal(opts.search.trim())));
  return q;
}

// Plafon de siguranță pentru însumarea valorii (o singură coloană numerică, nu rândurile întregi).
const VALUE_SUM_CAP = 50000;

// Coloanele aduse pentru rânduri. Pentru VINZATOR NU aducem deloc `avg_cost`/`value` din baza de date
// (apărare în adâncime: service-role trece peste RLS, deci codul e singura barieră — nu doar UI-ul).
const STOCK_COLS_BASE = 'part_id, warehouse_id, group_name, name_long, name_ro, manufacturer, model, barcode, unit, warehouse_name, location_label, min_qty, qty';
const STOCK_COLS_COST = `${STOCK_COLS_BASE}, avg_cost, value`;

// Stoc paginat + totalul REAL. Înainte era `.limit(1000)` fără paginare, iar valoarea se aduna doar
// peste rândurile aduse → la peste 1000 de poziții lista se tăia tăcut și totalul ieșea subevaluat.
// Acum: rândurile se pagineaza (count exact), iar valoarea se însumează peste TOT setul filtrat.
// `withValue` e fals pentru VINZATOR (nu vede valoarea) → nu se face nici query-ul de sumă.
export async function stockPage(opts: StockFilters & { page?: number; pageSize?: number; withValue?: boolean } = {}) {
  const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 100;
  const page = Math.max(1, opts.page || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const cols = opts.withValue ? STOCK_COLS_COST : STOCK_COLS_BASE;
  // Departajator unic (part_id, warehouse_id): `group_name`+`name_long` se repetă pentru aceeași piesă
  // în mai multe depozite, iar fără o ordine totală un rând poate fi sărit sau dublat între pagini.
  const rowsQ = stockFiltered(cols, opts, true)
    .order('group_name').order('name_long').order('part_id').order('warehouse_id')
    .range(from, to);
  // `.order('part_id')` face suma parțială (când e trunchiată) stabilă între randări, nu arbitrară.
  const valueQ = opts.withValue ? stockFiltered('value', opts).order('part_id').range(0, VALUE_SUM_CAP - 1) : null;

  const [rowsRes, valueRes] = await Promise.all([rowsQ, valueQ ?? Promise.resolve(null)]);

  const rows = ((rowsRes as any)?.data || []) as any[];
  const total = (rowsRes as any)?.count ?? 0;

  let totalValue = 0;
  let valueTruncated = false;
  if (valueRes) {
    const vals = ((valueRes as any)?.data || []) as { value: number | string }[];
    totalValue = vals.reduce((s, r) => s + (Number(r.value) || 0), 0);
    // Am însumat mai puține poziții decât există? (plafonul nostru SAU o limită impusă de server)
    // → totalul e parțial și trebuie spus, altfel afișăm tăcut un număr greșit.
    valueTruncated = vals.length < total;
  }

  return { rows, total, page, pageSize, totalValue, valueTruncated };
}

export async function catalogRows(opts: { search?: string; groupId?: number } = {}) {
  let q = getSupabase().from('piese_catalog_rows').select('*').order('group_name').limit(500);
  if (opts.groupId) q = q.eq('group_id', opts.groupId);
  if (opts.search?.trim()) q = q.or(catalogSearchOr(orVal(opts.search.trim())));
  const { data } = await q;
  return data || [];
}

// Catalog paginat pentru ecranul „Catalog" (browse): întoarce rândurile paginii + totalul real.
// Separat de catalogRows (folosit de searchParts, cu limită fixă) ca să nu-i schimb semnătura.
// count:'exact' dă numărul total al setului filtrat într-un singur round-trip; filtrul pe grup e index-asistat.
export async function catalogPage(opts: { search?: string; groupId?: number; page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 100;
  const page = Math.max(1, opts.page || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = getSupabase()
    .from('piese_catalog_rows')
    .select('*', { count: 'exact' })
    .order('group_name')
    .order('name_long')
    .range(from, to);
  if (opts.groupId) q = q.eq('group_id', opts.groupId);
  if (opts.search?.trim()) q = q.or(catalogSearchOr(orVal(opts.search.trim())));
  const { data, count } = await q;
  return { rows: (data || []) as any[], total: count ?? 0, page, pageSize };
}

// Etichetă bogată a piesei (denumire + producător (model) + articol). SURSĂ UNICĂ — folosită
// de căutarea din formulare (search-parts) și la crearea „din mers" (part-actions), ca să nu difere.
export function partLabel(p: Record<string, unknown>): string {
  const name = (p.name_ro as string) || (p.name_long as string) || (p.group_name as string) || '';
  const mm = `${(p.manufacturer as string) ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();
  const art = p.article_code ? ' · ' + (p.article_code as string) : '';
  return `${name}${mm ? ' — ' + mm : ''}${art}`.trim();
}

// O singură piesă (câmpuri editabile) pentru formularul de editare din Nomenclator.
export async function getPartById(id: number) {
  const { data } = await getSupabase().from('piese_catalog_rows').select('*').eq('id', id).maybeSingle();
  return data || null;
}

// Locația unei piese într-un depozit anume (pentru editarea locației din Catalog → alimentează Harta).
export async function getPartLocation(partId: number, warehouseId: number) {
  const { data } = await getSupabase()
    .from('piese_part_locations')
    .select('location_label, min_qty')
    .eq('part_id', partId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  return data || null;
}

export async function lowStock() {
  const { data } = await getSupabase().from('piese_low_stock').select('*').limit(50);
  return data || [];
}
export async function recentDocs(limit = 8) {
  const { data } = await getSupabase().from('piese_recent_docs').select('*').limit(limit);
  return data || [];
}

// ── Documente de prihod (jurnal recepții) ──
// Listă de documente RECEIPT cu furnizor + nr. poziții + total (Σ cantitate×cost) + creator. Filtrabilă pe
// depozit + perioadă. Scoping-ul pe depozit (cont legat) se impune în server action (listReceiptDocs).
export async function receiptDocs(opts: { warehouseId?: number; supplierId?: number; search?: string; from?: string; to?: string; limit?: number } = {}) {
  const sb = getSupabase();
  let q = sb.from('piese_stock_documents')
    .select('id, created_at, warehouse_id, invoice_series, invoice_number, note, invoice_total, created_by_admin, supplier:piese_suppliers(name), lines:piese_stock_document_lines(qty, unit_cost)')
    .eq('doc_type', 'RECEIPT')
    .neq('status', 'CANCELLED') // ascunde recepțiile anulate de o corecție (rămâne doar documentul corectat)
    // Exclude „Sold inițial" (invoice_series='SOLD'): e stoc de pornire încărcat din Inventar, NU recepție de la
    // furnizor — și are ~o linie per piesă (mii), deci ar exploda embed-ul liniilor. Păstrează seriile NULL (prihod manual fără serie).
    .or('invoice_series.is.null,invoice_series.neq.SOLD')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }) // tiebreak determinist la același created_at (ex. solduri importate în masă)
    .limit(opts.limit ?? 200);
  if (opts.warehouseId) q = q.eq('warehouse_id', opts.warehouseId);
  if (opts.supplierId) q = q.eq('supplier_id', opts.supplierId);
  // Căutare pe serie / număr / comentariu (partial, case-insensitive). Al doilea .or() se combină cu AND peste
  // filtrul de excludere SOLD. `orVal` escapează valoarea (tratată ca DATE în ghilimele), nu ca filtru injectat.
  if (opts.search) { const s = orVal(opts.search); q = q.or(`invoice_series.ilike."%${s}%",invoice_number.ilike."%${s}%",note.ilike."%${s}%"`); }
  if (opts.from) q = q.gte('created_at', opts.from);
  if (opts.to) q = q.lt('created_at', opts.to); // `to` = ISO exclusiv (miezul nopții zilei următoare, ora Chișinău)
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data as any[]) || [];
  // „Cine": created_by_admin (uuid) → nume, rezolvat separat (evită ambiguitatea de embedding pe admin_accounts).
  const ids = Array.from(new Set(rows.map((r) => r.created_by_admin).filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: admins } = await sb.from('admin_accounts').select('id, name').in('id', ids as string[]);
    for (const a of ((admins as any[]) || [])) names.set(a.id, a.name);
  }
  return rows.map((r) => {
    const lines = (r.lines as any[]) || [];
    return {
      id: r.id as number,
      createdAt: r.created_at as string,
      warehouseId: r.warehouse_id as number,
      series: (r.invoice_series as string) || null,
      number: (r.invoice_number as string) || null,
      note: (r.note as string) || null,
      supplier: (r.supplier?.name as string) || null,
      positions: lines.length,
      // Aceeași însumare ca la verificare (rotunjire pe linie) — altfel totalul din jurnal ar putea
      // diferi cu bani de cel pe care garda l-a validat, și cifrele n-ar mai fi comparabile.
      total: receiptLinesSum(lines.map((l: any) => ({ qty: l.qty, unit_cost: l.unit_cost }))),
      // Suma de control declarată de depozitar (migr. 288). null = recepție introdusă fără verificare.
      invoiceTotal: r.invoice_total == null ? null : Number(r.invoice_total),
      creator: r.created_by_admin ? (names.get(r.created_by_admin) || null) : null,
    };
  });
}

// Depozitul unui document de recepție — pentru garda de scoping la deschiderea liniilor (cont legat).
export async function receiptDocWarehouse(docId: number): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('piese_stock_documents').select('warehouse_id').eq('id', docId).eq('doc_type', 'RECEIPT').maybeSingle();
  if (error) throw new Error('Nu am putut verifica documentul');
  return (data as { warehouse_id: number } | null)?.warehouse_id ?? null;
}

// Liniile unui document de recepție (piesă + cantitate + cost + total).
export async function receiptDocLines(docId: number) {
  const { data, error } = await getSupabase()
    .from('piese_stock_document_lines')
    .select('part_id, qty, unit_cost, part:piese_parts(name_ro, name_long, article_code)')
    .eq('document_id', docId);
  if (error) throw new Error(error.message);
  return ((data as any[]) || []).map((l) => ({
    partId: l.part_id as number,
    name: (l.part?.name_ro as string) || (l.part?.name_long as string) || `#${l.part_id}`,
    article: (l.part?.article_code as string) || null,
    qty: Number(l.qty),
    unitCost: Number(l.unit_cost),
    total: Number(l.qty) * Number(l.unit_cost),
  }));
}

// Atribuie creatorul unui document de recepție (created_by_admin = contul care a făcut prihodul).
// Completează, ÎNTR-UN SINGUR UPDATE, câmpurile pe care RPC-ul de creare nu le cunoaște: autorul, comentariul
// la factură și suma de control (migr. 288). Erau trei UPDATE-uri pe același rând, deci trei round-trip-uri
// pe drumul în care depozitarul așteaptă — și trei ferestre în care recepția putea rămâne fără martor.
// Non-fatal: recepția e deja scrisă și corectă; dacă asta pică, lipsesc doar însoțitoarele — dar rămâne log.
export async function finalizeReceipt(
  docId: number,
  d: { createdBy?: string | null; note?: string | null; invoiceTotal?: number | null },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (d.createdBy) patch.created_by_admin = d.createdBy;
  if (d.note) patch.note = d.note;
  if (d.invoiceTotal != null) patch.invoice_total = d.invoiceTotal;
  if (!Object.keys(patch).length) return;
  const { error } = await getSupabase()
    .from('piese_stock_documents').update(patch).eq('id', docId).eq('doc_type', 'RECEIPT');
  if (error) console.error('[prihod] finalizeReceipt:', error.message);
}

// ── Modificarea unei recepții (#1b) ──
// Antetul unui document de recepție (pentru ecranul de modificare). Doar RECEIPT ne-anulat.
export async function receiptDocHeaderForEdit(docId: number): Promise<{ id: number; warehouseId: number; supplierId: number | null; series: string | null; number: string | null; note: string | null; invoiceTotal: number | null; createdAt: string; status: string } | null> {
  const { data, error } = await getSupabase().from('piese_stock_documents')
    .select('id, warehouse_id, supplier_id, invoice_series, invoice_number, note, invoice_total, created_at, status, doc_type')
    .eq('id', docId).maybeSingle();
  if (error) throw new Error('Nu am putut încărca documentul');
  const d = data as any;
  if (!d || d.doc_type !== 'RECEIPT') return null;
  return { id: d.id, warehouseId: d.warehouse_id, supplierId: d.supplier_id ?? null, series: d.invoice_series ?? null, number: d.invoice_number ?? null, note: d.note ?? null, invoiceTotal: d.invoice_total == null ? null : Number(d.invoice_total), createdAt: d.created_at, status: d.status };
}

// Poate fi editat pe LINII documentul? (adevărat doar dacă niciun strat FIFO al recepției nu a fost consumat.)
// Când e consumat, întoarce și pe ce documente a plecat marfa (cantitatea consumată din ACEASTĂ recepție), pt. avertisment.
export async function receiptEditInfo(docId: number): Promise<{ canEditLines: boolean; consumedBy: { docType: string; series: string | null; number: string | null; createdAt: string | null; qty: number }[] }> {
  const sb = getSupabase();
  // Fail-CLOSED la eroare de DB: dacă nu putem determina consumul, tratăm liniile ca NEeditabile (nu deschidem
  // greșit editarea unei recepții posibil consumate). Motorul re-verifică oricum atomic (CONSUMED) la salvare.
  const { data: movs, error: eMovs } = await sb.from('piese_stock_movements').select('id').eq('document_id', docId).eq('movement_type', 'RECEIPT');
  if (eMovs) return { canEditLines: false, consumedBy: [] };
  const ids = ((movs as any[]) || []).map((m) => m.id);
  if (!ids.length) return { canEditLines: true, consumedBy: [] };
  const { data: allocs, error: eAlloc } = await sb.from('piese_fifo_alloc').select('issue_movement_id, qty').in('receipt_movement_id', ids);
  if (eAlloc) return { canEditLines: false, consumedBy: [] };
  const consumed = ((allocs as any[]) || []).filter((a) => Number(a.qty) > 0.0000001);
  if (!consumed.length) return { canEditLines: true, consumedBy: [] };
  const issueIds = Array.from(new Set(consumed.map((a) => a.issue_movement_id)));
  const { data: imovs } = await sb.from('piese_stock_movements').select('id, document_id').in('id', issueIds);
  const movDoc = new Map<number, number | null>(((imovs as any[]) || []).map((m) => [m.id, m.document_id]));
  const agg = new Map<number, number>(); // document_id → cantitate consumată din ACEASTĂ recepție
  for (const a of consumed) {
    const dId = movDoc.get(a.issue_movement_id);
    if (dId == null) continue;
    agg.set(dId, (agg.get(dId) || 0) + Number(a.qty));
  }
  const consDocIds = Array.from(agg.keys());
  const { data: cdocs } = consDocIds.length
    ? await sb.from('piese_stock_documents').select('id, doc_type, invoice_series, invoice_number, created_at').in('id', consDocIds)
    : { data: [] as any[] };
  const byId = new Map<number, any>(((cdocs as any[]) || []).map((d) => [d.id, d]));
  const consumedBy = consDocIds.map((id) => {
    const d = byId.get(id);
    return { docType: (d?.doc_type as string) || 'consum', series: (d?.invoice_series as string) || null, number: (d?.invoice_number as string) || null, createdAt: (d?.created_at as string) || null, qty: agg.get(id) || 0 };
  });
  return { canEditLines: false, consumedBy };
}

// Modifică DOAR antetul (furnizor/serie/număr/comentariu) — sigur chiar și când marfa a fost consumată (nu atinge stocul).
export async function updateReceiptHeader(docId: number, h: { supplier_id: number | null; invoice_series: string | null; invoice_number: string | null; note: string | null; invoice_total?: number | null }): Promise<void> {
  // `invoice_total` se scrie DOAR dacă apelantul l-a trimis: `undefined` = „nu atinge", `null` = „golește".
  // Fără asta, un apelant care omite câmpul ar șterge tăcut suma de control.
  const patch: Record<string, unknown> = { supplier_id: h.supplier_id, invoice_series: h.invoice_series, invoice_number: h.invoice_number, note: h.note };
  if (h.invoice_total !== undefined) patch.invoice_total = h.invoice_total;
  const { data, error } = await getSupabase().from('piese_stock_documents')
    .update(patch)
    .eq('id', docId).eq('doc_type', 'RECEIPT').eq('status', 'CONFIRMED').select('id');
  if (error) throw new Error(error.message);
  if (!data || (data as any[]).length === 0) throw new Error('NOT_CONFIRMED'); // anulat concurent între gardă și UPDATE → nu raporta fals „salvat"
}

// Modifică LINIILE (anulare + refacere prin RPC). Aruncă cu codul RPC (CONSUMED/NOT_CONFIRMED/…) — se mapează în actions.
export async function replaceReceiptLines(docId: number, p: { supplier_id: number | null; invoice_series: string | null; invoice_number: string | null; note: string | null; lines: { part_id: number; qty: number; unit_cost: number }[] }): Promise<number> {
  const { data, error } = await getSupabase().rpc('piese_replace_receipt', {
    p_doc: docId, p_supplier: p.supplier_id, p_series: p.invoice_series, p_number: p.invoice_number, p_note: p.note, p_lines: p.lines, p_user: null,
  });
  if (error) throw error;
  return Number(data);
}

export async function dashboardStats() {
  const sb = getSupabase();
  const count = async (t: string) => (await sb.from(t).select('*', { count: 'exact', head: true })).count || 0;
  const [parts, vehicles, movements, warehouses, val, low] = await Promise.all([
    count('piese_parts'), count('piese_vehicles'), count('piese_stock_movements'), count('piese_warehouses'),
    sb.rpc('piese_total_stock_value'), lowStock(),
  ]);
  return { parts, vehicles, movements, warehouses, stockValue: Number(val.data) || 0, lowStock: (low as any[]).length };
}

export async function createReceipt(p: { warehouse_id: number; supplier_id: number | null; invoice_series?: string; invoice_number?: string; lines: { part_id: number; qty: number; unit_cost: number }[] }) {
  const { data, error } = await getSupabase().rpc('piese_create_receipt', {
    p_wh: p.warehouse_id, p_supplier: p.supplier_id, p_series: p.invoice_series || null, p_number: p.invoice_number || null,
    p_lines: p.lines, p_user: null,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

// Recepție de SOLD INIȚIAL, IDEMPOTENTĂ pe cheia clientului (trecută ca invoice_number, series='SOLD').
// Indexul unic parțial `uq_piese_sold_initial_receipt` (migr. 235) respinge un duplicat cu aceeași cheie în
// același depozit (pană de rețea + re-click) → 23505, pe care îl tratăm ca „deja înregistrat" (nu se dublează).
export async function createInitialReceipt(p: { warehouse_id: number; supplier_id: number; idem_key: string; lines: { part_id: number; qty: number; unit_cost: number }[] }): Promise<{ docId: number | null; duplicate: boolean }> {
  const { data, error } = await getSupabase().rpc('piese_create_receipt', {
    p_wh: p.warehouse_id, p_supplier: p.supplier_id, p_series: 'SOLD', p_number: p.idem_key, p_lines: p.lines, p_user: null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') return { docId: null, duplicate: true };
    throw new Error(error.message);
  }
  return { docId: Number(data), duplicate: false };
}

// Stoc + cost mediu curent pentru o piesă într-un depozit (pentru ecranul „Revizuire cost").
export async function partStock(warehouseId: number, partId: number): Promise<{ qty: number; value: number; avgCost: number }> {
  const { data } = await getSupabase().from('piese_current_stock').select('qty, value').eq('warehouse_id', warehouseId).eq('part_id', partId).maybeSingle();
  const qty = Number((data as { qty?: number } | null)?.qty) || 0;
  const value = Number((data as { value?: number } | null)?.value) || 0;
  return { qty, value, avgCost: qty > 0 ? value / qty : 0 };
}

// Revizuirea costului mediu al unei piese, PĂSTRÂND cantitatea (RPC piese_recost, migr. 235).
export async function recostPart(warehouseId: number, partId: number, newCost: number): Promise<{ qty: number; oldAvg: number; newCost: number }> {
  const { data, error } = await getSupabase().rpc('piese_recost', { p_wh: warehouseId, p_part: partId, p_new_cost: newCost, p_user: null });
  if (error) throw new Error(error.message);
  const r = data as { qty: number; old_avg: number; new_cost: number };
  return { qty: Number(r.qty), oldAvg: Number(r.old_avg), newCost: Number(r.new_cost) };
}

export async function issueAlert(warehouseId: number, vehicleId: number | null, partId: number) {
  const sb = getSupabase();
  const { data: cs } = await sb.from('piese_current_stock').select('qty').eq('part_id', partId).eq('warehouse_id', warehouseId).maybeSingle();
  let alert: { level: string; messages: string[] } | null = null;
  if (vehicleId) {
    const { data } = await sb.rpc('piese_issue_alert', { p_vehicle: vehicleId, p_part: partId });
    alert = data as any;
  }
  return { stock: Number(cs?.qty) || 0, alert };
}

export async function createIssue(p: { warehouse_id: number; vehicle_id: number | null; mechanic_id: number | null; breakdown_reason_id: number | null; part_id: number; qty: number }) {
  const { data, error } = await getSupabase().rpc('piese_create_issue', {
    p_wh: p.warehouse_id, p_vehicle: p.vehicle_id, p_mechanic: p.mechanic_id, p_reason: p.breakdown_reason_id,
    p_lines: [{ part_id: p.part_id, qty: p.qty }], p_user: null,
  });
  if (error) throw new Error(error.message);
  const res = data as any;
  return { docId: res.doc_id as number, shortages: (res.shortages || []) as string[] };
}

// Layout pentru harta depozitului — derivat din codurile de locație "STELAJ-RÂND-POLIȚĂ-CELULĂ"
// Parsarea locației trăiește în lib/piese-location.ts (fără 'server-only'), ca formularele să valideze
// exact ce validează serverul. Re-exportat aici pentru apelanții existenți.
export { parseLocation, formatLocation } from './piese-location';
import { parseLocation as parseLoc } from './piese-location';
import { receiptLinesSum } from './piese-receipt';

const sortKey = (s: string) => { const n = Number(s); return isNaN(n) ? s : String(n).padStart(6, '0'); };

export async function warehouseLayout(warehouseId: number) {
  const { data } = await getSupabase().from('piese_locations_full').select('*').eq('warehouse_id', warehouseId);
  const rows = (data || []) as any[];
  const sec: Record<string, Record<string, any[]>> = {};
  for (const r of rows) {
    const { section, rack, shelf, cell } = parseLoc(r.location_label);
    sec[section] = sec[section] || {};
    sec[section][rack] = sec[section][rack] || [];
    sec[section][rack].push({ partId: r.part_id, group: r.group_name, name: r.name_long, shelf, cell, qty: Number(r.qty) });
  }
  const sections = Object.keys(sec).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((section) => {
    const racks = Object.keys(sec[section]).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((rack) => {
      // Ordinea de pe raft: întâi poliță, apoi celulă — ca lista să urmeze drumul mâinii, nu ordinea din bază.
      const items = sec[section][rack].sort((a, b) =>
        sortKey(a.shelf).localeCompare(sortKey(b.shelf)) || sortKey(a.cell).localeCompare(sortKey(b.cell)));
      return { rack, items, types: items.length };
    });
    return { section, racks, types: racks.reduce((s: number, r: any) => s + r.types, 0) };
  });
  return { warehouseId, sections, totalTypes: sections.reduce((s, x) => s + x.types, 0) };
}

export async function locatePart(warehouseId: number, code: string) {
  const c = code.trim();
  if (!c) return { found: false as const };
  const e = orVal(c);
  const { data: p } = await getSupabase().from('piese_catalog_rows')
    .select('id, group_name, manufacturer, model')
    .or(`barcode.eq."${e}",article_code.eq."${e}",oem_code.eq."${e}",group_name.ilike."%${e}%",name_long.ilike."%${e}%",name_ro.ilike."%${e}%"`).limit(1).maybeSingle();
  if (!p) return { found: false as const };
  const { data: loc } = await getSupabase().from('piese_part_locations').select('location_label').eq('warehouse_id', warehouseId).eq('part_id', (p as any).id).maybeSingle();
  const placement = loc ? { ...parseLoc((loc as any).location_label), label: (loc as any).location_label } : null;
  return { found: true as const, label: `${(p as any).group_name} ${(p as any).manufacturer ?? ''} ${(p as any).model ? '(' + (p as any).model + ')' : ''}`.trim(), placement };
}
