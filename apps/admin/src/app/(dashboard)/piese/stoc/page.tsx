export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { stockPage, listWarehouses, listGroups } from '@/lib/piese';
import { verifySession } from '@/lib/auth';
import { canSeeCost } from '@/lib/piese-access';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

export default async function StocPage({ searchParams }: { searchParams: Promise<{ q?: string; w?: string; grup?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || '';
  const warehouseId = sp.w ? Number(sp.w) : undefined;
  const groupId = sp.grup ? Number(sp.grup) : undefined;
  const pageRaw = Math.floor(Number(sp.page)); // normalizează 2.5 / NaN / Infinity
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const [warehouses, groups, session] = await Promise.all([listWarehouses(), listGroups(), verifySession()]);
  const showCost = session ? canSeeCost(session.role) : false; // vânzătorul: doar cantitate + locație, fără cost/valoare

  const { rows, total, pageSize, totalValue, valueTruncated } = await stockPage({
    warehouseId, groupId, search: q, page, withValue: showCost,
  });

  const pages = Math.max(1, Math.ceil(total / pageSize));

  // Link de paginare care păstrează filtrele curente (q + depozit + grupă) și schimbă doar pagina.
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (warehouseId) params.set('w', String(warehouseId));
    if (groupId) params.set('grup', String(groupId));
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `/piese/stoc?${qs}` : '/piese/stoc';
  };

  // ?page= peste ultima pagină (URL manipulat) → du-te la ultima pagină validă.
  if (page > pages) redirect(pageHref(pages));

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <>
      <div className="page-header"><h1>Stoc pe cele 3 depozite</h1><p>Остатки în timp real, calculate din jurnal. Valoare FIFO.</p></div>

      {/* Submit-ul resetează pagina la 1 (nu propagă `page`). */}
      <form className="toolbar" method="get">
        <input className="search" name="q" placeholder="Caută: denumire, cod, штрихкод, model…" defaultValue={q} />
        <select name="grup" defaultValue={groupId ? String(groupId) : ''}>
          <option value="">Toate categoriile</option>
          {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name_ro}</option>)}
        </select>
        <select name="w" defaultValue={warehouseId ? String(warehouseId) : ''}>
          <option value="">Toate depozitele</option>
          {(warehouses as any[]).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Caută</button>
        <span className="muted">
          {total.toLocaleString('ro-RO')} poziții{total > 0 ? ` · ${from}–${to}` : ''}
          {showCost ? ` · valoare ${lei(totalValue)}` : ''}
        </span>
      </form>

      {showCost && valueTruncated && (
        <div className="alert warn">Valoarea afișată e <strong>parțială</strong> — sunt prea multe poziții pentru a le însuma pe toate. Filtrează pe depozit sau categorie ca să obții un total exact.</div>
      )}

      <div className="card">
        {rows.length === 0 ? <div className="empty">Nicio poziție.</div> : (
          <table>
            <thead><tr><th>Denumire</th><th>Grup</th><th>Producător / Model</th><th>Depozit</th><th>Locație</th><th className="num">Stoc</th>{showCost && <><th className="num">Cost mediu</th><th className="num">Valoare</th></>}</tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const low = Number(r.min_qty) > 0 && Number(r.qty) <= Number(r.min_qty);
                return (
                  <tr key={`${r.part_id}-${r.warehouse_id}-${i}`}>
                    <td><strong>{r.name_long || '—'}</strong>{r.barcode && <><br /><span className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.barcode}</span></>}</td>
                    <td className="muted">{r.group_name}</td>
                    <td>{r.manufacturer || '—'} <span className="muted">{r.model ? `· ${r.model}` : ''}</span></td>
                    <td>{r.warehouse_name}</td>
                    <td className="muted">{r.location_label || '—'}</td>
                    <td className="num">{low ? <span className="badge warn">{r.qty} {r.unit}</span> : <span>{r.qty} {r.unit}</span>}</td>
                    {/* Valoarea pe rând vine din aceeași coloană `value` pe care o însumează totalul din antet
                        (nu din qty×avg_cost), ca suma vizuală a coloanei să corespundă exact totalului. */}
                    {showCost && <><td className="num">{lei(r.avg_cost)}</td>
                    <td className="num">{lei(Number(r.value))}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
            {page > 1
              ? <Link className="btn" href={pageHref(page - 1)}>‹ Precedent</Link>
              : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>‹ Precedent</span>}
            <span className="muted">Pagina {page} din {pages}</span>
            {page < pages
              ? <Link className="btn" href={pageHref(page + 1)}>Următor ›</Link>
              : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Următor ›</span>}
          </div>
        )}
      </div>
    </>
  );
}
