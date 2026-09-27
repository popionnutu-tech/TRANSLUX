// «Ce faci săptămâna asta» la Drăxlmaier Bălți (ION-105, ION-107, ION-108) — partea de CIFRE, doar din GPS. Cifrele R1b și R3
// ale rândului săptămânii se desfac pe mașină: din bucățile «ocol pe acasă» (R1b) și «gol între ture» (R3) ale fiecărei zile
// măsurate se face câte un CAZ pe tipar (aceeași cursă-sfârșit → aceeași cursă-început, același sat). Nimic nu se socotește din
// nou: km-ii sunt ai bucăților, extrapolați pe mașină la fel ca în worker (km măsurați × zile lucrate / zile măsurate), deci
// Σ cazurilor unei mașini = R1b + R3 extrapolați. Textul e în drax-ce-faci-text.ts. Funcții pure, fără bază.
//
// ION-108 (runda 2 de revizie): cifra GPS e COSTUL DE AZI, nu economia. Se desparte pe DIMINEAȚĂ (golul care începe după turul
// de dimineață, până la cursa de după-amiază) și SEARĂ (după returul de după-amiază, până la cursa de la miezul nopții): dimineața
// mașina poate sta parcată de luni; seara depinde de cum ajunge șoferul la cursa de ~00:15. Pragul e pe MAȘINĂ: ≥ 20 km/zi lucrată
// (și ≥ 100 km/săpt., §12.2) cu ≥ 3 zile măsurate; o mașină din listă are TOATE drumurile acasă «de tăiat» (dacă stă parcată, nici
// cele mici nu mai au loc). Verdictul e deci al mașinii: ramane / mic / nemasurat.
import { MIN_ZILE_MASURATE, PRAG_INDICATII_KM, type AnalizaDrax, type BucataDrax, type MasinaDrax, type ZiDrax } from './drax-analiza';

export type TipCazDrax = 'ocol' | 'ture';
export type SensCursa = 'tur' | 'retur';
export type VerdictCazDrax = 'ramane' | 'mic' | 'nemasurat';
export type ParteZiDrax = 'dimineata' | 'seara';
/** turul se termină la poartă, returul pleacă de la poartă; celălalt capăt e satul liniei */
export type LocDrax = { tip: 'uzina' } | { tip: 'capat'; sat: string | null };
export interface CursaVecina { lin: string; sens: SensCursa | null; schimb: string | null }
export interface ZiCazDrax { z: string; ora: string; km: number; asteptareMin: number }
export interface CazDrax {
  tip: TipCazDrax; verdict: VerdictCazDrax; parte: ParteZiDrax;
  dupa: CursaVecina | null; inainte: CursaVecina | null;
  termina: string; revine: string; asteptareMin: number;
  locSfarsit: LocDrax; locInceput: LocDrax; acasa: string | null;
  /** unde poate sta parcată după GPS: de unde pleacă cursa următoare (golul dintre tur și retur: lângă uzină) */
  ramane: LocDrax;
  zile: ZiCazDrax[]; kmZi: number; kmSapt: number;
}
export type KmVerdict = Record<VerdictCazDrax, number>;
export type StareMasinaDrax = 'peste' | 'sub' | 'nemasurata';
/** o parte a zilei pe mașină: km (extrapolați), orele tipice și locul din GPS */
/**
 * o parte a zilei pe mașină: km (extrapolați), orele tipice, locul din GPS și eticheta satului unde merge («Călugăr / Scumpia»).
 * Locul GPS (când planul nu dă unul): dimineața = de unde pleacă cursa următoare; seara = capătul returului (cursa următoare pleacă
 * de la poartă abia la miezul nopții, iar regula planului alege locul cel mai apropiat de casă dintre capăt și uzină).
 */
export interface ParteMasinaDrax {
  kmSapt: number; kmZi: number; termina: string | null; revine: string | null; loc: LocDrax | null; acasa: string | null;
}
export interface IndicatieMasinaDrax {
  m: string; zileMasurate: number; zileLucrate: number; casa: string | null; deLamurit: string | null;
  stare: StareMasinaDrax;
  /** cifra mașinii: gol din cauza drumului acasă între curse, km/săpt. (R1b + R3 extrapolat) — costul de azi */
  kmSapt: number;
  /** aceeași cifră pe zi lucrată */
  kmZi: number;
  parti: Record<ParteZiDrax, ParteMasinaDrax>;
  cazuri: CazDrax[]; km: KmVerdict; kmCazuri: number; abatere: number;
}
export interface CeFaciDrax {
  saptamina: string;
  masini: IndicatieMasinaDrax[];
  /** mașinile peste prag, descrescător după cifra mașinii */
  deAratat: IndicatieMasinaDrax[];
  /** mașini măsurate sub prag */
  doarMici: IndicatieMasinaDrax[];
  /** mașini cu < 3 zile măsurate și drum acasă (măsurat, sau după alt semnal dat din afară) */
  nemasurate: IndicatieMasinaDrax[];
  km: KmVerdict;
  /** costul de azi pe mașinile MĂSURATE (fără nemăsurate), pe părți ale zilei, km/săpt.; + kmGrupe.nemasurate = cardul */
  kmParti: Record<ParteZiDrax, number>;
  kmGrupe: { deAratat: number; doarMici: number; nemasurate: number };
  /** R1b + R3 fără bucăți care să-l explice (Σ abaterilor pe mașini); normal 0 — pagina îl arată în roșu */
  neexplicat: number;
  total: number; card: number; abatereCard: number;
}

/** toleranța controalelor (km/săpt.): rotunjirile la 0,1 km pe bucată și pe zi */
export const TOLERANTA_KM = 1;
/** sub atât pe zi lucrată, drumul acasă al mașinii nu merită o dispoziție */
export const PRAG_KM_ZI = 20;
/** golurile care încep înainte de ora asta sunt «dimineața» (după turul de dimineață); restul «seara» */
const ORA_AMIAZA = '12:00';

const r1 = (x: number) => Math.round(x * 10) / 10;
const kmR1bR3 = (m: MasinaDrax) => r1((m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0));

// ─── cursele vecine: «R3|Recea* retur s1» → linia, sensul și schimbul ─────
export function parseCursa(x: string | null | undefined): CursaVecina | null {
  if (!x) return null;
  const p = /^(.*) (\S+) (\S+)$/.exec(x);
  if (!p) return { lin: x, sens: null, schimb: null };
  const sens = p[2] === 'tur' || p[2] === 'retur' ? p[2] : null;
  return { lin: p[1], sens, schimb: /^s\d$/.test(p[3]) ? p[3] : null };
}
const locSfarsit = (c: CursaVecina | null, sat: string | null): LocDrax => (c?.sens === 'tur' ? { tip: 'uzina' } : { tip: 'capat', sat });
const locInceput = (c: CursaVecina | null, sat: string | null): LocDrax => (c?.sens === 'retur' ? { tip: 'uzina' } : { tip: 'capat', sat });

// ─── bucățile care fac R1b și R3, pe zilele măsurate ──────────────────────
interface BucataCaz { tip: TipCazDrax; z: string; b: BucataDrax; km: number }

const zileMasurate = (m: MasinaDrax) => m.detalii.filter((d) => d.economie && !d.exclus);

function bucatiCaz(d: ZiDrax): BucataCaz[] {
  const scos = d.scosDeLamurit;
  const out: BucataCaz[] = [];
  for (const b of d.bucati) {
    if (b.cat === 'livrare' && b.ocol && !scos?.R1b) out.push({ tip: 'ocol', z: d.z, b, km: b.km });
    if (b.cat === 'golTure' && (b.r3fin ?? 0) > 0 && !scos?.R3) out.push({ tip: 'ture', z: d.z, b, km: b.r3fin ?? 0 });
  }
  return out;
}
const cheieTipar = (x: BucataCaz) => [x.tip, x.b.prev ?? '', x.b.next ?? '', x.b.acasa ?? '', x.b.de ?? '', x.b.pana ?? ''].join('¦');

// ─── orele: capetele golului = sfârșitul cursei și începutul următoarei ──
const capete = (ora: string) => ora.split('–');
export function mediana<T>(xs: T[], cmp: (a: T, b: T) => number): T {
  const s = [...xs].sort(cmp);
  return s[Math.floor((s.length - 1) / 2)];
}
const dupaText = (p: string, q: string) => p.localeCompare(q);
const minute = (b: BucataDrax) => Math.round((b.t1 - b.t0) / 60e3);
export const parteZi = (termina: string): ParteZiDrax => (termina < ORA_AMIAZA ? 'dimineata' : 'seara');

/** mașina: < 3 zile măsurate = nemăsurată; peste prag = ≥ 20 km/zi lucrată și ≥ 100 km/săpt. (§12.2) */
export function stareMasina(m: MasinaDrax): StareMasinaDrax {
  if (m.zileIncluse < MIN_ZILE_MASURATE) return 'nemasurata';
  const kmSapt = kmR1bR3(m);
  return m.zile && kmSapt / m.zile >= PRAG_KM_ZI && kmSapt >= PRAG_INDICATII_KM ? 'peste' : 'sub';
}

const VERDICT: Record<StareMasinaDrax, VerdictCazDrax> = { peste: 'ramane', sub: 'mic', nemasurata: 'nemasurat' };
export const verdictCaz = (stare: StareMasinaDrax): VerdictCazDrax => VERDICT[stare];

function construiesteCaz(grup: BucataCaz[], factor: number, stare: StareMasinaDrax): CazDrax {
  const { tip, b } = grup[0];
  const dupa = parseCursa(b.prev), inainte = parseCursa(b.next);
  const kmMasurat = grup.reduce((a, x) => a + x.km, 0);
  const inceput = locInceput(inainte, b.pana);
  const termina = mediana(grup.map((x) => capete(x.b.ora)[0]), dupaText);
  return {
    tip, verdict: verdictCaz(stare), parte: parteZi(termina), dupa, inainte, termina,
    revine: mediana(grup.map((x) => capete(x.b.ora)[1] ?? ''), dupaText),
    asteptareMin: mediana(grup.map((x) => minute(x.b)), (p, q) => p - q),
    locSfarsit: locSfarsit(dupa, b.de), locInceput: inceput, acasa: b.acasa ?? null,
    ramane: tip === 'ture' ? { tip: 'uzina' } : inceput,
    zile: grup.map((x) => ({ z: x.z, ora: x.b.ora, km: r1(x.km), asteptareMin: minute(x.b) })),
    kmZi: r1(kmMasurat / grup.length), kmSapt: r1(kmMasurat * factor),
  };
}

/** cazurile unei mașini, descrescător după km pe săptămână */
export function cazuriMasina(m: MasinaDrax): CazDrax[] {
  if (!m.zileIncluse) return [];
  const factor = m.zile / m.zileIncluse;
  const stare = stareMasina(m);
  const grupuri = new Map<string, BucataCaz[]>();
  for (const x of zileMasurate(m).flatMap(bucatiCaz)) {
    const k = cheieTipar(x);
    grupuri.set(k, [...(grupuri.get(k) ?? []), x]);
  }
  return [...grupuri.values()].map((g) => construiesteCaz(g, factor, stare)).sort((a, b) => b.kmSapt - a.kmSapt);
}

const kmPeVerdict = (cazuri: CazDrax[]): KmVerdict => {
  const k: KmVerdict = { ramane: 0, mic: 0, nemasurat: 0 };
  for (const c of cazuri) k[c.verdict] += c.kmSapt;
  return { ramane: r1(k.ramane), mic: r1(k.mic), nemasurat: r1(k.nemasurat) };
};

/** partea zilei: km, orele mediane și locul cazului celui mai mare (GPS) */
function parteMasina(parte: ParteZiDrax, cazuri: CazDrax[], zileLucrate: number): ParteMasinaDrax {
  const kmSapt = r1(cazuri.reduce((s, c) => s + c.kmSapt, 0));
  const mare = cazuri[0] ?? null; // cazurile vin descrescător după km
  const loc = mare ? (parte === 'seara' ? mare.locSfarsit : mare.ramane) : null;
  return {
    kmSapt, kmZi: zileLucrate ? r1(kmSapt / zileLucrate) : 0, loc, acasa: mare?.acasa ?? null,
    termina: cazuri.length ? mediana(cazuri.map((c) => c.termina), dupaText) : null,
    revine: cazuri.length ? mediana(cazuri.map((c) => c.revine), dupaText) : null,
  };
}

export function indicatieMasina(m: MasinaDrax): IndicatieMasinaDrax {
  const cazuri = cazuriMasina(m);
  const kmCazuri = r1(cazuri.reduce((a, c) => a + c.kmSapt, 0));
  const kmSapt = kmR1bR3(m);
  const pe = (p: ParteZiDrax) => parteMasina(p, cazuri.filter((c) => c.parte === p), m.zile);
  return {
    m: m.m, zileMasurate: m.zileIncluse, zileLucrate: m.zile, casa: m.casa, deLamurit: m.deLamurit, stare: stareMasina(m),
    kmSapt, kmZi: m.zile ? r1(kmSapt / m.zile) : 0, parti: { dimineata: pe('dimineata'), seara: pe('seara') },
    cazuri, km: kmPeVerdict(cazuri), kmCazuri, abatere: r1(kmCazuri - kmSapt),
  };
}

/**
 * @param nemasurataCuSemnal mașinile fără destule zile GPS pe care altă sursă (modelul planului) le arată cu drum acasă;
 *   injectat, ca modulul de cifre GPS să nu depindă de forma planului
 */
export function ceFaciDrax(a: AnalizaDrax, nemasurataCuSemnal: (m: string) => boolean = () => false): CeFaciDrax {
  const masini = a.masini.map(indicatieMasina);
  const descrescator = (xs: IndicatieMasinaDrax[]) => [...xs].sort((x, y) => y.kmSapt - x.kmSapt || x.m.localeCompare(y.m));
  const deAratat = descrescator(masini.filter((x) => x.stare === 'peste' && x.kmSapt > 0));
  const nemasurate = descrescator(masini.filter((x) => x.stare === 'nemasurata' && (x.kmSapt > 0 || nemasurataCuSemnal(x.m))));
  const doarMici = descrescator(masini.filter((x) => x.stare === 'sub' && x.kmSapt > 0));
  const sum = (k: VerdictCazDrax) => r1(masini.reduce((s, x) => s + x.km[k], 0));
  const km: KmVerdict = { ramane: sum('ramane'), mic: sum('mic'), nemasurat: sum('nemasurat') };
  const masurate = masini.filter((x) => x.stare !== 'nemasurata');
  const kmParti = {
    dimineata: r1(masurate.reduce((s, x) => s + x.parti.dimineata.kmSapt, 0)),
    seara: r1(masurate.reduce((s, x) => s + x.parti.seara.kmSapt, 0)),
  };
  // km-ii mașinii pe care nicio bucată nu-i explică nu dispar: stau separat, ca totalul să fie comparabil cu cardul
  const neexplicat = r1(-masini.reduce((s, x) => s + x.abatere, 0));
  const total = r1(km.ramane + km.mic + km.nemasurat + neexplicat);
  const card = a.economie.carduri.R1bR3;
  const suma = (xs: IndicatieMasinaDrax[]) => r1(xs.reduce((s, x) => s + x.kmSapt, 0));
  return {
    saptamina: a.saptamina, masini, deAratat, doarMici, nemasurate, km, kmParti,
    kmGrupe: { deAratat: suma(deAratat), doarMici: suma(doarMici), nemasurate: suma(nemasurate) },
    neexplicat, total, card, abatereCard: r1(total - card),
  };
}

// ─── formatări comune ──────────────────────────────────────────────────
const ZILE_SCURT = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
export const ziScurt = (z: string) => { const t = new Date(`${z}T12:00:00Z`); return `${ZILE_SCURT[t.getUTCDay()]} ${t.getUTCDate()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
/** 479 → «7 h 59 min», 45 → «45 min» */
export function durata(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
