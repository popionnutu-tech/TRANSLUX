export const dynamic = 'force-dynamic';

import { catalogForExport, offersForExport } from '@/lib/piese-ops';
import { requirePiese1C } from '@/lib/piese-access';
import { eliberariDeExportat } from '@/lib/piese-1c-export';
import { getSupabase } from '@/lib/supabase';

export default async function Integrare1CPage() {
  await requirePiese1C();
  const [cat, offers, eliberari, acoperire] = await Promise.all([
    catalogForExport(), offersForExport(), eliberariDeExportat(50),
    getSupabase().from('piese_1c_acoperire').select('*').then((r) => (r.data as any[]) || []),
  ]);
  const lei = (n: number) => Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <>
      <div className="page-header"><h1>Integrare 1C</h1><p>Schimb într-o singură direcție (modulul = sursa), declanșat de buton — exact cum cere contabilitatea. Două formate: CommerceML pentru catalog și остатки, «Конвертация данных 2.0» pentru documentele de списание.</p></div>
      <div className="alert info">Fișierele se generează local și se încarcă manual în 1C. Conectarea automată la serverul 1C se activează când avem accesul deservantului 1C.</div>
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
        <h2>Списание запчастей — eliberările pe mașini</h2>
        <p className="muted">
          Formatul propriu al contabilității („Конвертация данных 2.0"), nu CommerceML. Fiecare eliberare
          devine un document în 1C, cu piesele, sumele și mașina ca «вид деятельности».
        </p>

        {/* Acoperirea se arată ÎNAINTE de listă: dacă lipsesc legături, aici se vede de ce, nu la al
            treilea buton care refuză. */}
        <div className="row" style={{ gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          {acoperire.map((a: any) => {
            const complet = Number(a.cu_guid) === Number(a.total);
            return (
              <div key={a.entitate} style={{ fontSize: 13 }}>
                <strong>{a.entitate}</strong>:{' '}
                <span style={{ color: complet ? '#0a7' : '#c80' }}>{a.cu_guid} / {a.total}</span>{' '}
                <span className="muted">legate de 1C</span>
              </div>
            );
          })}
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Nr.</th><th style={{ width: 100 }}>Data</th>
              <th>Depozit</th><th style={{ width: 100 }}>Mașina</th>
              <th style={{ width: 70 }}>Poziții</th><th style={{ width: 110 }}>Suma</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {eliberari.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td>{e.data}</td>
                <td>{e.depozit}</td>
                <td>{e.masina ?? <span className="muted">—</span>}</td>
                <td>{e.linii}</td>
                <td>{e.linii ? lei(e.suma) : <span className="muted">—</span>}</td>
                <td>
                  {e.gata ? (
                    <a className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }}
                      href={`/api/piese/1c/spisanie/${e.id}`} download>
                      ⬇ {e.trimis ? 'Descarcă din nou' : 'Descarcă pentru 1C'}
                    </a>
                  ) : (
                    // Fără buton, cu motivul scris: un buton care dă eroare arată ca o defecțiune și se
                    // apasă de mai multe ori. Așa se vede din prima ce lipsește.
                    <span className="muted" style={{ fontSize: 12 }}>{e.motiv}</span>
                  )}
                </td>
              </tr>
            ))}
            {!eliberari.length && <tr><td colSpan={7} className="muted">Nicio eliberare încă.</td></tr>}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Documentul păstrează același identificator la fiecare descărcare: reîncărcat în 1C, se
          actualizează, nu se dublează. O eliberare returnată integral nu produce fișier — consumul net e zero.
        </p>
      </div>

      <div className="card">
        <h2>Ce rămâne în 1C</h2>
        <p className="muted">Datoriile furnizori, plățile, banii podotciot și сverka rămân integral în 1C (după interviul Marianei). Modulul trimite prihodul, catalogul și остатки.</p>
      </div>
    </>
  );
}
