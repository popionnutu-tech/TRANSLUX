export const dynamic = 'force-dynamic';

import { listWarehouses, listSuppliers } from '@/lib/piese';
import { requirePieseReceipt } from '@/lib/piese-access';
import PrihodClient from './PrihodClient';

export default async function PrihodPage() {
  await requirePieseReceipt();
  const [warehouses, suppliers] = await Promise.all([listWarehouses(), listSuppliers()]);
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
