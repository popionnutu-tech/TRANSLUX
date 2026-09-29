export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getListaHarta, getSaptamaniHarta, getZiHarta } from './actions';
import HartaClient from './HartaClient';
import { masiniSaptamana, UZINE_HARTA, uzHarta, type LinieSchelet, type Punct } from '@/lib/lde/drax-harta';

// Harta fiecărei mașini pe zi, peste scheletul liniilor ei (ION-130, Drăxlmaier). Ion, 28.09.2026: «ar fi bine să putem fiecare mașină
// s-o vizualizăm pe schelet, să fie o pagină separată în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă».
// ION-143 (29.09): și LEAR Ungheni / LEAR Florești, cu locurile optime de parcare (?uz=ungheni|floresti; fără uz = Drăxlmaier).
// Alegerea (uzina, săptămâna, mașina, ziua) stă în adresă: /lde/harta?uz=ungheni&sapt=2026-09-21&m=827MUM&z=2026-09-21.
type ScheletDrax = {
  porti: { c: Punct; n: string }[]; parc: Punct;
  rute: { id: string; linii: { nr: string; capat: string | null; tur: { plin: Punct[] }; sate: { n: string; c: Punct }[] }[] }[];
};
type ScheletLear = { rute: { id: string; capat: string; g?: { tur?: { plin?: Punct[]; sate?: { n: string; c: Punct }[] } } }[] };
const PARC_BALTI: Punct = [47.770, 27.9235];

export default async function LdeHartaPage({ searchParams }: { searchParams: Promise<{ uz?: string; sapt?: string; m?: string; z?: string }> }) {
  const q = await searchParams;
  const uz = uzHarta(q.uz), U = UZINE_HARTA[uz];
  const saptamani = await getSaptamaniHarta(uz);
  const sapt = saptamani.includes(q.sapt ?? '') ? q.sapt! : saptamani[0];
  if (!sapt) return <p style={{ padding: 16 }}>Nu există încă nicio hartă scrisă pentru {U.nume} (lanțul săptămânal, pasul «harta»).</p>;

  const lista = await getListaHarta(uz, sapt);
  const masini = masiniSaptamana(lista);
  const masina = masini.find((x) => x.m === q.m) ?? masini[0];
  const z = masina.zile.includes(q.z ?? '') ? q.z! : masina.zile[0];
  const zi = await getZiHarta(uz, sapt, masina.m, z);

  const liniiMasina = new Set(masina.linii);
  let linii: LinieSchelet[], porti: { c: Punct; n: string }[];
  if (U.lear) {
    // LEAR: rutele mașinii (A12, B10 …) din scheletul fix al uzinei; turul plin sub urmă
    const s = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', U.schelet), 'utf8')) as ScheletLear;
    linii = s.rute.filter((r) => liniiMasina.has(r.id)).map((r) => ({ id: r.id, capat: r.capat, plin: r.g?.tur?.plin ?? [], sate: r.g?.tur?.sate ?? [] }));
    porti = [{ c: U.poarta, n: `poarta ${U.nume}` }, { c: PARC_BALTI, n: 'Parcul Bălți' }];
  } else {
    const s = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', 'schelet-drax.json'), 'utf8')) as ScheletDrax;
    linii = s.rute.flatMap((r) => r.linii.filter((l) => liniiMasina.has(`${r.id}|${l.nr}`))
      .map((l) => ({ id: `${r.id}|${l.nr}`, capat: l.capat ?? l.nr, plin: l.tur.plin, sate: l.sate })));
    porti = [...s.porti, { c: s.parc, n: 'Parcul Bălți' }];
  }

  return (
    <HartaClient
      uz={uz} saptamani={saptamani} sapt={sapt} masini={masini} masina={masina.m} z={z} zi={zi}
      zileMasina={lista.filter((r) => r.m === masina.m)} linii={linii} porti={porti}
    />
  );
}
