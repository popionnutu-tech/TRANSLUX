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

// Layout pentru harta depozitului — derivat din codurile de locație "SECȚIE-RAFT-POLIȚĂ"
export function parseLocation(label: string | null | undefined) {
  const m = (label || '').trim().toUpperCase().split('-');
  return { section: m[0] || '—', rack: m[1] || '—', shelf: m[2] || '' };
}
const sortKey = (s: string) => { const n = Number(s); return isNaN(n) ? s : String(n).padStart(6, '0'); };

export async function warehouseLayout(warehouseId: number) {
  const { data } = await getSupabase().from('piese_locations_full').select('*').eq('warehouse_id', warehouseId);
  const rows = (data || []) as any[];
  const sec: Record<string, Record<string, any[]>> = {};
  for (const r of rows) {
    const { section, rack, shelf } = parseLocation(r.location_label);
    sec[section] = sec[section] || {};
    sec[section][rack] = sec[section][rack] || [];
    sec[section][rack].push({ partId: r.part_id, group: r.group_name, name: r.name_long, shelf, qty: Number(r.qty) });
  }
  const sections = Object.keys(sec).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((section) => {
    const racks = Object.keys(sec[section]).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((rack) => {
      const items = sec[section][rack].sort((a, b) => sortKey(a.shelf).localeCompare(sortKey(b.shelf)));
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
  const placement = loc ? { ...parseLocation((loc as any).location_label), label: (loc as any).location_label } : null;
  return { found: true as const, label: `${(p as any).group_name} ${(p as any).manufacturer ?? ''} ${(p as any).model ? '(' + (p as any).model + ')' : ''}`.trim(), placement };
}
