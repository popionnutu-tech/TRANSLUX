export const dynamic = 'force-dynamic';

import { listWarehouses } from '@/lib/piese';
import { requirePieseInventory, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import InventarClient from './InventarClient';

export default async function InventarPage() {
  const session = await requirePieseInventory();
  const warehouses = await listWarehouses();
  // Etapa 2: contul legat de un depozit inventariază doar depozitul lui. Garda reală e pe server (loadSheet/saveInventory).
  const allowed = warehousesForUser(warehouses as any[], await userWarehouseId(session));
  return (
    <>
      <div className="page-header"><h1>Inventariere</h1><p>Numeri faptic, programul arată diferențele. Alegi secția de azi → harta o evidențiază + foaia se concentrează pe ea. Corecțiile intră ca mișcări, fără ștergeri.</p></div>
      <InventarClient warehouses={allowed.map((w) => ({ id: w.id, label: w.name }))} />
    </>
  );
}
