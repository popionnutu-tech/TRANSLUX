export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getListaHarta, getSaptamaniHarta, getZiHarta } from './actions';
import HartaClient from './HartaClient';
import { masiniSaptamana, type LinieSchelet, type Punct } from '@/lib/lde/drax-harta';

// Harta fiecărei mașini Drăxlmaier pe zi, peste scheletul liniilor ei (ION-130). Ion, 28.09.2026: «ar fi bine să putem fiecare mașină
// s-o vizualizăm pe schelet, să fie o pagină separată în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă».
// Alegerea (săptămâna, mașina, ziua) stă în adresă: /lde/harta?sapt=2026-09-14&m=446ASB&z=2026-09-14 — se poate trimite ca link.
type ScheletFisier = {
  porti: { c: Punct; n: string }[]; parc: Punct;
  rute: { id: string; linii: { nr: string; capat: string | null; tur: { plin: Punct[] }; sate: { n: string; c: Punct }[] }[] }[];
};

export default async function LdeHartaPage({ searchParams }: { searchParams: Promise<{ sapt?: string; m?: string; z?: string }> }) {
  const q = await searchParams;
  const saptamani = await getSaptamaniHarta();
  const sapt = saptamani.includes(q.sapt ?? '') ? q.sapt! : saptamani[0];
  if (!sapt) return <p style={{ padding: 16 }}>Nu există încă nicio hartă scrisă (lanțul săptămânal Drăxlmaier, pasul «harta»).</p>;

  const lista = await getListaHarta(sapt);
  const masini = masiniSaptamana(lista);
  const masina = masini.find((x) => x.m === q.m) ?? masini[0];
  const z = masina.zile.includes(q.z ?? '') ? q.z! : masina.zile[0];
  const zi = await getZiHarta(sapt, masina.m, z);

  const schelet = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', 'schelet-drax.json'), 'utf8')) as ScheletFisier;
  const liniiMasina = new Set(masina.linii);
  const linii: LinieSchelet[] = schelet.rute.flatMap((r) => r.linii.filter((l) => liniiMasina.has(`${r.id}|${l.nr}`))
    .map((l) => ({ id: `${r.id}|${l.nr}`, capat: l.capat ?? l.nr, plin: l.tur.plin, sate: l.sate })));

  return (
    <HartaClient
      saptamani={saptamani} sapt={sapt} masini={masini} masina={masina.m} z={z} zi={zi}
      zileMasina={lista.filter((r) => r.m === masina.m)} linii={linii}
      porti={[...schelet.porti, { c: schelet.parc, n: 'Parcul Bălți' }]}
    />
  );
}
