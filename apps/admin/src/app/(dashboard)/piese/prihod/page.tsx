export const dynamic = 'force-dynamic';

import { listWarehouses, listSuppliers, listGroups } from '@/lib/piese';
import { requirePieseReceipt, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import PrihodClient from './PrihodClient';

export default async function PrihodPage() {
  const session = await requirePieseReceipt();
  const [warehouses, suppliers, groups] = await Promise.all([listWarehouses(), listSuppliers(), listGroups()]);
  // Etapa 2: contul legat de un depozit vede doar depozitul lui în dropdown (garda reală e pe server, în submitReceipt).
  const allowed = warehousesForUser(warehouses as any[], await userWarehouseId(session));
  return (
    <>
      <div className="page-header"><h1>Prihod — recepție marfă</h1><p>Fiecare poziție intră ca strat FIFO. Stocul crește automat.</p></div>
      <PrihodClient
        warehouses={allowed.map((w) => ({ id: w.id, label: w.name }))}
        suppliers={(suppliers as any[]).map((s) => ({ id: s.id, label: s.name }))}
        groups={(groups as any[]).map((g) => ({ id: g.id, label: g.name_ro }))}
      />
    </>
  );
}
