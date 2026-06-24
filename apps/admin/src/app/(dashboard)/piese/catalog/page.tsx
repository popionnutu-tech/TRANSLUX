export const dynamic = 'force-dynamic';

import { catalogRows } from '@/lib/piese';

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const rows = await catalogRows(sp.q);
  return (
    <>
      <div className="page-header"><h1>Catalog piese (nomenclator unic)</h1><p>Grup (denumire scurtă) → variante (producător, model, cod). Caută după orice câmp.</p></div>
      <form className="toolbar" method="get">
        <input className="search" name="q" placeholder="Caută: denumire, producător, cod, штрихкод, model…" defaultValue={sp.q || ''} />
        <button className="btn btn-primary" type="submit">Caută</button>
        <span className="muted">{(rows as any[]).length} piese</span>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Grup</th><th>Producător</th><th>Model</th><th>Articul</th><th>Cod de bare</th><th>Unit.</th><th>Vânzare</th></tr></thead>
          <tbody>
            {(rows as any[]).map((p) => (
              <tr key={p.id}>
                <td><strong>{p.group_name}</strong></td>
                <td>{p.manufacturer || '—'}</td>
                <td className="muted">{p.model || '—'}</td>
                <td className="muted">{p.article_code || '—'}</td>
                <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.barcode || '—'}</td>
                <td>{p.unit}</td>
                <td>{p.is_for_sale ? <span className="badge ok">da</span> : <span className="badge gray">parc</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
