export const dynamic = 'force-dynamic';

import { catalogForExport, offersForExport } from '@/lib/piese-ops';
import { requirePiese1C } from '@/lib/piese-access';

export default async function Integrare1CPage() {
  await requirePiese1C();
  const [cat, offers] = await Promise.all([catalogForExport(), offersForExport()]);
  return (
    <>
      <div className="page-header"><h1>Integrare 1C</h1><p>Schimb într-o singură direcție (modulul = sursa), declanșat de buton — exact cum cere contabilitatea. Format CommerceML 2.x.</p></div>
      <div className="alert info">Fișierele se generează în formatul standard de schimb 1C (CommerceML). Conectarea automată la serverul 1C se activează când avem accesul deservantului 1C.</div>
      <div className="grid cols-2">
        <div className="card">
          <h2>Catalog (nomenclator)</h2>
          <p className="muted">{(cat.parts as any[]).length} piese, {(cat.groups as any[]).length} grupe — товары + группы + штрихкоды.</p>
          <a className="btn btn-primary" href="/api/piese/1c/catalog" download>⬇ Exportă catalog pentru 1C</a>
        </div>
        <div className="card">
          <h2>Остатки și prețuri</h2>
          <p className="muted">{(offers as any[]).length} poziții cu stoc — количество + цены, pe depozite.</p>
          <a className="btn btn-primary" href="/api/piese/1c/offers" download>⬇ Exportă остатки/prețuri pentru 1C</a>
        </div>
      </div>
      <div className="card">
        <h2>Ce rămâne în 1C</h2>
        <p className="muted">Datoriile furnizori, plățile, banii podotciot și сverka rămân integral în 1C (după interviul Marianei). Modulul trimite prihodul, catalogul și остатки.</p>
      </div>
    </>
  );
}
