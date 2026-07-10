export const dynamic = 'force-dynamic';

import { listWarehouses } from '@/lib/piese';
import { transfersTransit } from '@/lib/piese-ops';
import { requirePieseIssue } from '@/lib/piese-access';
import MutariClient from './MutariClient';

export default async function MutariPage() {
  await requirePieseIssue();
  const [warehouses, transit] = await Promise.all([listWarehouses(), transfersTransit()]);
  return (
    <>
      <div className="page-header"><h1>Mutări între depozite</h1><p>Piesa iese din stoc doar când o trimite depozitarul-sursă. Cât e între depozite, e „pe drum".</p></div>
      <MutariClient
        warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name }))}
        transit={(transit as any[]).map((t) => ({ id: t.id, from_name: t.from_name, to_name: t.to_name, line_count: t.line_count }))}
      />
    </>
  );
}
