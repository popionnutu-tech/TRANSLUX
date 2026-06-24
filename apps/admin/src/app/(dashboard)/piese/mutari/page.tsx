export const dynamic = 'force-dynamic';

import { listWarehouses, catalogRows } from '@/lib/piese';
import { transfersTransit } from '@/lib/piese-ops';
import { requirePieseWrite } from '@/lib/piese-access';
import MutariClient from './MutariClient';

const partLabel = (p: any) => `${p.group_name} — ${p.manufacturer ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();

export default async function MutariPage() {
  await requirePieseWrite();
  const [warehouses, parts, transit] = await Promise.all([listWarehouses(), catalogRows(), transfersTransit()]);
  return (
    <>
      <div className="page-header"><h1>Mutări între depozite</h1><p>Piesa iese din stoc doar când o trimite depozitarul-sursă. Cât e între depozite, e „pe drum".</p></div>
      <MutariClient
        warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name }))}
        parts={(parts as any[]).map((p) => ({ id: p.id, label: partLabel(p) }))}
        transit={(transit as any[]).map((t) => ({ id: t.id, from_name: t.from_name, to_name: t.to_name, line_count: t.line_count }))}
      />
    </>
  );
}
