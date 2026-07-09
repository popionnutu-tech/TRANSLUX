export const dynamic = 'force-dynamic';

import { listWarehouses, listSuppliers, listGroups } from '@/lib/piese';
import { requirePieseReceipt } from '@/lib/piese-access';
import PrihodClient from './PrihodClient';

export default async function PrihodPage() {
  await requirePieseReceipt();
  const [warehouses, suppliers, groups] = await Promise.all([listWarehouses(), listSuppliers(), listGroups()]);
  return (
    <>
      <div className="page-header"><h1>Prihod — recepție marfă</h1><p>Fiecare poziție intră ca strat FIFO. Stocul crește automat.</p></div>
      <PrihodClient
        warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name }))}
        suppliers={(suppliers as any[]).map((s) => ({ id: s.id, label: s.name }))}
        groups={(groups as any[]).map((g) => ({ id: g.id, label: g.name_ro }))}
      />
    </>
  );
}
