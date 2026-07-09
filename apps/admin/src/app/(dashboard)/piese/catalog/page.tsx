export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { catalogPage, listGroups } from '@/lib/piese';

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; grup?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || '';
  const groupId = sp.grup ? Number(sp.grup) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [groups, { rows, total, pageSize }] = await Promise.all([
    listGroups(),
    catalogPage({ search: q, groupId, page }),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Link de paginare care păstrează filtrele curente (q + grup) și schimbă doar pagina.
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (groupId) params.set('grup', String(groupId));
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `/piese/catalog?${qs}` : '/piese/catalog';
  };

  return (
    <>
      <div className="page-header">
        <h1>Catalog piese (nomenclator unic)</h1>
        <p>Caută după denumire, cod, articul sau filtrează pe categorie. Pentru stoc, preț și locație folosește <strong>Căutare</strong>.</p>
      </div>

      {/* Submit-ul resetează pagina la 1 (nu propagă `page`). */}
      <form className="toolbar" method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search" name="q" placeholder="Caută: denumire, producător, cod, штрихкод, model…" defaultValue={q} />
        <select name="grup" defaultValue={groupId ? String(groupId) : ''}>
          <option value="">Toate categoriile</option>
          {(groups as any[]).map((g) => (
            <option key={g.id} value={g.id}>{g.name_ro}</option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">Caută</button>
        <span className="muted">{total.toLocaleString('ro-RO')} piese{total > 0 ? ` · ${from}–${to}` : ''}</span>
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Denumire</th><th>Grup</th><th>Producător</th><th>Model</th><th>Articul</th><th>Cod de bare</th><th>Unit.</th><th>Vânzare</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name_long || '—'}</strong></td>
                <td className="muted">{p.group_name}</td>
                <td>{p.manufacturer || '—'}</td>
                <td className="muted">{p.model || '—'}</td>
                <td className="muted">{p.article_code || '—'}</td>
                <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.barcode || '—'}</td>
                <td>{p.unit}</td>
                <td>{p.is_for_sale ? <span className="badge ok">da</span> : <span className="badge gray">parc</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted">Nicio piesă găsită. Schimbă căutarea sau categoria.</td></tr>
            )}
          </tbody>
        </table>

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
