export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { catalogPage, listGroups, listWarehouses } from '@/lib/piese';
import { verifySession } from '@/lib/auth';
import { canEditParts } from '@/lib/piese-access';
import CatalogTable from './CatalogTable';

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; grup?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || '';
  const groupId = sp.grup ? Number(sp.grup) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [groups, warehouses, session, { rows, total, pageSize }] = await Promise.all([
    listGroups(),
    listWarehouses(),
    verifySession(),
    catalogPage({ search: q, groupId, page }),
  ]);
  const canEdit = session ? canEditParts(session.role) : false;

  const pages = Math.max(1, Math.ceil(total / pageSize));

  // Link de paginare care păstrează filtrele curente (q + grup) și schimbă doar pagina.
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (groupId) params.set('grup', String(groupId));
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `/piese/catalog?${qs}` : '/piese/catalog';
  };

  // ?page= peste ultima pagină (URL manipulat) → du-te la ultima pagină validă, ca intervalul afișat să fie corect.
  if (page > pages) redirect(pageHref(pages));

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

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

      {canEdit && <p className="muted" style={{ marginTop: -4 }}>Apasă pe o piesă pentru a-i completa/edita datele și locația.</p>}
      <div className="card">
        <CatalogTable
          rows={rows}
          groups={(groups as any[]).map((g) => ({ id: g.id, label: g.name_ro }))}
          warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name }))}
          canEdit={canEdit}
        />

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
