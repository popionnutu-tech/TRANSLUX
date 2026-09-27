// «Ce faci săptămâna asta» la Drăxlmaier Bălți (ION-105, Ion 27.09: «nu este clar cum de optimizat»). Cifrele R1b și R3 ale
// rândului săptămânii se traduc în indicații pentru dispecer: din bucățile «ocol pe acasă» (R1b) și «gol între ture» (R3)
// ale fiecărei zile măsurate se face câte un CAZ pe tipar (aceeași cursă-sfârșit → aceeași cursă-început, același sat), cu
// zilele în care se repetă, orele, satul și unde ar trebui să aștepte mașina. Nimic nu se socotește din nou: km-ii sunt ai
// bucăților, extrapolați pe mașină la fel ca în worker (km măsurați × zile lucrate / zile măsurate), deci Σ cazurilor unei
// mașini = R1b + R3 extrapolați, iar Σ secțiunii = cardul «se poate tăia cu o dispoziție». Funcții pure, fără bază.
import { MIN_ZILE_MASURATE, PRAG_INDICATII_KM, type AnalizaDrax, type BucataDrax, type MasinaDrax, type ZiDrax } from './drax-analiza';

export type TipCazDrax = 'ocol' | 'ture';
export type SensCursa = 'tur' | 'retur';
/** turul se termină la poartă, returul pleacă de la poartă; celălalt capăt e satul liniei */
export type LocDrax = { tip: 'uzina' } | { tip: 'capat'; sat: string | null };
export interface CursaVecina { lin: string; sens: SensCursa | null }
export interface ZiCazDrax { z: string; ora: string; km: number }
export interface CazDrax {
  tip: TipCazDrax;
  dupa: CursaVecina | null; inainte: CursaVecina | null;
  termina: string; revine: string;
  locSfarsit: LocDrax; locInceput: LocDrax; acasa: string | null; asteapta: LocDrax;
  zile: ZiCazDrax[]; kmZi: number; kmSapt: number; lei: number | null;
}
export interface IndicatieMasinaDrax {
  m: string; zileMasurate: number; zileLucrate: number; casa: string | null; deLamurit: string | null;
  R1a: number; R1b: number; R3: number; R1bR3: number;
  cazuri: CazDrax[]; kmCazuri: number; abatere: number; lei: number | null;
}
export interface CeFaciDrax {
  pestePrag: IndicatieMasinaDrax[];
  subPrag: { masini: number; km: number };
  total: number; card: number; abatereCard: number;
}

/** toleranța controalelor (km/săpt.): rotunjirile la 0,1 km pe bucată și pe zi */
export const TOLERANTA_KM = 1;

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

// ─── orele: «16:17–00:16» → mediana capetelor pe zilele tiparului ──────────
const capete = (ora: string) => ora.split('–');
function mediana(ore: string[]): string {
  const s = [...ore].sort();
  return s[Math.floor((s.length - 1) / 2)] ?? '';
}

function construiesteCaz(grup: BucataCaz[], factor: number, leiPeKm: number | null): CazDrax {
  const { tip, b } = grup[0];
  const dupa = parseCursa(b.prev), inainte = parseCursa(b.next);
  const kmMasurat = grup.reduce((a, x) => a + x.km, 0);
  const inceput = locInceput(inainte, b.pana);
  const kmSapt = r1(kmMasurat * factor);
  return {
    tip, dupa, inainte,
    termina: mediana(grup.map((x) => capete(x.b.ora)[0])), revine: mediana(grup.map((x) => capete(x.b.ora)[1] ?? '')),
    locSfarsit: locSfarsit(dupa, b.de), locInceput: inceput, acasa: b.acasa ?? null,
    // ocolul: așteaptă unde pleacă următoarea cursă (drumul direct până acolo rămâne); golul perechii: lângă uzină
    asteapta: tip === 'ture' ? { tip: 'uzina' } : inceput,
    zile: grup.map((x) => ({ z: x.z, ora: x.b.ora, km: r1(x.km) })),
    kmZi: r1(kmMasurat / grup.length), kmSapt, lei: leiPeKm == null ? null : Math.round(kmSapt * leiPeKm),
  };
}

/** cazurile unei mașini, descrescător după km pe săptămână */
export function cazuriMasina(m: MasinaDrax): CazDrax[] {
  if (!m.zileIncluse) return [];
  const factor = m.zile / m.zileIncluse;
  const B = m.extrapolat.B ?? 0;
  const leiPeKm = !m.normaLipsa && m.lei.extrapolat != null && B > 0 ? m.lei.extrapolat / B : null;
  const grupuri = new Map<string, BucataCaz[]>();
  for (const x of zileMasurate(m).flatMap(bucatiCaz)) {
    const k = cheieTipar(x);
    grupuri.set(k, [...(grupuri.get(k) ?? []), x]);
  }
  return [...grupuri.values()].map((g) => construiesteCaz(g, factor, leiPeKm)).sort((a, b) => b.kmSapt - a.kmSapt);
}

export function indicatieMasina(m: MasinaDrax): IndicatieMasinaDrax {
  const cazuri = cazuriMasina(m);
  const kmCazuri = r1(cazuri.reduce((a, c) => a + c.kmSapt, 0));
  const R1bR3 = kmR1bR3(m);
  const lei = cazuri.some((c) => c.lei != null) ? cazuri.reduce((a, c) => a + (c.lei ?? 0), 0) : null;
  return {
    m: m.m, zileMasurate: m.zileIncluse, zileLucrate: m.zile, casa: m.casa, deLamurit: m.deLamurit,
    R1a: m.extrapolat.R1a ?? 0, R1b: m.extrapolat.R1b ?? 0, R3: m.extrapolat.R3 ?? 0, R1bR3,
    cazuri, kmCazuri, abatere: r1(kmCazuri - R1bR3), lei,
  };
}

/** mașina primește indicație: ≥ 3 zile măsurate și R1b + R3 ≥ 100 km/săpt. (§12.2, aceeași regulă ca worker-ul) */
export const pestePrag = (m: MasinaDrax) => m.zileIncluse >= MIN_ZILE_MASURATE && kmR1bR3(m) >= PRAG_INDICATII_KM;

export function ceFaciDrax(a: AnalizaDrax): CeFaciDrax {
  const peste = a.masini.filter(pestePrag).map(indicatieMasina).sort((x, y) => y.R1bR3 - x.R1bR3);
  const sub = a.masini.filter((m) => !pestePrag(m));
  const subKm = r1(sub.reduce((s, m) => s + kmR1bR3(m), 0));
  const total = r1(peste.reduce((s, x) => s + x.kmCazuri, 0) + subKm);
  const card = a.economie.carduri.R1bR3;
  return { pestePrag: peste, subPrag: { masini: sub.length, km: subKm }, total, card, abatereCard: r1(total - card) };
}

// ─── textul ──────────────────────────────────────────────────────────────
const ZILE_SCURT = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
export const ziScurt = (z: string) => { const t = new Date(`${z}T12:00:00Z`); return `${ZILE_SCURT[t.getUTCDay()]} ${t.getUTCDate()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');
export const numeLinieDrax = (lin: string) => lin.split('|').join(' · ');
const numeCursa = (c: CursaVecina | null) => (c ? `${numeLinieDrax(c.lin)}${c.sens ? ` (${c.sens})` : ''}` : 'cursa precedentă');
export const laLoc = (l: LocDrax) => (l.tip === 'uzina' ? 'la uzină' : `la capătul ${l.sat ?? 'liniei'}`);

/** o frază pentru dispecer: când, de unde, încotro, unde să aștepte și cât se taie */
export function textCaz(c: CazDrax): string {
  const zile = c.zile.map((x) => ziScurt(x.z)).join(', ');
  const ce = c.tip === 'ture'
    ? `după ${numeCursa(c.dupa)} care ajunge ${laLoc(c.locSfarsit)} la ${c.termina}, pleacă ${c.acasa ? `la ${c.acasa}` : 'din zona uzinei'} și revine la ${c.revine} pentru ${numeCursa(c.inainte)}`
    : `după ${numeCursa(c.dupa)} care se termină la ${c.termina} ${laLoc(c.locSfarsit)}, pleacă acasă ${c.acasa ? `la ${c.acasa}` : 'la locul nopții'} și revine la ${c.revine} ${laLoc(c.locInceput)} pentru ${numeCursa(c.inainte)}`;
  const asteapta = c.tip === 'ture' ? 'la uzină (în parc)' : laLoc(c.asteapta);
  const lei = c.lei != null ? `, ≈ ${nr(c.lei)} lei` : '';
  return `${zile}: ${ce}. Să aștepte ${asteapta} — se taie ≈ ${nr(c.kmZi)} km/zi (${nr(c.kmSapt)} km/săpt.${lei}).`;
}

/** R1a e doar informație: marginile zilei se taie numai cu alt șofer */
export function textR1a(x: IndicatieMasinaDrax): string | null {
  if (x.R1a < 0.5) return null;
  return `Informativ: drumul de acasă${x.casa ? ` (${x.casa})` : ''} la prima cursă și seara înapoi — ${nr(x.R1a)} km/săpt.; un șofer din satul de start ar tăia ≈ ${nr(x.R1a)} km.`;
}
