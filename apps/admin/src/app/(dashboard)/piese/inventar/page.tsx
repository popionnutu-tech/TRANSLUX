export const dynamic = 'force-dynamic';

import { listWarehouses } from '@/lib/piese';
import { requirePieseInventory } from '@/lib/piese-access';
import InventarClient from './InventarClient';

export default async function InventarPage() {
  await requirePieseInventory();
  const warehouses = await listWarehouses();
  return (
    <>
      <div className="page-header"><h1>Inventariere</h1><p>Numeri faptic, programul arată diferențele. Alegi secția de azi → harta o evidențiază + foaia se concentrează pe ea. Corecțiile intră ca mișcări, fără ștergeri.</p></div>
      <InventarClient warehouses={(warehouses as any[]).map((w) => ({ id: w.id, label: w.name }))} />
    </>
  );
}
