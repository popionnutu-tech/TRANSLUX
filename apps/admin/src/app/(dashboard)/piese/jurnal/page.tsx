export const dynamic = 'force-dynamic';

import { requirePieseAudit } from '@/lib/piese-access';
import { auditFeed, auditActors, auditKinds } from '@/lib/audit';
import JurnalClient from './JurnalClient';

// Ziua de Chișinău în forma pe care o cere `<input type="date">`. `en-CA` dă exact „AAAA-LL-ZZ".
const ziChisinau = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

// Câte zile se arată la deschidere. Nu e o limită — e doar punctul de pornire, iar ecranul spune mereu, pe
// un rând deasupra listei, ce interval e afișat, cu un buton care îl scoate. Un filtru pus în tăcere într-un
// ecran de audit ar fi mai periculos decât o căutare mai lentă: ai căuta ceva de acum patru luni, n-ai găsi
// nimic și ai crede că nu s-a întâmplat.
const ZILE_IMPLICIT = 30;

export default async function JurnalPage() {
  await requirePieseAudit(); // doar administratorul
  const de = ziChisinau(new Date(Date.now() - ZILE_IMPLICIT * 86400_000));
  const [first, actors, kinds] = await Promise.all([
    auditFeed({ from: de }), auditActors(), auditKinds(),
  ]);
  return (
    <>
      <div className="page-header">
        <h1>Jurnal</h1>
        <p>Urma scrisă de modul: documente create și corectate, eliberări de piese, mutări, inventarieri, nomenclatoare, plus schimbările de roluri și permisiuni.</p>
      </div>
      <JurnalClient
        implicitDe={de}
        zileImplicit={ZILE_IMPLICIT}
        initialRows={first.rows}
        initialHasMore={first.hasMore}
        actors={actors}
        kinds={kinds}
      />
    </>
  );
}
