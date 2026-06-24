export const dynamic = 'force-dynamic';

import { listWarehouses, listSuppliers, catalogRows } from '@/lib/piese';
import { requirePieseWrite } from '@/lib/piese-access';
import PrihodClient from './PrihodClient';

const partLabel = (p: any) => `${p.group_name} — ${p.manufacturer ?? ''} ${p.model ? '(' + p.model + ')' : ''}`.trim();

export default async function PrihodPage() {
  await requirePieseWrite();
  const [warehouses, suppliers, parts] = await Promise.all([listWarehouses(), listSuppliers(), catalogRows()]);
  return (
    <>
      <div className="page-header"><h1>Prihod — recepție marfă</h1><p>Fiecare poziție intră ca strat FIFO. Stocul crește automat.</p></div>
      <PrihodClient
        warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name }))}
        suppliers={(suppliers as any[]).map((s) => ({ id: s.id, label: s.name }))}
        parts={(parts as any[]).map((p) => ({ id: p.id, label: partLabel(p) }))}
      />
    </>
  );
}
