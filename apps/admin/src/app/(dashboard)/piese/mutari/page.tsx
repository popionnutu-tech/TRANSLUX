export const dynamic = 'force-dynamic';

import { listWarehouses, listVehicles, listMechanics } from '@/lib/piese';
import { transfersTransit, transfersTransitForVehicle } from '@/lib/piese-ops';
import { requirePieseIssue, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import MutariClient from './MutariClient';

export default async function MutariPage() {
  const session = await requirePieseIssue();
  // `wid` se află ÎNAINTE: lista mutărilor pe mașină se restrânge la depozitele contului, deci are nevoie de el.
  const wid = await userWarehouseId(session);
  const [warehouses, transit, peMasina, vehicles, mechanics] = await Promise.all([
    listWarehouses(), transfersTransit(), transfersTransitForVehicle(wid), listVehicles(), listMechanics(),
  ]);
  // Etapa 2: sursa e restrânsă la depozitul contului legat (poate scoate DOAR din depozitul lui); destinația rămâne oricare.
  const fromWarehouses = warehousesForUser(warehouses as any[], wid);
  return (
    <>
      <div className="page-header"><h1>Mutări între depozite</h1><p>Piesa iese din stoc doar când o trimite depozitarul-sursă. Cât e între depozite, e „pe drum".</p></div>
      <MutariClient
        warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name, kind: w.kind }))}
        fromWarehouses={fromWarehouses.map((w) => ({ id: w.id, label: w.name }))}
        transit={(transit as any[]).map((t) => ({ id: t.id, from_name: t.from_name, to_name: t.to_name, line_count: t.line_count }))}
        peMasina={peMasina.rows}
        peMasinaTruncat={peMasina.truncated}
        peMasinaEsuat={peMasina.failed}
        vehicles={(vehicles as any[]).map((v) => ({ id: v.id, label: v.plate }))}
        mechanics={(mechanics as any[]).map((m) => ({ id: m.id, label: m.name }))}
      />
    </>
  );
}
