import { getSupabase } from './supabase';
import { parseLocation, warehouseLayout } from './piese';

export async function listClients() {
  const { data } = await getSupabase().from('piese_clients').select('*').order('name');
  return data || [];
}

// ── Mutări ──
export async function transfersTransit() {
  const { data } = await getSupabase().from('piese_transfers_transit').select('*');
  return data || [];
}
export async function transferSend(p: { from_warehouse_id: number; to_warehouse_id: number; lines: { part_id: number; qty: number }[] }) {
  const { data, error } = await getSupabase().rpc('piese_transfer_send', { p_from: p.from_warehouse_id, p_to: p.to_warehouse_id, p_lines: p.lines, p_user: null });
  if (error) throw new Error(error.message);
  return Number(data);
}
export async function transferReceive(docId: number) {
  const { error } = await getSupabase().rpc('piese_transfer_receive', { p_doc: docId, p_user: null });
  if (error) throw new Error(error.message);
}
// Etapa 2: depozitul-DESTINAȚIE al unui document de mutare (pentru garda de la confirmarea primirii).
// Pe un doc TRANSFER, `warehouse_id` = sursa, `to_warehouse_id` = destinația.
// FAIL-CLOSED: dacă interogarea eșuează, aruncăm (nu returnăm null, ca să nu se sară garda din receiveTransfer).
// Filtrăm pe doc_type='TRANSFER' — orice transfer are `to_warehouse_id` setat (migr. 202), deci null ⇒ nu e transfer.
export async function transferDestWarehouse(docId: number): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('piese_stock_documents')
    .select('to_warehouse_id')
    .eq('id', docId)
    .eq('doc_type', 'TRANSFER')
    .maybeSingle();
  if (error) throw new Error('Nu am putut verifica destinația mutării');
  const w = (data as { to_warehouse_id: number | null } | null)?.to_warehouse_id;
  return w == null ? null : Number(w);
}

// ── Inventariere ──
export async function getCountSheet(warehouseId: number) {
  const { data } = await getSupabase().from('piese_stock_rows').select('*').eq('warehouse_id', warehouseId).order('location_label');
  const rows = (data as any[] || []).filter((r) => r.location_label).map((r) => {
    const l = parseLocation(r.location_label);
    return { part_id: r.part_id, label: `${r.group_name} — ${r.manufacturer ?? ''} ${r.model ? '(' + r.model + ')' : ''}`.trim(), current: Number(r.qty), section: l.section, rack: l.rack };
  });
  const layout = await warehouseLayout(warehouseId);
  return { rows, layout };
}
export async function submitInventory(warehouseId: number, counts: { part_id: number; counted_qty: number }[]) {
  const { data, error } = await getSupabase().rpc('piese_inventory_count', { p_wh: warehouseId, p_counts: counts, p_user: null });
  if (error) throw new Error(error.message);
  return { diffs: (data as any).diffs as number };
}

// ── Magazin ──
export async function saleParts() {
  const { data } = await getSupabase().from('piese_sale_parts').select('*');
  return data || [];
}
export async function createSale(p: { warehouse_id: number; client_id: number | null; invoice_series?: string; invoice_number?: string; userId?: string; lines: { part_id: number; qty: number; unit_price: number }[] }) {
  // created_by_admin e setat ATOMIC în RPC (p_created_by), nu printr-un UPDATE separat.
  const { data, error } = await getSupabase().rpc('piese_create_sale', { p_wh: p.warehouse_id, p_client: p.client_id, p_series: p.invoice_series || null, p_number: p.invoice_number || null, p_lines: p.lines, p_user: null, p_created_by: p.userId || null });
  if (error) throw new Error(error.message);
  const r = data as any;
  return { docId: r.doc_id as number, total: Number(r.total), cost: Number(r.cost), profit: Number(r.total) - Number(r.cost) };
}
export async function shopProfit() {
  const { data } = await getSupabase().rpc('piese_shop_profit');
  const r = (data as any[])?.[0] || { revenue: 0, cost: 0, profit: 0, sales: 0 };
  return { revenue: Number(r.revenue), cost: Number(r.cost), profit: Number(r.profit), sales: Number(r.sales) };
}

// ── Fiscal (e-Factura) ──
// Plafon pe listă: fără el, ecranul ar crește nemărginit cu vechimea firmei (ADMIN/CONTABIL au primit
// dintotdeauna lista nefiltrată). Cerem LIMIT+1 ca să știm dacă s-a tăiat ceva și să putem spune în UI —
// o trunchiere tăcută ar face facturile vechi să pară inexistente.
// `pending: true` = doar cele NEtrimise la SFS. Are plafonul LUI, mai larg — NU e nemărginit: trimiterea
// live către SFS nu e activată încă, deci `piese_create_sale` lasă fiecare vânzare pe 'PENDING' și practic
// TOATE facturile sunt „de trimis". Filtrul e util ca să ajungi la o factură veche nesincronizată (care ar
// cădea sub linia plafonului obișnuit), nu ca portiță către o listă fără limită.
const SALE_INVOICES_LIMIT = 500;
const SALE_INVOICES_PENDING_LIMIT = 2000;
// Coloane EXPLICITE: `select('*')` ar trimite la client și `created_by_admin` (UUID-ul contului care a emis),
// de care interfața nu are nevoie — iar un vânzător cu `sees_all_invoices` ar colecta astfel id-urile colegilor.
const SALE_INVOICE_COLS = 'id, invoice_series, invoice_number, created_at, efactura_status, client_name, net';
export async function saleInvoices(opts: { sellerId?: string; pending?: boolean } = {}): Promise<{ rows: any[]; truncated: boolean }> {
  const limit = opts.pending ? SALE_INVOICES_PENDING_LIMIT : SALE_INVOICES_LIMIT;
  let q = getSupabase().from('piese_sale_invoices').select(SALE_INVOICE_COLS);
  if (opts.sellerId) q = q.eq('created_by_admin', opts.sellerId); // vânzătorul vede doar facturile lui
  if (opts.pending) q = q.neq('efactura_status', 'SENT');
  // Ordonare EXPLICITĂ: ORDER BY-ul din interiorul unui view nu e garantat să supraviețuiască sub LIMIT,
  // iar dacă n-ar supraviețui s-ar tăia rânduri arbitrare, nu cele mai vechi.
  // LIMIT+1: cerem un rând peste plafon doar ca să ȘTIM că s-a tăiat și s-o putem spune în UI.
  const { data } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  const rows = data || [];
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}
export async function markSfs(docId: number, sellerId?: string) {
  if (sellerId) { // vânzătorul poate marca doar facturile lui
    const { data } = await getSupabase().from('piese_stock_documents').select('created_by_admin').eq('id', docId).maybeSingle();
    if (!data || (data as any).created_by_admin !== sellerId) throw new Error('Nu poți marca o factură care nu e a ta');
  }
  const { error } = await getSupabase().rpc('piese_mark_sfs', { p_doc: docId, p_user: null });
  if (error) throw new Error(error.message);
}
const COMPANY = { name: 'TRANSLUX SRL', idno: '1003600000000', address: 'mun. Edineț, Republica Moldova' };
export async function saleUblData(docId: number, sellerId?: string) {
  const sb = getSupabase();
  let q = sb.from('piese_stock_documents').select('*, piese_clients(name, idno, address)').eq('id', docId).eq('doc_type', 'SALE').eq('status', 'CONFIRMED');
  if (sellerId) q = q.eq('created_by_admin', sellerId); // vânzătorul descarcă doar facturile lui
  const { data: doc } = await q.maybeSingle();
  if (!doc) return null;
  const { data: lines } = await sb.from('piese_stock_document_lines').select('qty, unit_price, piese_parts(unit, manufacturer, piese_part_groups(name_ro))').eq('document_id', docId);
  const c = (doc as any).piese_clients;
  return {
    series: (doc as any).invoice_series || 'MG', number: (doc as any).invoice_number || String(docId),
    issueDate: ((doc as any).created_at || '').slice(0, 10), supplier: COMPANY,
    customer: { name: c?.name || 'Persoană fizică', idno: c?.idno || '', address: c?.address || '' },
    lines: (lines as any[] || []).map((l) => ({ name: `${l.piese_parts?.piese_part_groups?.name_ro ?? ''} ${l.piese_parts?.manufacturer ?? ''}`.trim(), qty: Number(l.qty), unitPrice: Number(l.unit_price), unit: l.piese_parts?.unit || 'buc' })),
  };
}

// ── 1C export ──
export async function catalogForExport() {
  const sb = getSupabase();
  const [{ data: groups }, { data: parts }] = await Promise.all([
    sb.from('piese_part_groups').select('id, name_ro').order('id'),
    sb.from('piese_catalog_rows').select('id, group_id, name_long, article_code, barcode, unit'),
  ]);
  return { groups: groups || [], parts: parts || [] };
}
export async function offersForExport() {
  const { data } = await getSupabase().from('piese_stock_rows').select('part_id, name_long, warehouse_name, qty, avg_cost');
  return (data as any[] || []).filter((r) => Number(r.qty) > 0).map((r) => ({ part_id: r.part_id, name: r.name_long, warehouse: r.warehouse_name, qty: Number(r.qty), price: Number(r.avg_cost) }));
}

// ── Rapoarte ──
export async function costPerVehicle(limit = 12) {
  const { data } = await getSupabase().from('piese_cost_per_vehicle').select('*').limit(limit);
  return data || [];
}
export async function overconsumption() {
  const { data } = await getSupabase().from('piese_overconsumption').select('*').limit(40);
  return data || [];
}
export async function reliability() {
  const { data } = await getSupabase().from('piese_reliability').select('*');
  return data || [];
}
export async function illiquid() {
  const { data } = await getSupabase().from('piese_illiquid').select('*').limit(40);
  return data || [];
}
export async function movementLedger(limit = 40) {
  const { data } = await getSupabase().from('piese_movement_ledger').select('*').limit(limit);
  return data || [];
}
