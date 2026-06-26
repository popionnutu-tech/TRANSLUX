export const dynamic = 'force-dynamic';

import { requirePieseSearch } from '@/lib/piese-access';
import { listGroups } from '@/lib/piese';
import CautareClient from './CautareClient';

export default async function CautarePage() {
  const session = await requirePieseSearch();
  const showCost = session.role !== 'VINZATOR'; // vânzătorul vede doar prețul de vânzare
  const groups = await listGroups();
  const categories = (groups as any[]).map((g) => ({ id: g.id, name: g.name_ro, markup: Number(g.markup_pct) || 0 }));
  return (
    <>
      <div className="page-header">
        <h1>Căutare piesă</h1>
        <p>Pentru când clientul nu știe codul: caută după denumire, categorie, articul, OEM sau scanează codul de bare. Vezi denumirea corectă, dacă o avem în stoc și unde{showCost ? ', iar dacă nu — de la ce furnizor și la ce preț.' : ' și prețul de vânzare.'}</p>
      </div>
      <CautareClient categories={categories} showCost={showCost} />
    </>
  );
}
