export const dynamic = 'force-dynamic';

import { stockRows, listWarehouses, listGroups } from '@/lib/piese';
import { verifySession } from '@/lib/auth';
import { canSeeCost } from '@/lib/piese-access';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

export default async function StocPage({ searchParams }: { searchParams: Promise<{ q?: string; w?: string; grup?: string }> }) {
  const sp = await searchParams;
  const groupId = sp.grup ? Number(sp.grup) : undefined;
  const [warehouses, groups, rows] = await Promise.all([
    listWarehouses(),
    listGroups(),
    stockRows({ warehouseId: sp.w ? Number(sp.w) : undefined, groupId, search: sp.q }),
  ]);
  const role = (await verifySession())?.role;
  const showCost = role ? canSeeCost(role) : false; // vânzătorul: doar cantitate + locație, fără cost/valoare
  const total = (rows as any[]).reduce((s, r) => s + Number(r.qty) * Number(r.avg_cost), 0);

  return (
    <>
      <div className="page-header"><h1>Stoc pe cele 3 depozite</h1><p>Остатки în timp real, calculate din jurnal. Valoare FIFO.</p></div>
      <form className="toolbar" method="get">
        <input className="search" name="q" placeholder="Caută: denumire, cod, штрихкод, model…" defaultValue={sp.q || ''} />
        <select name="grup" defaultValue={groupId ? String(groupId) : ''}>
          <option value="">Toate categoriile</option>
          {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name_ro}</option>)}
        </select>
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
            <thead><tr><th>Denumire</th><th>Grup</th><th>Producător / Model</th><th>Depozit</th><th>Locație</th><th className="num">Stoc</th>{showCost && <><th className="num">Cost mediu</th><th className="num">Valoare</th></>}</tr></thead>
            <tbody>
              {(rows as any[]).map((r, i) => {
                const low = Number(r.min_qty) > 0 && Number(r.qty) <= Number(r.min_qty);
                return (
                  <tr key={i}>
                    <td><strong>{r.name_long || '—'}</strong>{r.barcode && <><br /><span className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.barcode}</span></>}</td>
                    <td className="muted">{r.group_name}</td>
                    <td>{r.manufacturer || '—'} <span className="muted">{r.model ? `· ${r.model}` : ''}</span></td>
                    <td>{r.warehouse_name}</td>
                    <td className="muted">{r.location_label || '—'}</td>
                    <td className="num">{low ? <span className="badge warn">{r.qty} {r.unit}</span> : <span>{r.qty} {r.unit}</span>}</td>
                    {showCost && <><td className="num">{lei(r.avg_cost)}</td>
                    <td className="num">{lei(Number(r.qty) * Number(r.avg_cost))}</td></>}
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
