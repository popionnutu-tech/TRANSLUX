// Analiza săptămânală Drăxlmaier Bălți (ION-94, faza 3 din ION-86): tipurile rândului «DRAXELMAIER» din lde_analiza_reguli,
// modul rutei /api/cron/drax-optimizari și textul indicațiilor pentru dispecer (§12).
//
// Tipuri PROPRII, nu cele ale Briceni (verdictul 1 al dezbaterii F3, docs/plans/2026-09-26-drax-f3-raspunsuri.md): aceleași
// chei au alt sens la Drăxlmaier (golTure = gol între tur și retur, nu «6 drumuri pe 2 ture»; parcul e loc de așteptare lângă
// uzină), iar economia e regula B (R1a + R1b + R3, «cost de azi») cu extrapolare. Rândul îl scrie luni VPS-ul
// (drax/cod/saptamanal/scrie-analiza.mjs); aici doar se citește. Funcții pure, fără bază, ca să se poată testa.
import { escapeHtml } from '@/lib/telegram-notify';
import { perioada, PLAFON } from './timp-liber';
import type { TimpLiberMasina } from '@/app/(dashboard)/lde/reguli/actions';
import type { Reguli4Drax } from './drax-reguli4';
import type { ZiIdealaDrax } from './drax-zi-ideala';
import type { ParcareDrax } from './drax-parcare';

// ION-119 (Ion, 28.09): intreUzine = drumul între porțile VEST și EST, cursă între uzine (muncă), nu gol; rândurile de dinainte n-au cheia
export const CAT_DRAX = ['cuOameni', 'livrare', 'golRuta', 'golTure', 'parc', 'service', 'deplasare', 'legatura', 'necunoscut', 'intreUzine'] as const;
export type CategorieDrax = (typeof CAT_DRAX)[number];
/** rândurile scrise înainte de ION-119 (28.09.2026) n-au «intreUzine» */
export type KmDrax = Record<Exclude<CategorieDrax, 'intreUzine'>, number> & { intreUzine?: number };
type R = { R1a: number; R1b: number; R3: number };
type RN = { R1a: number | null; R1b: number | null; R3: number | null; B: number | null };

export interface BucataDrax {
  ora: string; t0: number; t1: number; cat: CategorieDrax; km: number; golImpus: number; ocol: boolean;
  r3?: number; inZona?: number; pranz: boolean; de: string | null; pana: string | null; lin: string | null; motiv: string | null;
  // ION-105 (aditive, din 27.09): cursele vecine golului («R3|Recea* retur s1»), satul unde a plecat mașina, km-ii golului care intră în R3
  prev?: string | null; next?: string | null; acasa?: string | null; r3fin?: number;
  /** ION-119: porțile cursei între uzine, în ordine («VEST → EST», «EST → VEST, VEST → EST») */
  porti?: string;
}
export interface ZiDrax {
  z: string; dow: number; total: number; km: KmDrax; brambura: number; bilant: boolean; dif: number; tipar?: string | null;
  exclus: string | null; noapteDim: string | null; noapteSeara: string | null;
  /** ION-105: componentele zilei scoase ca «de lămurit» (nu intră în R1a / R1b / R3 ai mașinii) */
  scosDeLamurit?: R | null;
  economie: (R & { B: number; nelamurit: number }) | null; bucati: BucataDrax[];
}
export interface IntervalDrax { zi?: string; exclus?: boolean; t0: number; t1: number; ora: string; km: number; lin: string | null }
export interface MasinaDrax {
  m: string; zile: number; zileIncluse: number; zileExcluse: number; total: number; km: KmDrax;
  rute: { r: string; nume: string | null; curse: number; km: number; zile: number }[];
  casa: string | null; casaKmPoarta: number | null; regula: 'B';
  economie: R & { B: number; A: number | null; nelamurit: number };
  extrapolat: RN; Amaibun?: boolean;
  deLamuritScos: R & { B: number; masurat: R };
  dejaLangaUzina: { intervale: number; km: number };
  nelamuritLista: IntervalDrax[];
  curseDePranz: { intervale: number; km: number; lista: IntervalDrax[] };
  lei: { masurat: number | null; extrapolat: number | null }; normaLipsa: boolean;
  deLamurit: string | null; liber: TimpLiberMasina | null;
  liberBrut: { km: number; km_brambura: number; km_neclar: number; km_reparatie: number } | null;
  kmExplicatF2: number | null; steaguriLiber: string[];
  detalii: ZiDrax[];
}
export interface IndicatieDrax { m: string; R1b: number; R3: number; R1a: number; zile: string; R1bR3: number }
export interface ProbaDrax { conditie: number; trec: number; pica: number }
export interface AnalizaDrax {
  uzina: 'DRAXELMAIER'; saptamina: string; pana_la: string;
  total: KmDrax & { brambura: number }; zile: number; zileBilantOk: number;
  masini: MasinaDrax[]; rute: { id: string; nume: string | null; livrare: number; masini: string[] }[];
  economie: {
    regula: 'B'; formulare: string; zileLV: number; esantion: number; nedetectate: number;
    carduri: { masini: number; nemasurate: string[]; R1a: number; R1b: number; R3: number; B: number; R1bR3: number; lei: number;
      deLamurit: { masini: string[]; B: number; R1a: number; R1b: number; R3: number } };
    referintaF2: { extrapolare: Record<string, number>; lei: number; nota: string };
    saptAtipica: boolean; flotaPrecedenta: number | null;
    masurat: Record<string, number>; deja: { n: number; km: number };
    atipice?: unknown; nemasurate: string[]; putinMasurate: string[]; normaLipsa: string[];
    lei: { masurat: number; extrapolat: number };
  };
  indicatii: { prag_km: number; peste_prag: number; top: IndicatieDrax[] };
  deLamurit: { m: string; motiv: string }[];
  referinte: Record<string, string>;
  timp_liber: {
    prag_km: number; km_total: number; masini_peste_prag: string[]; km_brambura_total: number; masini_peste_prag_brambura: string[];
    km_neclar_total: number; km_reparatie_total: number; km_explicat_f2: number; km_alta_uzina_total: number;
    brut: { km: number; km_brambura: number; km_neclar: number }; R_PARC_ZONA: number; modul?: string;
  };
  control: {
    probe: Record<string, ProbaDrax>;
    P10: { masini: number; pica: unknown[]; picaC: unknown[]; pasi: Record<string, number>; scoasDePrioritateaF2: { liber: number; brambura: number } };
    bilant: { zile: number; ok: number; maxDifPct: number } | null; schimb3: { inAfaraFerestrelor: number } | null;
  };
  /** ION-108: planul de schimb pe toată flota; lipsă = rând scris înainte de partea A; null = calculul a eșuat (motivul alături) */
  planSchimb?: PlanSchimbDrax | null;
  planSchimbLipsa?: string | null;
  /** ION-120: cele 4 reguli de optimizare ale lui Ion (§8.7); lipsă la rândurile de dinainte de 28.09.2026 sau dacă pasul a picat */
  reguli4?: Reguli4Drax | null;
  /** ION-123: economia față de «ziua ideală» a fiecărei mașini; lipsă la rândurile de dinainte de 28.09.2026 */
  ziIdeala?: ZiIdealaDrax | null;
  /** ION-136 (29.09.2026): parcarea propusă, cifra principală în locul zilei ideale */
  parcare?: ParcareDrax | null;
}

// ─── planul (ION-108, partea A: câmp aditiv scris de VPS, contractul §6 din plan-v3) ─────────
// Pârghia principală: între curse mașina STĂ PARCATĂ (la capătul cursei următoare sau la uzină). Cifra principală a paginii e
// costul de azi pe GPS; ce se taie e o ESTIMARE de model (drumul cel mai scurt) și apare o singură dată. Schimbul de linii e un
// plus mic, publicat doar când e verificat pe săptămâna precedentă (schimburile inversate). Mai jos sunt doar câmpurile citite de
// pagină; forma se verifică strict la citire (drax-plan-schimb.ts), iar un plan stricat se arată «indisponibil», nu dărâmă pagina.
/** o linie mutată: `linie` = cheia «tur>retur», `nume` = de afișat («Coșernița (R30)»); cel puțin unul din tur/retur e prezent */
export interface MutareSchimbDrax {
  linie: string; tur: string | null; retur: string | null; nume: string; dela: string; la: string; zile?: number;
  /** schimbul din săptămâna calculată; NU se afișează (schimburile se inversează săptămânal) */
  schimbInSaptamana?: string;
}
export interface MasinaLantDrax { m: string; kmSapt: number }
/** lanțul = componenta mutărilor legate între ele; economia = min(săptămâna curentă, săptămâna cu rotația inversă) */
export interface LantSchimbDrax {
  economieKmSapt: number; economieRotatie: number | null; leiSapt: number | null; faraNorma: string[];
  /** pe mașină: + = merge mai mult după mutare, − = mai puțin */
  peMasina: MasinaLantDrax[];
  mutari: MutareSchimbDrax[];
}
/** golul pe părți ale zilei (km/săpt.) */
export interface KmPartiDrax { dimineata: number; seara: number; intreCurse: number; total: number }
/** unde stă parcată mașina: «uzină» sau «capătul <Sat> (R<n>)» */
export interface LocParcareDrax { unde: string; departeDeCasaKm: number | null; acasaEChiarLocul: boolean }
export interface LocuriParcareDrax { dimineata: LocParcareDrax | null; seara: LocParcareDrax | null; intreCurse: LocParcareDrax | null }
/** pe parte: casa e în drum spre cursa următoare (planul nu dă loc și nu e nimic de tăiat) → «poate sta acasă» */
export interface CasaInDrumDrax { dimineata: boolean; seara: boolean }
export interface AsteptareMasinaDrax {
  /** kmSapt = estimarea v3.1 a mașinii (plafonată la GPS pe mașinile măsurate); kmZi pe zilele rândului */
  m: string; kmSapt: number; kmZi: number;
  /** golul de azi pe GPS; null = < 3 zile măsurate */
  gps: KmPartiDrax | null;
  /** null pe o parte = planul nu propune loc */
  asteapta: LocuriParcareDrax;
  casaInDrum: CasaInDrumDrax;
  /** doar la mașinile din lanțurile publicate: locurile și «casa în drum» din calendarul DUPĂ lanț */
  dupaLant?: { asteapta: LocuriParcareDrax; casaInDrum: CasaInDrumDrax } | null;
}
/** o mașină din întrebarea de seară (lista și sumele le calculează planul) */
export interface IntrebareSearaMasinaDrax {
  m: string; unde: string; departeDeCasaKm: number | null; gpsSeara: number | null; estimareSeara: number;
  de: string | null; pana: string | null; masurat: boolean;
  /** v3.2: seara șoferul merge acasă cu o mașină mică (Ion, 27.09); lipsește în planurile v3.1 */
  masinaMica?: MasinaMicaSearaDrax;
}
/** v3.2: seri/săpt. cu drum acasă, km mașinii mici (seri × 2 × loc→casă), lei/km autobuz FĂRĂ salariu, soldul lunar înaintea costului fix */
export interface MasinaMicaSearaDrax { seri: number; kmSapt: number; leiKmAutobuz: number | null; soldLuna: number | null }
/** v3.2: ipotezele mașinii mici (l/100 km, uzură lei/km, prețul motorinei al săptămânii) */
export interface MasinaMicaIpotezeDrax { litri: number; uzura: number; pret: number | null; leiKm: number | null; saptLuna: number; soldPozitivLuna: number }
/** costul de azi (GPS) și estimarea de tăiat pe o parte a zilei */
export interface GpsEstimareDrax { gps: number; estimare: number }
export interface PlanSchimbDrax {
  sapt: string;
  rotatie: { verificatPe: string | null };
  asteptare: {
    dimineata: GpsEstimareDrax;
    seara: GpsEstimareDrax & {
      cursaDeNoapte: string | null;
      intrebare: { masini: IntrebareSearaMasinaDrax[]; gpsKmSapt: number; estimareKmSapt: number; nemasurate: string[]; masinaMica?: MasinaMicaIpotezeDrax };
    };
    /** estimarea v3.1 (dimineață + seară, plafonată) și leii pe aceeași bază (doar mașinile cu normă) */
    kmSapt: number; leiSapt: number | null;
    masini: AsteptareMasinaDrax[];
    nemasurate: { m: string; zileGps: string; kmSapt: number }[];
  };
  schimb: {
    stare: 'verificat' | 'neverificat'; kmSapt: number; leiSapt: number | null; lanturiFaraLei: number;
    lanturi: LantSchimbDrax[]; neconfirmateKmSapt: number;
  };
}

/** garda la rulare: `date` din bază e JSON liber; pagina și ruta nu desenează un rând care nu are forma Drăxlmaier */
export function esteAnalizaDrax(x: unknown): x is AnalizaDrax {
  const a = x as Partial<AnalizaDrax> | null;
  return !!a && a.uzina === 'DRAXELMAIER' && typeof a.saptamina === 'string' && Array.isArray(a.masini)
    && !!a.economie?.carduri && !!a.timp_liber && !!a.indicatii;
}

// §12.2 (verdictul 2): pragul lui Ion de la LEAR 12.2, pe R1b + R3 extrapolat, la mașinile cu ≥ 3 zile măsurate; primele 3 (SEBN 12.6)
export const PRAG_INDICATII_KM = 100;
export const MIN_ZILE_MASURATE = 3;
export const MAX_INDICATII = 3;
export const UZINA_DRAX = { nume: 'Drăxlmaier Bălți', uz: 'drax' } as const;
export const RIND_DRAX = 'DRAXELMAIER';

// ─── modul rutei (funcție pură, triaj F3 S4) ────────────────────────────────
//   (nimic)                → png: imaginea, nimic trimis, nimic scris
//   ?poster=1[&force=1]    → posterul în grupa livrărilor (după «da»-ul lui Ion)
//   ?indicatii=1[&force=1] → indicațiile pentru dispecer (după «da»; separat de poster)
//   ?liber=1[&force=1]     → mesajul de timp liber către ADMIN (după «da»; azi doar &dry=1)
//   &dry=1                 → cu oricare din cele trei: textul întors, nimic trimis, nimic scris
//   combinații, send=1, valori ≠ 1, force / dry fără mod, saptamina nevalidă → 400
export type ModDrax =
  | { tip: 'png' }
  | { tip: 'poster' | 'indicatii' | 'liber'; force: boolean; dry: boolean }
  | { tip: 'eroare'; status: 400; motiv: string };

export function modDrax(q: URLSearchParams): ModDrax {
  const v = (k: string) => q.get(k);
  const moduri = (['poster', 'indicatii', 'liber'] as const).filter((k) => v(k) != null);
  const rau = (motiv: string): ModDrax => ({ tip: 'eroare', status: 400, motiv });
  if (v('send') != null) return rau('send=1 nu există la Drăxlmaier: ?poster=1 sau ?indicatii=1');
  const s = v('saptamina');
  if (s != null && !/^\d{4}-\d{2}-\d{2}$/.test(s)) return rau('saptamina = YYYY-MM-DD');
  for (const k of [...moduri, 'force', 'dry']) if (v(k) != null && v(k) !== '1') return rau(`${k} acceptă doar 1`);
  if (moduri.length > 1) return rau(`un singur mod pe apel (${moduri.join(' + ')})`);
  if (!moduri.length) return v('force') != null || v('dry') != null ? rau('force / dry fără mod') : { tip: 'png' };
  return { tip: moduri[0], force: v('force') === '1', dry: v('dry') === '1' };
}
/** invariantul: doar aceste moduri pot atinge Telegram, app_config sau lde_analiza_reguli */
export const scrieModul = (m: ModDrax) => (m.tip === 'poster' || m.tip === 'indicatii' || m.tip === 'liber') && !m.dry;

// ─── indicațiile pentru dispecer (§12, se scriu, NU pleacă până la «da») ────
const nr = (v: number) => Math.round(v).toLocaleString('ro-RO');
const numeLinie = (lin: string) => lin.split('|').join(' · ');

export function indicatiiDrax(a: AnalizaDrax, baseUrl: string): string | null {
  const top = (a.indicatii?.top ?? []).filter((x) => x.R1bR3 >= PRAG_INDICATII_KM).slice(0, MAX_INDICATII);
  if (!top.length) return null;
  const rute = new Map(a.masini.map((m) => [m.m, m.rute.slice().sort((x, y) => y.zile - x.zile).slice(0, 2).map((r) => numeLinie(r.r))]));
  const linii = top.map((x) => {
    const parti: string[] = [];
    if (x.R1b >= 0.5) parti.push(`ocolul pe acasă între curse −${nr(x.R1b)} km/săpt.: între curse, unde așteaptă mașina — la capăt sau la uzină, nu acasă?`);
    if (x.R3 >= 0.5) parti.push(`între tur și retur −${nr(x.R3)} km/săpt.: așteaptă lângă uzină?`);
    const r = rute.get(x.m) ?? [];
    return `• <b>${escapeHtml(x.m)}</b>${r.length ? ` (${escapeHtml(r.join(', '))})` : ''} — ${parti.join('; ')}`;
  });
  const antet = `📋 <b>${escapeHtml(UZINA_DRAX.nume)} · ce facem săptămâna asta</b> · ${escapeHtml(perioada(a.saptamina, a.pana_la))}\n` +
    `Unde se taie cel mai mult cu o dispoziție (peste ${PRAG_INDICATII_KM} km pe săptămână; ${a.indicatii.peste_prag} ${a.indicatii.peste_prag === 1 ? 'mașină' : 'mașini'} peste prag):`;
  const link = `${baseUrl}/lde/reguli?saptamina=${encodeURIComponent(a.saptamina)}&uz=${UZINA_DRAX.uz}`;
  const subsol = `\n<a href="${link}">restul mașinilor și zilele, bucată cu bucată — pe pagină</a>`;
  let text = antet, puse = 0;
  for (const l of linii) { if ((text + '\n' + l + subsol).length + 40 > PLAFON) break; text += '\n' + l; puse++; }
  if (puse < linii.length) text += `\n… și încă ${linii.length - puse}`;
  return text + subsol;
}

/** mașinile pentru mesajul de timp liber (textTimpLiber): cele cu analiza §11 */
export const masiniLiber = (a: AnalizaDrax) =>
  a.masini.filter((m) => m.liber).map((m) => ({ masina: m.m, liber: m.liber as TimpLiberMasina }));
