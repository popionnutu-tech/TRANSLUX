export const dynamic = 'force-dynamic';

import { requirePieseAudit } from '@/lib/piese-access';
import { auditFeed, auditActors, auditKinds } from '@/lib/audit';
import JurnalClient from './JurnalClient';

export default async function JurnalPage() {
  await requirePieseAudit(); // doar administratorul
  const [first, actors, kinds] = await Promise.all([
    auditFeed({}), auditActors(), auditKinds(),
  ]);
  return (
    <>
      <div className="page-header">
        <h1>Jurnal</h1>
        <p>Urma scrisă de modul: documente create și corectate, eliberări de piese, mutări, inventarieri, nomenclatoare, plus schimbările de roluri și permisiuni.</p>
      </div>
      <JurnalClient
        initialRows={first.rows}
        initialHasMore={first.hasMore}
        actors={actors}
        kinds={kinds}
      />
    </>
  );
}
