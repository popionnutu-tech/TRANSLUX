export const dynamic = 'force-dynamic';

import { listWarehouses, listGroups, warehouseLayout } from '@/lib/piese';
import { requirePieseInventory, userWarehouseId, warehousesForUser, canEditParts } from '@/lib/piese-access';
import InventarTabs from './InventarTabs';

export default async function InventarPage() {
  const session = await requirePieseInventory();
  const [warehouses, groups] = await Promise.all([listWarehouses(), listGroups()]);
  // Etapa 2: contul legat de un depozit inventariază doar depozitul lui. Garda reală e pe server (loadSheet/saveInventory/saveInitialInventory).
  const allowed = warehousesForUser(warehouses as any[], await userWarehouseId(session));
  const opts = allowed.map((w) => ({ id: w.id, label: w.name }));
  // „Inventar inițial" (pornire depozit + scriere locații) doar pentru rolurile care scriu locații (ADMIN/DEPOZITAR/GESTIONAR).
  const canInitial = canEditParts(session.role);
  // Harta inițială (a primului depozit permis) — doar dacă rolul poate porni inventarul; altfel nu e nevoie.
  const initialLayout = canInitial && opts[0] ? await warehouseLayout(opts[0].id) : null;
  return (
    <>
      <div className="page-header"><h1>Inventariere</h1><p>Numeri faptic, programul arată diferențele. Alegi secția de azi → harta o evidențiază + foaia se concentrează pe ea. Corecțiile intră ca mișcări, fără ștergeri.</p></div>
      <InventarTabs
        warehouses={opts}
        groups={(groups as any[]).map((g) => ({ id: g.id, label: g.name_ro }))}
        canInitial={canInitial}
        initialLayout={initialLayout}
      />
    </>
  );
}
