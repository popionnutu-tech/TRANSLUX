import { getSupabase } from './supabase';
import { orVal } from './piese';

// Asistent de căutare piesă (vânzător): după denumire / categorie / cod (articol, OEM, cod de bare) / model
// → denumire corectă + producător + OEM + articol + cod de bare, stoc pe depozite + locație,
//   iar dacă nu e în stoc → ultimul furnizor + preț achiziție; preț de vânzare = cost × (1+adaos% grupă).
// Asamblează DOAR din ce avem deja: piese_catalog_rows + piese_stock_rows + piese_last_supplier + piese_part_sale_price.

export type StockAt = { warehouseId: number; warehouse: string; qty: number; location: string | null };
export type SearchResult = {
  id: number;
  groupName: string;
  nameLong: string;
  manufacturer: string | null;
  model: string | null;
  articleCode: string | null;
  oemCode: string | null;
  barcode: string | null;
  unit: string;
  stock: StockAt[];
  totalQty: number;
  inStock: boolean;
  salePrice: number | null;   // preț de vânzare = cost × (1+adaos%)
  avgCost: number | null;     // cost mediu de achiziție
  lastSupplier: { name: string | null; unitCost: number | null; receivedAt: string | null } | null;
};

export async function searchAssistant(
  query: string,
  opts: { categoryId?: number; limit?: number } = {},
): Promise<SearchResult[]> {
  const sb = getSupabase();
  const s = (query || '').trim();
  const limit = opts.limit ?? 40;

  // 1) Piesele care se potrivesc (din catalog: denumire / grup / articol / OEM / cod de bare / model).
  let q = sb.from('piese_catalog_rows').select('*').order('group_name').limit(limit);
  if (opts.categoryId) q = q.eq('group_id', opts.categoryId);
  if (s) q = q.or(`name_long.ilike.%${s}%,group_name.ilike.%${s}%,article_code.ilike.%${s}%,oem_code.ilike.%${s}%,barcode.ilike.%${s}%,model.ilike.%${s}%`);
  const { data: parts } = await q;
  const list = (parts || []) as any[];
  if (!list.length) return [];
  const ids = list.map((p) => p.id);

  // 2) Stoc + locație pe depozite, ultimul furnizor și prețul — toate pe id-urile găsite, în paralel.
  const [stockRes, supRes, priceRes] = await Promise.all([
    sb.from('piese_stock_rows').select('part_id, warehouse_id, warehouse_name, qty, location_label').in('part_id', ids),
    sb.from('piese_last_supplier').select('part_id, supplier_name, unit_cost, received_at').in('part_id', ids),
    sb.from('piese_part_sale_price').select('part_id, sale_price, avg_cost').in('part_id', ids),
  ]);

  const stockByPart = new Map<number, StockAt[]>();
  for (const r of (stockRes.data || []) as any[]) {
    const arr = stockByPart.get(r.part_id) || [];
    arr.push({ warehouseId: r.warehouse_id, warehouse: r.warehouse_name, qty: Number(r.qty) || 0, location: r.location_label || null });
    stockByPart.set(r.part_id, arr);
  }
  const supByPart = new Map<number, any>();
  for (const r of (supRes.data || []) as any[]) supByPart.set(r.part_id, r);
  const priceByPart = new Map<number, any>();
  for (const r of (priceRes.data || []) as any[]) priceByPart.set(r.part_id, r);

  return list.map((p) => {
    const stockAll = stockByPart.get(p.id) || [];
    const stock = stockAll.filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty);
    const totalQty = stock.reduce((sum, x) => sum + x.qty, 0);
    const price = priceByPart.get(p.id);
    const sup = supByPart.get(p.id);
    return {
      id: p.id,
      groupName: p.group_name,
      nameLong: p.name_long,
      manufacturer: p.manufacturer || null,
      model: p.model || null,
      articleCode: p.article_code || null,
      oemCode: p.oem_code || null,
      barcode: p.barcode || null,
      unit: p.unit,
      stock,
      totalQty,
      inStock: totalQty > 0,
      salePrice: price && Number(price.sale_price) > 0 ? Number(price.sale_price) : null,
      avgCost: price && Number(price.avg_cost) > 0 ? Number(price.avg_cost) : null,
      lastSupplier: sup ? { name: sup.supplier_name || null, unitCost: sup.unit_cost != null ? Number(sup.unit_cost) : null, receivedAt: sup.received_at || null } : null,
    };
  });
}
