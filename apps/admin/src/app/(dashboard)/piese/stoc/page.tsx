export const dynamic = 'force-dynamic';

import { stockRows, listWarehouses } from '@/lib/piese';
import { verifySession } from '@/lib/auth';
import { canSeeCost } from '@/lib/piese-access';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

export default async function StocPage({ searchParams }: { searchParams: Promise<{ q?: string; w?: string }> }) {
  const sp = await searchParams;
  const [warehouses, rows] = await Promise.all([
    listWarehouses(),
    stockRows({ warehouseId: sp.w ? Number(sp.w) : undefined, search: sp.q }),
  ]);
  const role = (await verifySession())?.role;
  const showCost = role ? canSeeCost(role) : false; // vânzătorul: doar cantitate + locație, fără cost/valoare
  const total = (rows as any[]).reduce((s, r) => s + Number(r.qty) * Number(r.avg_cost), 0);

  return (
    <>
      <div className="page-header"><h1>Stoc pe cele 3 depozite</h1><p>Остатки în timp real, calculate din jurnal. Valoare FIFO.</p></div>
      <form className="toolbar" method="get">
        <input className="search" name="q" placeholder="Caută: denumire, cod, штрихкод, model…" defaultValue={sp.q || ''} />
        <select name="w" defaultValue={sp.w || ''}>
          <option value="">Toate depozitele</option>
          {(warehouses as any[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Caută</button>
        <span className="muted">{(rows as any[]).length} poziții{showCost ? ` · valoare ${lei(total)}` : ''}</span>
      </form>
      <div className="card">
        {(rows as any[]).length === 0 ? <div className="empty">Nicio poziție.</div> : (
          <table>
            <thead><tr><th>Grup</th><th>Variantă</th><th>Depozit</th><th>Locație</th><th className="num">Stoc</th><th className="num">Cost mediu</th><th className="num">Valoare</th></tr></thead>
            <tbody>
              {(rows as any[]).map((r, i) => {
                const low = r.min_qty > 0 && r.qty <= r.min_qty;
                return (
                  <tr key={i}>
                    <td><strong>{r.group_name}</strong></td>
                    <td>{r.manufacturer} <span className="muted">{r.model ? `· ${r.model}` : ''}</span><br /><span className="muted" style={{ fontSize: 11 }}>{r.barcode}</span></td>
                    <td>{r.warehouse_name}</td>
                    <td className="muted">{r.location_label || '—'}</td>
                    <td className="num">{low ? <span className="badge warn">{r.qty} {r.unit}</span> : <span>{r.qty} {r.unit}</span>}</td>
                    <td className="num">{lei(r.avg_cost)}</td>
                    <td className="num">{lei(Number(r.qty) * Number(r.avg_cost))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
