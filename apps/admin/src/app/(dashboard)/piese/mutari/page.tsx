export const dynamic = 'force-dynamic';

import { listWarehouses, listVehicles, listMechanics } from '@/lib/piese';
import { transfersTransit } from '@/lib/piese-ops';
import { requirePieseIssue, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import MutariClient from './MutariClient';

export default async function MutariPage() {
  const session = await requirePieseIssue();
  const [warehouses, transit, vehicles, mechanics] = await Promise.all([
    listWarehouses(), transfersTransit(), listVehicles(), listMechanics(),
  ]);
  // Etapa 2: sursa e restrânsă la depozitul contului legat (poate scoate DOAR din depozitul lui); destinația rămâne oricare.
  const wid = await userWarehouseId(session);
  const fromWarehouses = warehousesForUser(warehouses as any[], wid);
  return (
    <>
      <div className="page-header"><h1>Mutări între depozite</h1><p>Piesa iese din stoc doar când o trimite depozitarul-sursă. Cât e între depozite, e „pe drum".</p></div>
      <MutariClient
        warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name, kind: w.kind }))}
        fromWarehouses={fromWarehouses.map((w) => ({ id: w.id, label: w.name }))}
        transit={(transit as any[]).map((t) => ({ id: t.id, from_name: t.from_name, to_name: t.to_name, line_count: t.line_count }))}
        vehicles={(vehicles as any[]).map((v) => ({ id: v.id, label: v.plate }))}
        mechanics={(mechanics as any[]).map((m) => ({ id: m.id, label: m.name }))}
      />
    </>
  );
}
