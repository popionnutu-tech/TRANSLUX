export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getControlBriceni, getControlCamioane, getListaHarta, getSaptamaniHarta, getZiHarta, type ControlCamion } from './actions';
import HartaClient from './HartaClient';
import { liniiBriceni, liniiCamioane, masiniCamioane, masiniSaptamana, UZINE_HARTA, uzHarta, type LinieSchelet, type Punct, type ScheletBriceniHarta, type ScheletCamioaneHarta } from '@/lib/lde/drax-harta';

// Harta fiecărei mașini pe zi, peste scheletul liniilor ei (ION-130, Drăxlmaier). Ion, 28.09.2026: «ar fi bine să putem fiecare mașină
// s-o vizualizăm pe schelet, să fie o pagină separată în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă».
// ION-143 (29.09): și LEAR Ungheni / LEAR Florești, cu locurile optime de parcare (?uz=ungheni|floresti; fără uz = Drăxlmaier).
// ION-147 (01.10): și SEBN Orhei + Strășeni (?uz=sebn) — parcarea P1/P2, bucla la predarea turei separat, mașinile fără parcare cu motivul.
// ION-150 (30.09): și cisternele (?uz=camioane) — urma față de linia ideală din schelet-camioane.json, P1/P2 doar informativ.
// ION-148 (01.10): și Briceni, Trox + suburban (?uz=briceni) — rutele mașinii din schelet-briceni.json, poarta Trox + autogara, P1/P2.
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
  const masini = uz === 'camioane' ? masiniCamioane(lista) : masiniSaptamana(lista);
  const masina = masini.find((x) => x.m === q.m) ?? masini[0];
  const z = masina.zile.includes(q.z ?? '') ? q.z! : masina.zile[0];
  const zi = await getZiHarta(uz, sapt, masina.m, z);

  const liniiMasina = new Set(masina.linii);
  let linii: LinieSchelet[], porti: { c: Punct; n: string }[];
  let control: ControlCamion[] = [];
  if (uz === 'camioane') {
    // cisternele: liniile ideale ale drumurilor care ating ziua (cheile scrise de harta.mjs), punctele fixe ale scheletului
    const s = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', 'schelet-camioane.json'), 'utf8')) as ScheletCamioaneHarta;
    linii = liniiCamioane(s, zi?.linii ?? []);
    porti = s.puncte;
    control = await getControlCamioane(sapt);
  } else if (uz === 'sebn') {
    // ION-147: SEBN — rutele mașinii (R3, S1 …) din scheletul fix (public/lde/schelet-sebn.json, aceeași formă ca LEAR); trei puncte de poartă
    const s = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', UZINE_HARTA.sebn.schelet), 'utf8')) as ScheletLear;
    linii = s.rute.filter((r) => liniiMasina.has(r.id)).map((r) => ({ id: r.id, capat: r.capat, plin: r.g?.tur?.plin ?? [], sate: r.g?.tur?.sate ?? [] }));
    porti = [...UZINE_HARTA.sebn.porti, { c: PARC_BALTI, n: 'Parcul Bălți' }];
    // controlul flotei: fiecare mașină e pe hartă; cele fără parcare propusă, cu motivul (sumar.motivAfara, același pe toate zilele ei)
    control = [...new Map(lista.filter((r) => r.sumar.motivAfara).map((r) => [r.m, { m: r.m, pe: true, motiv: r.sumar.motivAfara ?? null, tip: null }])).values()];
  } else if (uz === 'briceni') {
    // Briceni: rutele mașinii din săptămână (T1…T6 și suburbanele) din scheletul fix ION-70, poarta Trox și autogara alături
    const s = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'lde', 'schelet-briceni.json'), 'utf8')) as ScheletBriceniHarta;
    ({ linii, porti } = liniiBriceni(s, liniiMasina));
    control = (await getControlBriceni(sapt)).map((c) => ({ m: c.m, pe: c.pe, motiv: c.motiv, tip: null, km: c.km, zile: c.zile }));
  } else if (U.lear) {
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
      zileMasina={lista.filter((r) => r.m === masina.m)} linii={linii} porti={porti} control={control}
    />
  );
}
