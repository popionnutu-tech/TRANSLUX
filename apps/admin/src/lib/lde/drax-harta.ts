// Harta unei mașini Drăxlmaier pe o zi (ION-130). Ion, 28.09.2026: «ar fi bine să putem fiecare mașină s-o vizualizăm pe schelet,
// să fie o pagină separată în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă».
// Rândul îl scrie VPS-ul (drax/cod/saptamanal/harta-zi.mjs) în lde_harta_zi; aici doar tipurile și funcțiile pure ale paginii.
import type { ZiDrax } from './drax-analiza';
import type { DrumPropus, LocParcare, ZiParcare } from './drax-parcare';

export type Punct = [number, number];
/** tipul intervalului: cursă cu oameni, gol, muncă (între uzine / deplasare / service), la uzină (parc, gol între ture);
 * ION-150 (cisterne): plin (cu marfă), la punct (încărcare / descărcare / bază / vamă), parcare (≥ 60 min în afara punctelor) */
export type TipInterval = 'cursa' | 'gol' | 'munca' | 'uzina' | 'plin' | 'punct' | 'parcare';

export interface IntervalHarta {
  ora: string; t0: number; t1: number; tip: TipInterval; cats: Record<string, number>; km: number;
  de: string | null; pana: string | null; ocol: boolean; lin: string | null; prelungit: string | null;
  /** urma simplificată: [lat, lon, secunde de la începutul zilei] */
  s: [number, number, number][];
  /** ION-150 (cisterne): ce face mașina (text), judecata staționării (casa / drum / abatere / lunga / pauza / terminal / zel / semnal),
   * locul propus informativ pentru o odihnă departe de drumul ideal, durata staționării întregi */
  nota?: string | null; fel?: string | null; abatere?: boolean; propus?: { n: string; c: Punct } | null; durataMin?: number | null;
}
export interface LocHarta { c: Punct; n: string; min?: number }
export interface ZiHarta {
  t00: number; casa: LocHarta | null; noapteA: LocHarta | null; noapteB: LocHarta | null; linii: string[];
  iv: IntervalHarta[];
  /** opririle ≥ 5 min: [lat, lon, de la (s), până la (s), locul] */
  stai: [number, number, number, number, string][];
  zi: ZiDrax | null;
  ideal: { economie: number; cauze: Record<string, number> } | null;
  /** ION-136: parcarea propusă a mașinii și drumurile propuse ale zilei */
  parcare?: { locuri: (LocParcare & { ore?: number; nota?: string })[]; economieSapt: number; idealSapt: number | null; zi: ZiParcare | null; legi: DrumPropus[]; informativ?: boolean } | null;
  /** ION-150 (cisterne): drumurile care ating ziua, față de schelet, și verificarea zilnică ION-144 a lor */
  drumuri?: DrumCamion[];
  verif?: VerifCamion[];
}
/** ION-150: un drum al cisternei (plin: încărcare → prima descărcare; gol: ultima descărcare → încărcarea următoare) */
export interface DrumCamion {
  tip: 'plin' | 'gol'; marfa: string | null; de: string | null; pana: string | null; inceput: string; sfarsit: string; km: number;
  ideal: number | null; plus: number | null; vama: string | null; lin: string | null; nota: string | null;
  verif: { zi: string; ok: boolean; kmPlus: number } | null;
}
/** ION-150: un rând lde_truck_route_checks (ION-144) al unui drum care atinge ziua */
export interface VerifCamion {
  cheie: string; zi: string; tip: string; de: string | null; pana: string | null; inceput: string; sfarsit: string; vama: string | null; vama_ideala: string | null;
  km_gps: number; km_ideal: number | null; km_plus: number; ok: boolean;
  abateri: { cod: string; text: string; km?: number | null; ideal?: string; real?: string }[];
}
export interface SumarZiHarta {
  dow: number; total: number; cuOameni: number; gol: number;
  /** economia zilei față de ziua ideală; null când ziua nu intră în calcul (weekend, în afara eșantionului, Bălți/pauză) */
  economie: number | null; ideal: number | null; linii: string[];
  /** de ce ziua nu intră în calcul */
  motivAfara?: string | null;
  /** cifra mașinii din raport (din ION-136: parcarea propusă, km pe săptămână, adusă la 5 zile) — aceeași pe toate zilele ei */
  economieSapt?: number | null;
  /** ION-136: locurile de parcare propuse */
  locuri?: string[];
  /** de unde vine economia din listă: parcarea propusă (din 29.09) sau ziua ideală (rândurile vechi) */
  sursaEconomie?: 'parcare' | 'ideal';
  /** ION-150 (cisterne): km cu marfă, km peste ideal ai drumurilor judecate în ziua asta de verificarea zilnică (ION-144), câte cu abateri */
  plin?: number; kmPlus?: number; nrAbateri?: number; opririAbatere?: number;
}
export interface RandListaHarta { m: string; z: string; sumar: SumarZiHarta }

/** linia din schelet sub urma mașinii */
export interface LinieSchelet { id: string; capat: string | null; plin: Punct[]; sate: { n: string; c: Punct }[] }

export const CULOARE: Record<TipInterval, string> = {
  cursa: '#1D6B6B', gol: '#B3261E', munca: '#2F5DA8', uzina: '#8A7F72', plin: '#1D6B6B', punct: '#2F5DA8', parcare: '#8A7F72',
};
export const LINIE: Record<TipInterval, string | undefined> = { cursa: undefined, gol: '8 6', munca: '2 6', uzina: '4 5', plin: undefined, punct: '2 6', parcare: '4 5' };
export const NUME_TIP: Record<TipInterval, string> = {
  cursa: 'cu oameni', gol: 'gol', munca: 'între uzine / service', uzina: 'lângă uzină', plin: 'cu marfă', punct: 'la punct (încarcă / descarcă / bază / vamă)', parcare: 'stă (≥ 1 h)',
};

const FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
/** ora locală (Chișinău) a unui moment dat în secunde de la începutul zilei */
export const oraLocala = (t00: number, sec: number) => FMT.format(new Date(t00 + sec * 1000));

export const durata = (sec: number) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
export const eticZi = (z: string) => { const d = new Date(`${z}T12:00:00Z`); return `${ZILE[d.getUTCDay()]} ${z.slice(8, 10)}.${z.slice(5, 7)}`; };

/** mașinile săptămânii, cu km-ii de tăiat pe săptămână (cifra din raport), cele mai mari întâi */
export function masiniSaptamana(rows: RandListaHarta[]) {
  const m = new Map<string, { m: string; zile: string[]; economie: number; total: number; linii: Set<string>; sapt: number | null }>();
  for (const r of rows) {
    const x = m.get(r.m) ?? { m: r.m, zile: [], economie: 0, total: 0, linii: new Set<string>(), sapt: null };
    if (r.sumar.economieSapt != null) x.sapt = r.sumar.economieSapt;
    x.zile.push(r.z); x.economie += r.sumar.economie ?? 0; x.total += r.sumar.total;
    for (const l of r.sumar.linii) x.linii.add(l);
    m.set(r.m, x);
  }
  // cifra din raport când există (rândurile de după 29.09); altfel suma zilelor măsurate
  return [...m.values()].map(({ sapt, ...x }) => ({ ...x, zile: x.zile.sort(), zileMasurate: Math.round(x.economie * 10) / 10, economie: Math.round((sapt ?? x.economie) * 10) / 10, total: Math.round(x.total), linii: [...x.linii] }))
    .sort((a, b) => b.economie - a.economie || a.m.localeCompare(b.m));
}

/** cadrul hărții: urma zilei (fără ea, liniile din schelet) */
export function cadru(zi: ZiHarta, linii: LinieSchelet[]): [Punct, Punct] | null {
  const pts: Punct[] = zi.iv.flatMap((v) => v.s.map((p) => [p[0], p[1]] as Punct));
  // ION-136: locurile de parcare propuse rămân în cadru; ION-150: la cisterne locurile săptămânii (informative) nu lărgesc ziua
  if (!zi.parcare?.informativ) for (const l of zi.parcare?.locuri ?? []) pts.push(l.c);
  if (pts.length < 2) for (const l of linii) pts.push(...l.plin);
  // ION-150: mașina care stă toată ziua are un singur punct — cadru mic în jurul lui
  if (pts.length === 1 && zi.parcare?.informativ) { const [a, b] = pts[0]; return [[a - 0.03, b - 0.04], [a + 0.03, b + 0.04]]; }
  if (pts.length < 2) return null;
  const la = pts.map((p) => p[0]), lo = pts.map((p) => p[1]);
  return [[Math.min(...la), Math.min(...lo)], [Math.max(...la), Math.max(...lo)]];
}

// ─── ION-143 (Ion, 29.09.2026: «aplică pe pagina hartă și LEAR cu punctele optimale»): harta are și LEAR Ungheni / LEAR Florești ───
/** uzinele cu hartă: cheia din adresă (?uz=) → uzina din lde_harta_zi, numele, scheletul din public/lde și poarta */
export const UZINE_HARTA = {
  drax: { id: 'DRAXELMAIER', nume: 'Drăxlmaier Bălți', lear: false },
  ungheni: { id: 'LEAR_UNGHENI', nume: 'LEAR Ungheni', lear: true, schelet: 'schelet.json', poarta: [47.2230, 27.8016] as Punct },
  floresti: { id: 'LEAR_FLORESTI', nume: 'LEAR Florești', lear: true, schelet: 'schelet-floresti.json', poarta: [47.89645, 28.29982] as Punct },
  // ION-150 (Ion, 30.09.2026: «drumul față de schelet, P1/P2 doar informativ»): rândurile le scrie VPS camioane-parcare/harta.mjs
  camioane: { id: 'CAMIOANE', nume: 'Camioane (cisterne)', lear: false, schelet: 'schelet-camioane.json' },
} as const;
export type UzHarta = keyof typeof UZINE_HARTA;
/** cheia din adresă; orice altceva = Drăxlmaier (adresele vechi, fără ?uz=, rămân valabile) */
export const uzHarta = (x?: string | null): UzHarta => (x === 'ungheni' || x === 'floresti' || x === 'camioane' ? x : 'drax');
/** tipurile din legenda hărții: cisternele au plin / gol / la punct / stă, uzinele cursă / gol / muncă / uzină */
export const tipuriLegenda = (uz: UzHarta): TipInterval[] => (uz === 'camioane' ? ['plin', 'gol', 'punct', 'parcare'] : ['cursa', 'gol', 'munca', 'uzina']);

/** un rând din «Ziua făcută, drum cu drum» pe hartă */
export interface RandZi { ora: string; tip: TipInterval; text: string; tare: boolean }
const TEXT_TIP: Record<TipInterval, string> = {
  cursa: 'cu oameni', gol: 'gol', munca: 'parcul Bălți (reparație)', uzina: 'așteaptă la poartă', plin: 'cu marfă', punct: 'la punct', parcare: 'stă',
};
/** ziua LEAR n-are povestea Drăxlmaier (drax-ziua.ts): rândurile se fac din intervalele hărții — ora, drumul, km și ce fel de drum */
export function randuriDinIntervale(iv: IntervalHarta[]): RandZi[] {
  return iv.map((v) => {
    const km = `${(Math.round(v.km * 10) / 10).toLocaleString('ro-RO')} km`;
    const drum = v.tip === 'uzina' ? '' : v.de === v.pana ? `pe la ${v.de ?? '—'}, ` : `${v.de ?? '—'} → ${v.pana ?? '—'}, `;
    return { ora: v.ora, tip: v.tip, text: `${drum}${km} ${TEXT_TIP[v.tip]}`, tare: v.tip === 'gol' && v.km >= 20 };
  });
}

// ─── ION-150 (Ion, 30.09.2026: «drumul față de schelet, P1/P2 doar informativ»): harta cisternelor ───
/** judecata unei staționări a cisternei, în cuvinte scurte (legenda locurilor P1/P2 și rândurile zilei) */
export const FEL_STATIONARE: Record<string, string> = {
  casa: 'acasă', drum: 'odihnă pe drum — bună', abatere: 'departe de drumul ideal — abatere', lunga: 'staționare ≥ 24 h — rămâne',
  pauza: 'pauză', terminal: 'la terminal (îl impune încărcătura)', zel: 'la ZEL Ungheni (acte)', semnal: 'fără semnal', faraIdeal: 'drumul n-are ideal în schelet',
};

/** rândurile «Ziua făcută, drum cu drum» ale cisternei: drumul cu km și ce face, staționarea cu locul, cât stă și judecata ei */
export function randuriCamioane(iv: IntervalHarta[]): RandZi[] {
  return iv.map((v) => {
    const km = `${(Math.round(v.km * 10) / 10).toLocaleString('ro-RO')} km`;
    if (v.tip === 'punct' || v.tip === 'parcare') {
      const cat = v.t1 - v.t0 >= 60 ? durata(v.t1 - v.t0) : '';
      const tot = v.durataMin != null && v.durataMin * 60 > v.t1 - v.t0 + 90 ? ` (în total ${durata(v.durataMin * 60)})` : '';
      return { ora: v.ora, tip: v.tip, text: `${v.de ?? '—'}${cat ? `, ${cat}${tot}` : ''} — ${v.nota ?? TEXT_TIP[v.tip]}`, tare: !!v.abatere };
    }
    const drum = v.de === v.pana ? `pe la ${v.de ?? '—'}` : `${v.de ?? '—'} → ${v.pana ?? '—'}`;
    return { ora: v.ora, tip: v.tip, text: `${drum}, ${km}${v.nota ? ` · ${v.nota}` : ''}`, tare: false };
  });
}

/** cisternele săptămânii: km, km peste ideal (verificarea zilnică ION-144), cele cu mai mulți km peste ideal întâi, apoi cele mai rulate */
export function masiniCamioane(rows: RandListaHarta[]) {
  const plus = new Map<string, { kmPlus: number; abateri: number; plin: number }>();
  for (const r of rows) {
    const x = plus.get(r.m) ?? { kmPlus: 0, abateri: 0, plin: 0 };
    x.kmPlus += r.sumar.kmPlus ?? 0; x.abateri += r.sumar.nrAbateri ?? 0; x.plin += r.sumar.plin ?? 0;
    plus.set(r.m, x);
  }
  return masiniSaptamana(rows).map((x) => {
    const p = plus.get(x.m)!;
    return { ...x, kmPlus: Math.round(p.kmPlus), nrAbateri: p.abateri, plin: Math.round(p.plin) };
  }).sort((a, b) => b.kmPlus - a.kmPlus || b.total - a.total || a.m.localeCompare(b.m));
}

/** scheletul cisternelor (public/lde/schelet-camioane.json), doar cât citește harta */
export interface ScheletCamioaneHarta {
  puncte: { n: string; c: Punct }[];
  motorina: { id: string; variante: { id: string; nume: string; km: number; linie: Punct[] }[] }[];
  biodiesel: { id: string; nume: string; variante: { id: string; nume: string; km: number; linie: Punct[] }[] }[];
}
/** liniile ideale ale zilei: cheile «m|<origine → destinație>|<variantă>» și «b|<cod>|<variantă>» scrise de harta.mjs */
export function liniiCamioane(s: ScheletCamioaneHarta, chei: string[]): LinieSchelet[] {
  const out: LinieSchelet[] = [];
  for (const k of chei) {
    const [fel, id, varId] = k.split('|');
    const bio = fel === 'b' ? s.biodiesel.find((x) => x.id === id) : undefined;
    const r = fel === 'm' ? s.motorina.find((x) => x.id === id) : bio;
    const v = r?.variante.find((x) => x.id === varId);
    if (!r || !v) continue;
    out.push({ id: `${bio ? `${id} ${bio.nume}` : id} · ${v.nume} · ${Math.round(v.km)} km`, capat: null, plin: v.linie, sate: [] });
  }
  return out;
}
