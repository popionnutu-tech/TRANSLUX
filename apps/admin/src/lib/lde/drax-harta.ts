// Harta unei mașini Drăxlmaier pe o zi (ION-130). Ion, 28.09.2026: «ar fi bine să putem fiecare mașină s-o vizualizăm pe schelet,
// să fie o pagină separată în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă».
// Rândul îl scrie VPS-ul (drax/cod/saptamanal/harta-zi.mjs) în lde_harta_zi; aici doar tipurile și funcțiile pure ale paginii.
import type { ZiDrax } from './drax-analiza';
import type { DrumPropus, LocParcare, ZiParcare } from './drax-parcare';

export type Punct = [number, number];
/** tipul intervalului: cursă cu oameni, gol, muncă (între uzine / deplasare / service), la uzină (parc, gol între ture);
 * ION-150 (cisterne): plin (cu marfă), la punct (încărcare / descărcare / bază / vamă), parcare (≥ 60 min în afara punctelor);
 * ION-147 (SEBN): bucla la predarea turei (poartă → Slobozia Doamnei → Bucuria), fără km de tăiat
 * ION-148 (Briceni): gol forțat — gol pe rută, gol între ture, legătură (Ion, 01.10: «o singură culoare, separată de livrare»)
 * ION-149 (mejgorod): liber = ocolul din pauza de prânz, arătat separat ca «timp liber», nu parcare (Ion, 01.10.2026) */
export type TipInterval = 'cursa' | 'gol' | 'munca' | 'uzina' | 'plin' | 'punct' | 'parcare' | 'bucla' | 'fortat' | 'liber';

export interface IntervalHarta {
  ora: string; t0: number; t1: number; tip: TipInterval; cats: Record<string, number>; km: number;
  de: string | null; pana: string | null; ocol: boolean; lin: string | null; prelungit: string | null;
  /** urma simplificată: [lat, lon, secunde de la începutul zilei] */
  s: [number, number, number][];
  /** ION-150 (cisterne): ce face mașina (text), judecata staționării (casa / drum / abatere / lunga / pauza / terminal / zel / semnal),
   * locul propus informativ pentru o odihnă departe de drumul ideal, durata staționării întregi */
  nota?: string | null; fel?: string | null; abatere?: boolean; propus?: { n: string; c: Punct } | null; durataMin?: number | null;
  /** ION-268 (LEAR, «schelet întâi»): rolul cursei din planul zilei, în cuvinte — «Tur s1 · B6 Zăzulenii Noi», «… — neconfirmată (…)»,
   * «Cursă în plus · A9 … — de confirmat», «Posibil cursă schimbul 3 · A8 … — de confirmat» */
  eticheta?: string | null;
  /** ION-268 (TUR = RETUR, T.1–T.3): cursa făcută arată în `km` km din schelet ai rutei (aceiași la tur și la retur); km GPS ai bucății, informativ */
  kmGps?: number | null;
}
/** ION-268: un slot din planul zilei (s1/s2 × tur/retur; ruta = ruta din schelet confirmată de GPS — Ion, 06.10: «scheletul e universal indiferent de mașină») */
export interface CursaPlan {
  sens: 'tur' | 'retur'; schimb: number; tura?: string | null; ruta: string | null; capat: string | null;
  statut: 'facuta' | 'neconfirmata' | 'lipsa'; t0: number | null; t1: number | null; km: number | null; kmSchelet: number | null; urcari: number; motiv: string | null;
  /** făcută fără urcări ≥ 10 s, dar urma acoperă drumul rutei din schelet (acoperire în %) */
  peDrum?: boolean; acoperire?: number;
  /** km GPS ai cursei, informativ (`km` = km din schelet la cursa făcută) */
  kmGps?: number | null;
  /** urma arată altă rută decât a schimbului (cursa rămâne neconfirmată pe ruta schimbului — TUR = RETUR strict) */
  rutaUrma?: string | null;
  /** schimb de rută cu altă mașină, confirmat după oră (oglinda la ±20 min, aceeași zi, schimb și sens): cursa e făcută pe ruta efectivă */
  schimbCu?: string | null;
}
/** ION-268: rezumatul planului unei zile (câte curse din plan, cum s-au făcut) */
export interface PlanZiSumar { planificate: number; facute: number; neconfirmate: number; lipsa: number; plus: number; s3?: number }
export interface LocHarta { c: Punct; n: string; min?: number }
export interface ZiHarta {
  t00: number; casa: LocHarta | null; noapteA: LocHarta | null; noapteB: LocHarta | null; linii: string[];
  iv: IntervalHarta[];
  /** opririle ≥ 5 min: [lat, lon, de la (s), până la (s), locul] */
  stai: [number, number, number, number, string][];
  zi: ZiDrax | null;
  ideal: { economie: number; cauze: Record<string, number> } | null;
  /** ION-136: parcarea propusă a mașinii și drumurile propuse ale zilei */
  parcare?: { locuri: (LocParcare & { ore?: number; nota?: string })[]; economieSapt: number; idealSapt: number | null; zi: ZiParcare | null; legi: DrumPropus[]; informativ?: boolean;
    /** ION-148 (Briceni): de ce mașina n-are parcare propusă */
    motivFara?: string | null } | null;
  /** ION-150 (cisterne): drumurile care ating ziua, față de schelet, și verificarea zilnică ION-144 a lor */
  drumuri?: DrumCamion[];
  verif?: VerifCamion[];
  /** ION-149 (mejgorod): timpul liber de la prânz (separat), cifra după regula din 25.09 (informativ), de ce mașina n-are loc propus */
  mejgorod?: InfoMejgorod;
  /** ION-268 (LEAR, «schelet întâi»): planul zilei din schelet și cursele în plus (≥ 3 urcări pe o rută din schelet, de confirmat) */
  plan?: { z: string; faraPoarta: boolean; curse: CursaPlan[]; plus: { ruta: string; sens: string | null; t0: number; t1: number; km: number; urcari: number; sate: string[]; s3?: boolean }[] } | null;
}
/** ION-149: ce arată harta mejgorod în plus pe zi */
export interface InfoMejgorod {
  liberSapt: number;
  liber: { z: string; ora: string; de: string; km: number; departe: number }[];
  regula2509: { sapt: number; zi: number; zile: number; laCapat: number; cazB: number };
  nopti: number; motivFara: string | null;
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
  /** ION-147 (SEBN): km în bucla la predarea turei, rutele luate din GPS (nu din schelet), poarta mașinii (Orhei / Strășeni) */
  bucla?: number; ruteGps?: boolean; poarta?: string | null;
  /** ION-148 (Briceni): km gol forțat (gol pe rută, între ture, legătură) și livrarea zilei din raportul BRICENI */
  fortat?: number; livrare?: number;
  /** ION-149 (mejgorod): km de timp liber la prânz (zi / săptămână), km după regula din 25.09 (zi / săptămână, informativ) */
  liber?: number; liberSapt?: number; regula2509?: number; regula2509Sapt?: number;
  /** ION-268 (LEAR, «schelet întâi»): planul zilei față de GPS — «s1: tur B6 ✓ · retur B6 ✓; s2: …», cursele din plan nefăcute, numărătoarea */
  rezumat?: string | null; lipsa?: string[]; plan?: PlanZiSumar | null;
}
export interface RandListaHarta { m: string; z: string; sumar: SumarZiHarta }

/** linia din schelet sub urma mașinii */
export interface LinieSchelet { id: string; capat: string | null; plin: Punct[]; sate: { n: string; c: Punct }[] }

export const CULOARE: Record<TipInterval, string> = {
  cursa: '#1D6B6B', gol: '#B3261E', munca: '#2F5DA8', uzina: '#8A7F72', plin: '#1D6B6B', punct: '#2F5DA8', parcare: '#8A7F72', bucla: '#C26A00', fortat: '#C77D0A', liber: '#B85C00',
};
export const LINIE: Record<TipInterval, string | undefined> = { cursa: undefined, gol: '8 6', munca: '2 6', uzina: '4 5', plin: undefined, punct: '2 6', parcare: '4 5', bucla: '6 3', fortat: '6 4', liber: '3 4' };
export const NUME_TIP: Record<TipInterval, string> = {
  cursa: 'cu oameni', gol: 'gol', munca: 'între uzine / service', uzina: 'lângă uzină', plin: 'cu marfă', punct: 'la punct (încarcă / descarcă / bază / vamă)', parcare: 'stă (≥ 1 h)', bucla: 'buclă la predarea turei',
  fortat: 'gol forțat (pe rută, între ture, legătură)',
  liber: 'timp liber (ocol la prânz)',
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
  const m = new Map<string, { m: string; zile: string[]; economie: number; total: number; linii: Set<string>; sapt: number | null; necalculat: boolean }>();
  for (const r of rows) {
    const x = m.get(r.m) ?? { m: r.m, zile: [], economie: 0, total: 0, linii: new Set<string>(), sapt: null, necalculat: false };
    if (r.sumar.economieSapt != null) x.sapt = r.sumar.economieSapt;
    // ION-263: economieSapt null + motiv = mașina scoasă din calcul (ex. LEAR «un singur schimb») — «necalculat», nu 0 km de tăiat
    else if (r.sumar.economieSapt === null && r.sumar.motivAfara) x.necalculat = true;
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
  // ION-147 (Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit»): rândurile le scrie VPS sebn-parcare/lant.sh;
  // două uzine, un singur rând 'SEBN'; porțile: Orhei (poarta principală + punctul Bucuria) și Strășeni
  sebn: { id: 'SEBN', nume: 'SEBN Orhei + Strășeni', lear: true, schelet: 'schelet-sebn.json', poarta: [47.3864, 28.8014] as Punct,
    porti: [{ c: [47.3864, 28.8014] as Punct, n: 'poarta SEBN Orhei' }, { c: [47.38724, 28.81155] as Punct, n: 'SEBN Orhei — punctul Bucuria' }, { c: [47.15225, 28.62686] as Punct, n: 'poarta SEBN Strășeni' }] },
  // ION-148 (Ion, 01.10.2026: «adaugă toate direcțiile»): rândurile le scrie VPS briceni-parcare/harta.mjs, controlul flotei în
  // lde_analiza_reguli 'BRICENI_HARTA'; pe hartă poarta Trox și autogara Briceni (din scheletul public)
  briceni: { id: 'BRICENI', nume: 'Briceni: Trox + suburban', lear: false, schelet: 'schelet-briceni.json', control: 'BRICENI_HARTA' },
  // ION-149 (Ion, 01.10.2026: «adaugă toate direcțiile»): rutele interurbane, locul de noapte P1/P2; rândurile le scrie VPS mejgorod-parcare/harta.mjs,
  // controlul flotei în lde_analiza_reguli 'MEJGOROD_HARTA'; pe hartă gările din scheletul public
  mejgorod: { id: 'MEJGOROD', nume: 'Rute interurbane', lear: false, schelet: 'schelet-mejgorod.json', control: 'MEJGOROD_HARTA' },
} as const;
export type UzHarta = keyof typeof UZINE_HARTA;
/** cheia din adresă; orice altceva = Drăxlmaier (adresele vechi, fără ?uz=, rămân valabile) */
export const uzHarta = (x?: string | null): UzHarta => (x === 'ungheni' || x === 'floresti' || x === 'camioane' || x === 'sebn' || x === 'briceni' || x === 'mejgorod' ? x : 'drax');
/** tipurile din legenda hărții: cisternele au plin / gol / la punct / stă, uzinele cursă / gol / muncă / uzină;
 * mejgorod (ION-149): cursă / gol / stă / timp liber la prânz / muncă știută (652AKD la SEBN) */
export const tipuriLegenda = (uz: UzHarta): TipInterval[] => (uz === 'camioane' ? ['plin', 'gol', 'punct', 'parcare']
  : uz === 'sebn' ? ['cursa', 'gol', 'bucla', 'munca', 'uzina'] : uz === 'briceni' ? ['cursa', 'gol', 'fortat', 'munca', 'parcare']
  : uz === 'mejgorod' ? ['cursa', 'gol', 'parcare', 'liber', 'munca'] : ['cursa', 'gol', 'munca', 'uzina']);
/** numele tipului în legendă: la Briceni roșul e livrarea (economia), iar «stă» nu are pragul de 1 h al cisternelor */
export const numeTip = (uz: UzHarta, t: TipInterval): string =>
  uz === 'briceni' && t === 'gol' ? 'livrare (gol de tăiat)' : uz === 'briceni' && t === 'parcare' ? 'stă' : uz === 'briceni' && t === 'munca' ? 'service / deplasare'
  : uz === 'mejgorod' && t === 'munca' ? 'muncă știută (altă uzină)' : uz === 'mejgorod' && t === 'parcare' ? 'stă' : NUME_TIP[t];

/** un rând din «Ziua făcută, drum cu drum» pe hartă */
export interface RandZi { ora: string; tip: TipInterval; text: string; tare: boolean }
const TEXT_TIP: Record<TipInterval, string> = {
  cursa: 'cu oameni', gol: 'gol', munca: 'parcul Bălți (reparație)', uzina: 'așteaptă la poartă', plin: 'cu marfă', punct: 'la punct', parcare: 'stă', bucla: 'buclă la predarea turei (nu e drum de parcare)',
  fortat: 'gol forțat',
  liber: 'timp liber',
};
/** ziua LEAR n-are povestea Drăxlmaier (drax-ziua.ts): rândurile se fac din intervalele hărții — ora, drumul, km și ce fel de drum */
export function randuriDinIntervale(iv: IntervalHarta[]): RandZi[] {
  return iv.map((v) => {
    const km = `${(Math.round(v.km * 10) / 10).toLocaleString('ro-RO')} km`;
    const drum = v.tip === 'uzina' ? '' : v.de === v.pana ? `pe la ${v.de ?? '—'}, ` : `${v.de ?? '—'} → ${v.pana ?? '—'}, `;
    // ION-268: cursa din plan își spune rolul (Tur/Retur · schimb · rută, statutul) înaintea drumului
    // ION-268 (TUR = RETUR): la cursa făcută km sunt cei din schelet; GPS-ul doar în paranteză, când diferă cu ≥ 1 km
    const gps = v.kmGps != null && Math.abs(v.kmGps - v.km) >= 1 ? ` (GPS ${(Math.round(v.kmGps * 10) / 10).toLocaleString('ro-RO')} km)` : '';
    if (v.tip === 'cursa' && v.eticheta) return { ora: v.ora, tip: v.tip, text: `${v.eticheta}: ${drum}${km}${v.cats?.neconfirmat != null ? '' : ` cu oameni, din schelet${gps}`}`, tare: false };
    return { ora: v.ora, tip: v.tip, text: `${drum}${km} ${TEXT_TIP[v.tip]}`, tare: v.tip === 'gol' && v.km >= 20 };
  });
}

const SIMB_PLAN: Record<CursaPlan['statut'], string> = { facuta: 'făcută', neconfirmata: 'neconfirmată (capăt atins, fără drumul rutei)', lipsa: 'lipsă' };
/** ION-268: rândurile «Planul zilei» (din schelet): fiecare cursă din plan cu ce a confirmat GPS-ul */
export function randuriPlan(curse: CursaPlan[]): { cheie: string; text: string; statut: CursaPlan['statut'] }[] {
  // schimb 0 = fără schimburi (rutele interurbane, ION-268): ordinea din plan (ora din grafic), fără «s0»
  return [...curse].map((c, i) => ({ c, i })).sort((a, b) => a.c.schimb - b.c.schimb || (a.c.schimb ? (a.c.sens === b.c.sens ? 0 : a.c.sens === 'tur' ? -1 : 1) : a.i - b.i)).map(({ c, i }) => ({
    cheie: `${c.schimb}-${c.sens}-${i}`, statut: c.statut,
    text: `${c.sens === 'tur' ? 'Tur' : 'Retur'}${c.schimb ? ` s${c.schimb}` : ''} · ${c.schimb ? '' : 'ruta '}${c.ruta ?? '—'}${c.capat ? ` ${c.capat}` : ''}: ${SIMB_PLAN[c.statut]}`
      + (c.km != null && c.statut === 'facuta' ? `, ${(Math.round(c.km * 10) / 10).toLocaleString('ro-RO')} km din schelet, ${c.peDrum ? `pe drumul rutei (${c.acoperire ?? '—'} %), fără urcări văzute` : c.schimb === 0 && c.acoperire != null ? `drumul rutei acoperit ${c.acoperire} %` : `${c.urcari} urcări`}` : '')
      + (c.statut === 'facuta' && c.schimb === 0 && c.motiv ? ` — ${c.motiv}` : '')
      + (c.statut === 'neconfirmata' && c.schimb === 0 && c.motiv ? ` — ${c.motiv}` : '')
      + (c.statut === 'neconfirmata' && c.rutaUrma ? ` — urma arată ruta ${c.rutaUrma}` : '')
      + (c.statut === 'facuta' && c.schimbCu ? ` — schimb de rută cu ${c.schimbCu}` : '')
      + (c.motiv && c.statut === 'lipsa' ? ` — ${c.motiv}` : ''),
  }));
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

// ─── ION-148 (Ion, 01.10.2026: «adaugă toate direcțiile»): Briceni, Trox + suburban ───
/** categoriile raportului BRICENI (livrare.mjs) în cuvinte, în ordinea în care se arată pe rândul zilei */
const CAT_BRICENI: [string, string][] = [
  ['cuOameni', 'cu oameni'], ['nepotrivita', 'cursă în afara orarului'], ['livrare', 'livrare'], ['brambura', 'brambura'],
  ['golRuta', 'gol pe rută'], ['golTure', 'gol între ture'], ['legatura', 'legătură'], ['service', 'service'], ['deplasare', 'deplasare'],
  ['necunoscut', 'necunoscut'],
];
/** rândurile zilei Briceni: drumul, km pe categoriile raportului (ocolul pe acasă = livrare + drumul impus), motivul */
export function randuriBriceni(iv: IntervalHarta[]): RandZi[] {
  const f = (x: number) => `${(Math.round(x * 10) / 10).toLocaleString('ro-RO')} km`;
  return iv.map((v) => {
    if (v.tip === 'parcare') return { ora: v.ora, tip: v.tip, text: `stă la ${v.de ?? '—'}`, tare: false };
    const drum = v.de === v.pana ? `pe la ${v.de ?? '—'}` : `${v.de ?? '—'} → ${v.pana ?? '—'}`;
    const parti = CAT_BRICENI.filter(([c]) => (v.cats[c] ?? 0) >= 0.1).map(([c, n]) => `${f(v.cats[c])} ${n}`);
    const km = parti.length ? parti.join(' + ') : `${f(v.km)} ${TEXT_TIP[v.tip]}`;
    // ION-268: cursa suburbană din plan își spune rolul; km cu oameni sunt cei din schelet (tur = retur), GPS-ul în paranteză când diferă cu ≥ 1 km
    const gps = v.kmGps != null && Math.abs(v.kmGps - v.km) >= 1 ? ` (GPS ${f(v.kmGps)})` : '';
    return { ora: v.ora, tip: v.tip, text: `${v.eticheta ? `${v.eticheta}: ` : ''}${drum}, ${km}${v.kmGps != null ? ` din schelet${gps}` : ''}${v.nota ? ` · ${v.nota}` : ''}`, tare: (v.cats.livrare ?? 0) >= 20 };
  });
}

/** scheletul Briceni (public/lde/schelet-briceni.json), doar cât citește harta */
export interface ScheletBriceniHarta {
  gara: Punct; poarta: Punct;
  rute: { id: string; nume: string; capat: string | null; shape: Punct[]; stops: { n: string; c: Punct }[] }[];
}
/** liniile mașinii din schelet (T1…T6, 44…57, «46+52+53+54») și cele două ancore: poarta Trox și autogara, una lângă alta */
export function liniiBriceni(s: ScheletBriceniHarta, chei: Iterable<string>): { linii: LinieSchelet[]; porti: { c: Punct; n: string }[] } {
  const k = new Set(chei);
  return {
    linii: s.rute.filter((r) => k.has(r.id)).map((r) => ({ id: `${r.id} · ${r.nume}`, capat: r.capat, plin: r.shape, sate: r.stops.map((x) => ({ n: x.n, c: x.c })) })),
    porti: [{ c: s.poarta, n: 'poarta Trox' }, { c: s.gara, n: 'autogara Briceni' }],
  };
}

// ─── ION-149 (Ion, 01.10.2026: «adaugă toate direcțiile»): harta rutelor interurbane (mejgorod), locul de noapte P1/P2 ───
/** rândurile «Ziua făcută, drum cu drum» ale autobuzului interurban: cursa cu ruta, staționarea cu locul și cât stă, golul mare îngroșat */
export function randuriMejgorod(iv: IntervalHarta[]): RandZi[] {
  return iv.map((v) => {
    const km = `${(Math.round(v.km * 10) / 10).toLocaleString('ro-RO')} km`;
    if (v.tip === 'parcare') {
      const cat = v.t1 - v.t0 >= 60 ? durata(v.t1 - v.t0) : '';
      const tot = v.durataMin != null && v.durataMin * 60 > v.t1 - v.t0 + 90 ? ` (în total ${durata(v.durataMin * 60)})` : '';
      return { ora: v.ora, tip: v.tip, text: `${v.de ?? '—'}${cat ? `, ${cat}${tot}` : ''} — ${v.nota ?? TEXT_TIP[v.tip]}`, tare: false };
    }
    const drum = v.de === v.pana ? `pe la ${v.de ?? '—'}` : `${v.de ?? '—'} → ${v.pana ?? '—'}`;
    return { ora: v.ora, tip: v.tip, text: `${drum}, ${km} ${TEXT_TIP[v.tip]}${v.nota ? ` · ${v.nota}` : ''}`, tare: (v.tip === 'gol' || v.tip === 'liber') && v.km >= 20 };
  });
}

/** scheletul interurban (public/lde/schelet-mejgorod.json, ION-55), doar cât citește harta */
export interface ScheletMejgorodHarta {
  gari: Record<string, Punct>;
  rute: { id: number; capNord: string; shape: Punct[]; stops: { n: string; c: Punct }[] }[];
}
const NUME_GARA: Record<string, string> = { chisinau: 'Chișinău', balti: 'Bălți', edinet: 'Edineț', briceni: 'Briceni', lipcani: 'Lipcani', ocnita: 'Ocnița', riscani: 'Rîșcani' };
/** rutele mașinii (id-urile scrise de harta.mjs ca text) din scheletul simetric: drumul sub urmă, opririle, capătul de nord */
export const liniiMejgorod = (s: ScheletMejgorodHarta, ids: string[]): LinieSchelet[] =>
  s.rute.filter((r) => ids.includes(String(r.id))).map((r) => ({ id: `ruta ${r.id}`, capat: r.capNord, plin: r.shape, sate: r.stops.map((x) => ({ n: x.n, c: x.c })) }));
/** gările din schelet, în locul porților */
export const gariMejgorod = (s: ScheletMejgorodHarta) => Object.entries(s.gari).map(([k, c]) => ({ c, n: `gara ${NUME_GARA[k] ?? k}` }));
/** textul listei din stânga: rutele mașinii */
export const textRute = (uz: UzHarta, linii: string[]) => (uz === 'mejgorod'
  ? (linii.length ? `ruta ${linii.join(', ')}` : 'fără rută')
  : linii.map((l) => l.replace('|', ' · ')).join(', ') || 'fără linie');
