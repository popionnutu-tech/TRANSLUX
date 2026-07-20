export const dynamic = 'force-dynamic';

import { listWarehouses, listSuppliers, listGroups, receiptDocs } from '@/lib/piese';
import { requirePieseReceipt, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import PrihodTabs from './PrihodTabs';

export default async function PrihodPage() {
  const session = await requirePieseReceipt();
  const [warehouses, suppliers, groups, wid] = await Promise.all([
    listWarehouses(), listSuppliers(), listGroups(), userWarehouseId(session),
  ]);
  // Etapa 2: contul legat de un depozit vede doar depozitul lui (dropdown + jurnal); garda reală e pe server.
  const allowed = warehousesForUser(warehouses as any[], wid);
  const initialDocs = await receiptDocs({ warehouseId: wid != null ? wid : undefined, limit: 200 });
  return (
    <>
      <div className="page-header"><h1>Prihod — recepție marfă</h1><p>Fiecare poziție intră ca strat FIFO. Stocul crește automat.</p></div>
      <PrihodTabs
        warehouses={allowed.map((w) => ({ id: w.id, label: w.name }))}
        suppliers={(suppliers as any[]).map((s) => ({ id: s.id, label: s.name }))}
        groups={(groups as any[]).map((g) => ({ id: g.id, label: g.name_ro }))}
        initialDocs={initialDocs}
      />
    </>
  );
}
