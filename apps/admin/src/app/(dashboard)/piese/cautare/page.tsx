export const dynamic = 'force-dynamic';

import { requirePieseSearch, canSeeCost, userWarehouseId, warehousesForUser } from '@/lib/piese-access';
import { listGroups, listWarehouses } from '@/lib/piese';
import CautareClient from './CautareClient';

export default async function CautarePage() {
  const session = await requirePieseSearch();
  const showCost = canSeeCost(session.role); // vânzătorul vede doar prețul de vânzare
  const [groups, warehouses, wid] = await Promise.all([listGroups(), listWarehouses(), userWarehouseId(session)]);
  const categories = (groups as any[]).map((g) => ({ id: g.id, name: g.name_ro, markup: Number(g.markup_pct) || 0 }));
  // Depozitele pe care le poate filtra: contul legat vede doar depozitul lui; adminul le vede pe toate.
  const allowedWarehouses = warehousesForUser(warehouses as any[], wid).map((w: any) => ({ id: w.id, name: w.name }));
  return (
    <>
      <div className="page-header">
        <h1>Căutare piesă</h1>
        <p>Pentru când clientul nu știe codul: caută după denumire, categorie, articul, OEM sau scanează codul de bare. Vezi denumirea corectă, dacă o avem în stoc și unde{showCost ? ', iar dacă nu — de la ce furnizor și la ce preț.' : ' și prețul de vânzare.'}</p>
      </div>
      <CautareClient categories={categories} warehouses={allowedWarehouses} boundWarehouseId={wid} showCost={showCost} />
    </>
  );
}
