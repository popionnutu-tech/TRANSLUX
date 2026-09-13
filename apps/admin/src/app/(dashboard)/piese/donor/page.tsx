export const dynamic = 'force-dynamic';

import { listWarehouses, listVehicles, usedPartsCount } from '@/lib/piese';
import { requirePieseReceipt, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import DonorClient from './DonorClient';

export default async function DonorPage() {
  const session = await requirePieseReceipt();
  const [warehouses, vehicles, nrUzate] = await Promise.all([listWarehouses(), listVehicles(), usedPartsCount()]);
  // Etapa 2: marfa intră DOAR în depozitul contului legat. Garda reală e pe server.
  const allowed = warehousesForUser(warehouses as any[], await userWarehouseId(session));
  return (
    <>
      <div className="page-header">
        <h1>Donor — piese б/у</h1>
        <p>Piesele scoase de pe o mașină casată intră pe raft cu o valoare. Se pot vinde ca orice altă marfă, după ce ajung în magazin.</p>
      </div>
      <DonorClient
        nrUzate={nrUzate}
        warehouses={allowed.map((w) => ({ id: w.id, label: w.name }))}
        vehicles={(vehicles as any[]).map((v) => ({ id: v.id, label: `${v.plate} · ${v.model ?? ''}`.trim() }))}
      />
    </>
  );
}
