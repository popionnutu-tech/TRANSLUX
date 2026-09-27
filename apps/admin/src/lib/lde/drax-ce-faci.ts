// «Ce faci săptămâna asta» la Drăxlmaier Bălți (ION-105, Ion 27.09: «nu este clar cum de optimizat»). Cifrele R1b și R3 ale
// rândului săptămânii se traduc în indicații pentru dispecer: din bucățile «ocol pe acasă» (R1b) și «gol între ture» (R3)
// ale fiecărei zile măsurate se face câte un CAZ pe tipar (aceeași cursă-sfârșit → aceeași cursă-început, același sat), cu
// zilele în care se repetă, orele, satul și unde ar trebui să aștepte mașina. Nimic nu se socotește din nou: km-ii sunt ai
// bucăților, extrapolați pe mașină la fel ca în worker (km măsurați × zile lucrate / zile măsurate), deci Σ cazurilor unei
// mașini = R1b + R3 extrapolați. Funcții pure, fără bază.
//
// ION-107 (Ion, 27.09, la 345KAJ): «să aștepte la uzină» ascundea 8 h de stat, iar un ocol de ~20 km/zi pe drumul care trece
// oricum pe lângă casă nu merită o dispoziție. Fiecare caz primește deci un VERDICT:
//   mic       — ocolul sub 20 km/zi, sau mașina sub pragul §12.2 (R1b + R3 < 100 km/săpt. ori < 3 zile măsurate);
//   schimb    — așteptarea propusă > 3 h: nu e o așteptare realistă; mașina face linii în capete diferite și câștigul vine
//               din repartizarea liniilor între mașini, nu din așteptare («candidat de schimb de linii»);
//   realist   — restul: așteptare ≤ 3 h și ≥ 20 km/zi; doar acestea sunt indicații «să aștepte».
// «mic» bate «schimb» (un schimb de linii pentru câțiva km nu e o propunere). realist + schimb + mic = R1b + R3, pe mașină și pe
// flotă, deci cardul «se poate tăia cu o dispoziție» se desparte în trei fără să piardă vreun km.
import { MIN_ZILE_MASURATE, PRAG_INDICATII_KM, type AnalizaDrax, type BucataDrax, type MasinaDrax, type ZiDrax } from './drax-analiza';

export type TipCazDrax = 'ocol' | 'ture';
export type SensCursa = 'tur' | 'retur';
export type VerdictCazDrax = 'realist' | 'schimb' | 'mic';
/** turul se termină la poartă, returul pleacă de la poartă; celălalt capăt e satul liniei */
export type LocDrax = { tip: 'uzina' } | { tip: 'capat'; sat: string | null };
export interface CursaVecina { lin: string; sens: SensCursa | null }
export interface ZiCazDrax { z: string; ora: string; km: number; asteptareMin: number }
export interface CazDrax {
  tip: TipCazDrax; verdict: VerdictCazDrax;
  dupa: CursaVecina | null; inainte: CursaVecina | null;
  termina: string; revine: string; asteptareMin: number;
  locSfarsit: LocDrax; locInceput: LocDrax; acasa: string | null; asteapta: LocDrax;
  zile: ZiCazDrax[]; kmZi: number; kmSapt: number; lei: number | null;
}
export type KmVerdict = Record<VerdictCazDrax, number>;
export interface IndicatieMasinaDrax {
  m: string; zileMasurate: number; zileLucrate: number; casa: string | null; deLamurit: string | null;
  R1a: number; R1b: number; R3: number; R1bR3: number; pestePrag: boolean;
  cazuri: CazDrax[]; km: KmVerdict; kmCazuri: number; abatere: number; lei: number | null;
}
export interface CeFaciDrax {
  masini: IndicatieMasinaDrax[];
  /** mașinile cu cel puțin o indicație realistă, descrescător după km realiști */
  cuIndicatie: IndicatieMasinaDrax[];
  /** cazurile «schimb de linii», descrescător după km */
  candidatiSchimb: { m: string; caz: CazDrax }[];
  km: KmVerdict;
  /** R1b + R3 fără bucăți care să-l explice (Σ abaterilor pe mașini); normal 0 — pagina îl arată în roșu */
  neexplicat: number;
  total: number; card: number; abatereCard: number;
}

/** toleranța controalelor (km/săpt.): rotunjirile la 0,1 km pe bucată și pe zi */
export const TOLERANTA_KM = 1;
/** peste atât, «să aștepte» nu mai e o indicație realistă (ION-107) */
export const PRAG_ASTEPTARE_MIN = 180;
/** sub atât pe zi, ocolul nu merită o dispoziție (ION-107) */
export const PRAG_KM_ZI = 20;

const r1 = (x: number) => Math.round(x * 10) / 10;
const kmR1bR3 = (m: MasinaDrax) => r1((m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0));

// ─── cursele vecine: «R3|Recea* retur s1» → linia și sensul ────────────────
export function parseCursa(x: string | null | undefined): CursaVecina | null {
  if (!x) return null;
  const p = /^(.*) (\S+) (\S+)$/.exec(x);
  if (!p) return { lin: x, sens: null };
  const sens = p[2] === 'tur' || p[2] === 'retur' ? p[2] : null;
  return { lin: p[1], sens };
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

// ─── orele și așteptarea: capetele golului = sfârșitul cursei și începutul următoarei ──
const capete = (ora: string) => ora.split('–');
function mediana<T>(xs: T[], cmp: (a: T, b: T) => number): T {
  const s = [...xs].sort(cmp);
  return s[Math.floor((s.length - 1) / 2)];
}
const minute = (b: BucataDrax) => Math.round((b.t1 - b.t0) / 60e3);

export function verdictCaz(c: { kmZi: number; asteptareMin: number }, masinaPestePrag: boolean): VerdictCazDrax {
  if (!masinaPestePrag || c.kmZi < PRAG_KM_ZI) return 'mic';
  return c.asteptareMin > PRAG_ASTEPTARE_MIN ? 'schimb' : 'realist';
}

function construiesteCaz(grup: BucataCaz[], factor: number, leiPeKm: number | null, masinaPestePrag: boolean): CazDrax {
  const { tip, b } = grup[0];
  const dupa = parseCursa(b.prev), inainte = parseCursa(b.next);
  const kmMasurat = grup.reduce((a, x) => a + x.km, 0);
  const inceput = locInceput(inainte, b.pana);
  const kmSapt = r1(kmMasurat * factor), kmZi = r1(kmMasurat / grup.length);
  const asteptareMin = mediana(grup.map((x) => minute(x.b)), (p, q) => p - q);
  return {
    tip, verdict: verdictCaz({ kmZi, asteptareMin }, masinaPestePrag), dupa, inainte,
    termina: mediana(grup.map((x) => capete(x.b.ora)[0]), (p, q) => p.localeCompare(q)),
    revine: mediana(grup.map((x) => capete(x.b.ora)[1] ?? ''), (p, q) => p.localeCompare(q)), asteptareMin,
    locSfarsit: locSfarsit(dupa, b.de), locInceput: inceput, acasa: b.acasa ?? null,
    // ocolul: așteaptă unde pleacă următoarea cursă (drumul direct până acolo rămâne); golul perechii: lângă uzină
    asteapta: tip === 'ture' ? { tip: 'uzina' } : inceput,
    zile: grup.map((x) => ({ z: x.z, ora: x.b.ora, km: r1(x.km), asteptareMin: minute(x.b) })),
    kmZi, kmSapt, lei: leiPeKm == null ? null : Math.round(kmSapt * leiPeKm),
  };
}

/** mașina primește indicații: ≥ 3 zile măsurate și R1b + R3 ≥ 100 km/săpt. (§12.2, aceeași regulă ca worker-ul) */
export const pestePrag = (m: MasinaDrax) => m.zileIncluse >= MIN_ZILE_MASURATE && kmR1bR3(m) >= PRAG_INDICATII_KM;

/** cazurile unei mașini, descrescător după km pe săptămână */
export function cazuriMasina(m: MasinaDrax): CazDrax[] {
  if (!m.zileIncluse) return [];
  const factor = m.zile / m.zileIncluse;
  const B = m.extrapolat.B ?? 0;
  const leiPeKm = !m.normaLipsa && m.lei.extrapolat != null && B > 0 ? m.lei.extrapolat / B : null;
  const peste = pestePrag(m);
  const grupuri = new Map<string, BucataCaz[]>();
  for (const x of zileMasurate(m).flatMap(bucatiCaz)) {
    const k = cheieTipar(x);
    grupuri.set(k, [...(grupuri.get(k) ?? []), x]);
  }
  return [...grupuri.values()].map((g) => construiesteCaz(g, factor, leiPeKm, peste)).sort((a, b) => b.kmSapt - a.kmSapt);
}

const kmPeVerdict = (cazuri: CazDrax[]): KmVerdict => {
  const k: KmVerdict = { realist: 0, schimb: 0, mic: 0 };
  for (const c of cazuri) k[c.verdict] += c.kmSapt;
  return { realist: r1(k.realist), schimb: r1(k.schimb), mic: r1(k.mic) };
};

export function indicatieMasina(m: MasinaDrax): IndicatieMasinaDrax {
  const cazuri = cazuriMasina(m);
  const kmCazuri = r1(cazuri.reduce((a, c) => a + c.kmSapt, 0));
  const R1bR3 = kmR1bR3(m);
  const realiste = cazuri.filter((c) => c.verdict === 'realist');
  const lei = realiste.some((c) => c.lei != null) ? realiste.reduce((a, c) => a + (c.lei ?? 0), 0) : null;
  return {
    m: m.m, zileMasurate: m.zileIncluse, zileLucrate: m.zile, casa: m.casa, deLamurit: m.deLamurit,
    R1a: m.extrapolat.R1a ?? 0, R1b: m.extrapolat.R1b ?? 0, R3: m.extrapolat.R3 ?? 0, R1bR3, pestePrag: pestePrag(m),
    cazuri, km: kmPeVerdict(cazuri), kmCazuri, abatere: r1(kmCazuri - R1bR3), lei,
  };
}

export function ceFaciDrax(a: AnalizaDrax): CeFaciDrax {
  const masini = a.masini.map(indicatieMasina);
  const cuIndicatie = masini.filter((x) => x.km.realist > 0).sort((x, y) => y.km.realist - x.km.realist);
  const candidatiSchimb = masini.flatMap((x) => x.cazuri.filter((c) => c.verdict === 'schimb').map((caz) => ({ m: x.m, caz })))
    .sort((p, q) => q.caz.kmSapt - p.caz.kmSapt);
  const sum = (k: VerdictCazDrax) => r1(masini.reduce((s, x) => s + x.km[k], 0));
  const km: KmVerdict = { realist: sum('realist'), schimb: sum('schimb'), mic: sum('mic') };
  // km-ii mașinii pe care nicio bucată nu-i explică nu dispar: stau separat, ca totalul să fie comparabil cu cardul
  const neexplicat = r1(-masini.reduce((s, x) => s + x.abatere, 0));
  const total = r1(km.realist + km.schimb + km.mic + neexplicat);
  const card = a.economie.carduri.R1bR3;
  return { masini, cuIndicatie, candidatiSchimb, km, neexplicat, total, card, abatereCard: r1(total - card) };
}

// ─── textul ──────────────────────────────────────────────────────────────
const ZILE_SCURT = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
export const ziScurt = (z: string) => { const t = new Date(`${z}T12:00:00Z`); return `${ZILE_SCURT[t.getUTCDay()]} ${t.getUTCDate()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');
export const numeLinieDrax = (lin: string) => lin.split('|').join(' · ');
const numeCursa = (c: CursaVecina | null) => (c ? `${numeLinieDrax(c.lin)}${c.sens ? ` (${c.sens})` : ''}` : 'cursa precedentă');
export const laLoc = (l: LocDrax) => (l.tip === 'uzina' ? 'la uzină' : `la capătul ${l.sat ?? 'liniei'}`);
/** 479 → «7 h 59 min», 45 → «45 min» */
export function durata(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

function ceFace(c: CazDrax): string {
  if (c.tip === 'ture') {
    return `după ${numeCursa(c.dupa)} care ajunge ${laLoc(c.locSfarsit)} la ${c.termina}, pleacă ${c.acasa ? `la ${c.acasa}` : 'din zona uzinei'} și revine la ${c.revine} pentru ${numeCursa(c.inainte)}`;
  }
  return `după ${numeCursa(c.dupa)} care se termină la ${c.termina} ${laLoc(c.locSfarsit)}, pleacă acasă ${c.acasa ? `la ${c.acasa}` : 'la locul nopții'} și revine la ${c.revine} ${laLoc(c.locInceput)} pentru ${numeCursa(c.inainte)}`;
}
const castig = (c: CazDrax) => `≈ ${nr(c.kmZi)} km/zi (${nr(c.kmSapt)} km/săpt.${c.lei != null ? `, ≈ ${nr(c.lei)} lei` : ''})`;

/** o frază pentru dispecer: când, de unde, încotro, cât ar sta și cât se taie; formularea depinde de verdict */
export function textCaz(c: CazDrax): string {
  const zile = c.zile.map((x) => ziScurt(x.z)).join(', ');
  const cat = durata(c.asteptareMin);
  if (c.verdict === 'schimb') {
    const motiv = c.dupa && c.inainte && c.dupa.lin === c.inainte.lin
      ? 'mașina face aceeași linie pe două ture; câștigul vine din repartizarea turelor între mașini, nu din așteptare'
      : 'mașina face linii în capete diferite; câștigul vine din repartizarea liniilor, nu din așteptare';
    return `${zile}: ${ceFace(c)} — ar sta ${cat}. Candidat de schimb de linii: ${motiv} — ${castig(c)}.`;
  }
  if (c.verdict === 'mic') return `${zile}: ${ceFace(c)} (${cat} între curse) — mic, sub prag: ${castig(c)}; nu merită o dispoziție.`;
  const asteapta = c.tip === 'ture' ? 'la uzină (în parc)' : laLoc(c.asteapta);
  return `${zile}: ${ceFace(c)}. Să aștepte ${asteapta} ${cat} (${c.termina}–${c.revine}) — se taie ${castig(c)}.`;
}

/** R1a e doar informație: marginile zilei se taie numai cu alt șofer */
export function textR1a(x: IndicatieMasinaDrax): string | null {
  if (x.R1a < 0.5) return null;
  return `Informativ: drumul de acasă${x.casa ? ` (${x.casa})` : ''} la prima cursă și seara înapoi — ${nr(x.R1a)} km/săpt.; un șofer din satul de start ar tăia ≈ ${nr(x.R1a)} km.`;
}
