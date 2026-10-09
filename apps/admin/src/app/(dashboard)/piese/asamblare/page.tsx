export const dynamic = 'force-dynamic';

import { listWarehouses, listMechanics } from '@/lib/piese';
import { warehousesForUser, userWarehouseId } from '@/lib/piese-access';
import { verifySession, requireRole } from '@/lib/auth';
import AsamblareClient from './AsamblareClient';


export default async function AsamblarePage() {
  // Aceleași roluri ca la Donor: operația creează marfă în stoc.
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'GESTIONAR');
  const [warehouses, mechanics] = await Promise.all([listWarehouses(), listMechanics()]);
  const permise = warehousesForUser(warehouses as any[], await userWarehouseId(session));

  return (
    <>
      <div className="page-header">
        <h1>Asamblare — din mai multe piese iese una</h1>
        <p>
          Reparația ține cât ține: deschizi documentul, adaugi piesele pe măsură ce le pui, îl închizi
          când ai terminat. Piesele ies din depozit chiar când le adaugi; produsul apare abia la final,
          cu costul lor plus manopera. De acolo se montează pe autobuz, prin Rashod.
        </p>
      </div>

      <AsamblareClient
        warehouses={permise.map((w: any) => ({ id: w.id, label: w.name }))}
        mechanics={(mechanics as any[]).map((m) => ({ id: m.id, label: m.name }))}
      />

    </>
  );
}
