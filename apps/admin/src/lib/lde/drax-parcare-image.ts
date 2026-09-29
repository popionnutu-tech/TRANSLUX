import { poster, CULORI, type Celula } from '../poster-sablon';
import { getSupabase } from '../supabase';
import { canonPlaca } from './tip-masina';
import { perioadaText } from './lear-optimizari-image';
import type { MasinaParcare, ParcareDrax } from './drax-parcare';

/**
 * Posterul săptămânal Drăxlmaier «parcarea propusă» (ION-140). Ion, 29.09.2026: «la Dra dă poster în grup, cu punctul optimal
 * de dislocație, tot ce e mai jos de 100 km autobuze și 150 km rutiere să nu nimerească, dă asta în grupa livrări, include în
 * postare săptămânal 8:00 și în rând cu fiecare — loc optimal șofer».
 *
 * Datele sunt date.parcare din rândul săptămânii (ION-136, lanțul de luni de pe VPS). Pe poster intră doar autobuzele (≥ 40 de
 * locuri — DAF) cu cel puțin PRAG_AUTOBUZ km de tăiat pe săptămână și rutierele (microbuzele) cu cel puțin PRAG_RUTIERA.
 * Pleacă în albumul de luni din «Livrari Uzini» (livrari-luni.ts), după celelalte uzine.
 */
export const DRAX_PARCARE_POSTER_LAST_KEY = 'drax_parcare_poster_last';
export const PRAG_AUTOBUZ = 100, PRAG_RUTIERA = 150, LOCURI_AUTOBUZ = 40;

const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');

export interface MasinaPoster { m: string; tip: string | null; locuri: number | null; autobuz: boolean; acasa: string | null; p: MasinaParcare }

/** autobuz = ≥ 40 de locuri (DAF 50); fără locuri în bază, după numele tipului (DAF); altfel rutieră */
export function esteAutobuz(locuri: number | null, tip: string | null) {
  return locuri != null ? locuri >= LOCURI_AUTOBUZ : /\bDAF\b/i.test(tip ?? '');
}

/** mașinile care intră pe poster: au loc propus și trec pragul tipului lor; cele cu mai mulți km întâi */
export function masiniPePoster(lista: MasinaPoster[]) {
  const trece = (x: MasinaPoster) => x.p.locuri.length > 0 && x.p.economieSapt >= (x.autobuz ? PRAG_AUTOBUZ : PRAG_RUTIERA);
  const pe = lista.filter(trece).sort((a, b) => b.p.economieSapt - a.p.economieSapt || a.m.localeCompare(b.m));
  const sub = lista.filter((x) => !trece(x) && x.p.locuri.length > 0 && x.p.economieSapt >= 0.5);
  return { pe, sub };
}

/** textul locului pentru șofer: «Fălești» sau «Fălești (sau Ilenuța)» */
export const textLoc = (p: MasinaParcare) => p.locuri.length === 1 ? p.locuri[0].n : `${p.locuri[0].n} sau ${p.locuri[1].n}`;

export async function generateDraxParcareImage(o: { saptamina: string; pana_la: string; lista: MasinaPoster[] }): Promise<Buffer> {
  const { pe, sub } = masiniPePoster(o.lista);
  const total = pe.reduce((s, x) => s + x.p.economieSapt, 0), totalSub = sub.reduce((s, x) => s + x.p.economieSapt, 0);
  const p = poster({
    latime: 960,
    supratitlu: 'Drăxlmaier Bălți',
    titlu: 'Unde să stea mașina între schimburi și noaptea',
    subtitlu: 'Locul optim de parcare pentru fiecare mașină și km pe care i-ar face mai puțin pe săptămână, cu aceleași curse.',
    eticheta: perioadaText(o.saptamina, o.pana_la),
  });
  p.tabel([
    { titlu: 'Mașina', latime: 190 }, { titlu: 'Acum stă la', latime: 170 }, { titlu: 'Loc optim pentru șofer', latime: 330 },
    { titlu: 'Km de tăiat/săpt.', latime: 124, aliniere: 'end' },
  ], pe.map((x) => [
    { text: x.m, bold: true, mic: x.tip ?? (x.autobuz ? 'autobuz' : 'rutieră') },
    { text: x.acasa ?? '—', culoare: CULORI.gri },
    { text: textLoc(x.p), bold: true, culoare: CULORI.bordo, mic: x.p.locuri.length === 2 ? 'două locuri: după cursă, cel mai apropiat' : undefined },
    { text: `−${nr(x.p.economieSapt)}`, bold: true, culoare: CULORI.verde, fundal: CULORI.verdeFundal },
  ] as Celula[]), { gol: `Nicio mașină peste prag săptămâna asta (autobuze ≥ ${PRAG_AUTOBUZ} km, rutiere ≥ ${PRAG_RUTIERA} km pe săptămână).` });
  if (pe.length) p.total(`La aceste ${pe.length} mașini: −${nr(total)} km pe săptămână`, `≈ −${nr(total * 52 / 12)} km pe lună`);
  p.nota(`Pe poster doar autobuzele cu cel puțin ${PRAG_AUTOBUZ} km și rutierele cu cel puțin ${PRAG_RUTIERA} km de tăiat pe săptămână.${sub.length ? ` Celelalte ${sub.length} mașini cu propunere mai au împreună −${nr(totalSub)} km.` : ''}`);
  p.nota('Mașina merge de la capătul cursei la locul de parcare, așteaptă acolo și pleacă la cursa următoare; tur și retur la uzină rămân la uzină. Drumul șoferului spre casă nu e socotit. Detalii și harta: LDE · Harta mașinii.');
  return p.png();
}

/** posterul săptămânii, fără trimitere (pentru albumul de luni) */
export async function pregatestePosterDraxParcare(o: { saptamina: string; pana_la: string }):
  Promise<{ png: Buffer; caption: string; cheie: string } | { motiv: string }> {
  const sb = getSupabase();
  const { data: rap } = await sb.from('lde_analiza_reguli').select('date').eq('uzina', 'DRAXELMAIER').eq('saptamina', o.saptamina).maybeSingle();
  const d = rap?.date as { parcare?: ParcareDrax | null; masini?: { m: string; casa: string | null }[] } | null;
  if (!d) return { motiv: 'raportul Drăxlmaier al săptămânii nu e scris' };
  if (!d.parcare?.masini?.length) return { motiv: 'raportul Drăxlmaier n-are parcarea propusă (pasul parcare.mjs)' };
  // tipul și locurile: vehicles.passenger_seats (migr. 424), altfel tipul din normele de consum (lde_vehicle_types.passenger_seats, migr. 422)
  const [{ data: veh }, { data: norme }, { data: tipuri }] = await Promise.all([
    sb.from('vehicles').select('id,plate_number,passenger_seats').limit(1000),
    sb.from('lde_vehicle_norms').select('vehicle_id,vehicle_type_id').limit(1000),
    sb.from('lde_vehicle_types').select('id,display_name,passenger_seats').limit(1000),
  ]);
  const tipDe = new Map((tipuri ?? []).map((t) => [t.id as string, t as { display_name: string; passenger_seats: number | null }]));
  const tipVeh = new Map((norme ?? []).filter((n) => n.vehicle_type_id).map((n) => [n.vehicle_id as string, tipDe.get(n.vehicle_type_id as string)]));
  const peplaca = new Map((veh ?? []).map((v) => [canonPlaca(v.plate_number as string), { t: tipVeh.get(v.id as string) ?? null, loc: (v.passenger_seats as number | null) ?? null }]));
  const casa = new Map((d.masini ?? []).map((x) => [x.m, x.casa]));
  const lista: MasinaPoster[] = d.parcare.masini.map((p) => {
    const v = peplaca.get(canonPlaca(p.m)); const locuri = v?.loc ?? v?.t?.passenger_seats ?? null, tip = v?.t?.display_name ?? null;
    return { m: p.m, tip, locuri, autobuz: esteAutobuz(locuri, tip), acasa: casa.get(p.m) ?? null, p };
  });
  const png = await generateDraxParcareImage({ saptamina: o.saptamina, pana_la: o.pana_la, lista });
  const { pe } = masiniPePoster(lista);
  const caption = `<b>Drăxlmaier Bălți · unde să stea mașina · ${perioadaText(o.saptamina, o.pana_la)}</b>\n${pe.length
    ? `${pe.length} ${pe.length === 1 ? 'mașină' : 'mașini'}: −${nr(pe.reduce((s, x) => s + x.p.economieSapt, 0))} km pe săptămână cu parcarea propusă.`
    : 'Nicio mașină peste prag săptămâna asta.'}`;
  return { png, caption, cheie: DRAX_PARCARE_POSTER_LAST_KEY };
}
