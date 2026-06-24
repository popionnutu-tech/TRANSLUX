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
  const { data, error } = await getSupabase().rpc('piese_create_sale', { p_wh: p.warehouse_id, p_client: p.client_id, p_series: p.invoice_series || null, p_number: p.invoice_number || null, p_lines: p.lines, p_user: null });
  if (error) throw new Error(error.message);
  const r = data as any;
  // Marchează vânzătorul care a creat factura (pentru „facturile lui" în e-Factura).
  if (p.userId) await getSupabase().from('piese_stock_documents').update({ created_by_admin: p.userId }).eq('id', r.doc_id);
  return { docId: r.doc_id as number, total: Number(r.total), cost: Number(r.cost), profit: Number(r.total) - Number(r.cost) };
}
export async function shopProfit() {
  const { data } = await getSupabase().rpc('piese_shop_profit');
  const r = (data as any[])?.[0] || { revenue: 0, cost: 0, profit: 0, sales: 0 };
  return { revenue: Number(r.revenue), cost: Number(r.cost), profit: Number(r.profit), sales: Number(r.sales) };
}

// ── Fiscal (e-Factura) ──
export async function saleInvoices(opts: { sellerId?: string } = {}) {
  let q = getSupabase().from('piese_sale_invoices').select('*');
  if (opts.sellerId) q = q.eq('created_by_admin', opts.sellerId); // vânzătorul vede doar facturile lui
  const { data } = await q;
  return data || [];
}
export async function markSfs(docId: number) {
  const { error } = await getSupabase().rpc('piese_mark_sfs', { p_doc: docId, p_user: null });
  if (error) throw new Error(error.message);
}
const COMPANY = { name: 'TRANSLUX SRL', idno: '1003600000000', address: 'mun. Edineț, Republica Moldova' };
export async function saleUblData(docId: number) {
  const sb = getSupabase();
  const { data: doc } = await sb.from('piese_stock_documents').select('*, piese_clients(name, idno, address)').eq('id', docId).eq('doc_type', 'SALE').eq('status', 'CONFIRMED').maybeSingle();
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
