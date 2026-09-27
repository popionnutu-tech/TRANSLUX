// Ziua unei mașini Drăxlmaier povestită simplu (ION-108, Ion 27.09: «prea complicat explicat… noi nu facem rocket science»).
// Bucățile rândului săptămânii (categoriile §5) se transformă într-o linie pe mișcare: ora, de unde → încotro, cu oameni sau gol,
// km. Bucățile care au același interval (drumul direct + ocolul pe acasă + trecerea pe la parc) sunt UN SINGUR drum al mașinii,
// deci se unesc; ce e «în plus doar pentru că a trecut pe acasă» se spune separat. Termenii tehnici nu ies în text. Funcții pure.
import type { BucataDrax, MasinaDrax, ZiDrax } from './drax-analiza';

export type TipMiscareDrax = 'cuOameni' | 'gol' | 'service' | 'deplasare' | 'necunoscut';
export interface MiscareDrax {
  ora: string; tip: TipMiscareDrax; traseu: string[]; km: number;
  /** km în plus doar pentru că mașina a trecut pe acasă (ocolul pe acasă și golul din afara zonei uzinei între tur și retur) */
  kmPeAcasa: number; parc: boolean; pranz: boolean; text: string;
}

export const UZINA = 'uzina';
const SENS = /^(.*) (tur|retur) (\S+)$/;
const r0 = (x: number) => Math.round(x);
const nr = (x: number) => r0(x).toLocaleString('ro-RO');
const sensul = (cursa: string | null | undefined) => (cursa ? SENS.exec(cursa)?.[2] ?? null : null);

/** grupuri de bucăți consecutive cu același interval orar: un grup = o mișcare a mașinii */
export function grupeInterval(bucati: BucataDrax[]): BucataDrax[][] {
  const out: BucataDrax[][] = [];
  for (const b of bucati) {
    const ultim = out[out.length - 1];
    if (ultim && ultim[0].ora === b.ora) ultim.push(b);
    else out.push([b]);
  }
  return out;
}

/** km în plus doar pentru drumul pe acasă: ocolul (peste drumul direct) și golul dintre tur și retur scos din zona uzinei */
export const kmPeAcasaBucata = (b: BucataDrax) =>
  (b.cat === 'livrare' && b.ocol ? b.km : 0) + (b.cat === 'golTure' ? b.r3fin ?? 0 : 0);

const tipGrup = (g: BucataDrax[]): TipMiscareDrax => {
  for (const t of ['cuOameni', 'service', 'deplasare', 'necunoscut'] as const) if (g.some((b) => b.cat === t)) return t;
  return 'gol';
};

// Turul se termină la poartă, returul pleacă de la poartă. Sensul cursei cu oameni se citește din golurile vecine
// (golul de dinainte are `next`, cel de după are `prev`); numele porților nu se codează.
function sensCursa(grupe: BucataDrax[][], i: number): string | null {
  const inainte = grupe[i - 1]?.find((b) => b.next)?.next;
  const dupa = grupe[i + 1]?.find((b) => b.prev)?.prev;
  return sensul(inainte) ?? sensul(dupa);
}

function locAfisat(loc: string | null, casa: string | null): string {
  if (!loc) return '?';
  return casa && loc === casa ? `acasă (${loc})` : loc;
}

function traseuGol(g: BucataDrax[], casa: string | null): string[] {
  const b = g[0];
  const de = sensul(g.find((x) => x.prev)?.prev) === 'tur' ? UZINA : locAfisat(b.de, casa);
  const pana = sensul(g.find((x) => x.next)?.next) === 'retur' ? UZINA : locAfisat(b.pana, casa);
  const acasa = g.find((x) => x.acasa && kmPeAcasaBucata(x) > 0)?.acasa ?? null;
  return acasa ? [de, `acasă (${acasa})`, pana] : [de, pana];
}

function traseuCursa(b: BucataDrax, sens: string | null): string[] {
  return [sens === 'retur' ? UZINA : b.de ?? '?', sens === 'tur' ? UZINA : b.pana ?? '?'];
}

const ETICHETA: Record<TipMiscareDrax, string> = {
  cuOameni: 'cu oameni', gol: 'gol', service: 'la service', deplasare: 'drum fără oameni, în afara liniilor', necunoscut: 'drum nelămurit',
};

export function textMiscare(x: Omit<MiscareDrax, 'text'>): string {
  const peLoc = x.traseu.length === 2 && x.traseu[0] === x.traseu[1];
  const traseu = peLoc ? `pe lângă ${x.traseu[0] === UZINA ? 'uzină' : x.traseu[0]}` : x.traseu.join(' → ');
  // ordinea opririi la parc față de drumul pe acasă nu se știe din bucăți, deci parcul nu se pune în traseu
  const eticheta = `${ETICHETA[x.tip]}${x.parc ? ', cu o oprire la parcul de lângă uzină' : ''}${x.pranz ? ', cursă de prânz' : ''}`;
  const acasa = x.kmPeAcasa >= 0.5 ? ` — din care ${nr(x.kmPeAcasa)} km doar pentru că a trecut pe acasă` : '';
  return `${x.ora} ${traseu}, ${eticheta}, ${nr(x.km)} km${acasa}`;
}

/** ziua, o linie pe mișcare, în ordine */
export function povesteZi(d: ZiDrax, casa: string | null): MiscareDrax[] {
  const grupe = grupeInterval(d.bucati);
  return grupe.map((g, i) => {
    const tip = tipGrup(g);
    const cursa = g.find((b) => b.cat === 'cuOameni');
    const baza = {
      ora: g[0].ora, tip,
      traseu: cursa ? traseuCursa(cursa, sensCursa(grupe, i)) : traseuGol(g, casa),
      km: Math.round(g.reduce((s, b) => s + b.km, 0) * 10) / 10,
      kmPeAcasa: Math.round(g.reduce((s, b) => s + kmPeAcasaBucata(b), 0) * 10) / 10,
      parc: g.some((b) => b.cat === 'parc'), pranz: g.some((b) => b.pranz),
    };
    return { ...baza, text: textMiscare(baza) };
  });
}

export interface SumarSaptamanaDrax { zile: number; zileLucrate: number; cuOameni: number; gol: number; peAcasa: number }

const kmGoiZi = (d: ZiDrax) => d.km.livrare + d.km.golRuta + d.km.golTure + d.km.parc + d.km.legatura;
/** drumul pe acasă al zilei, fără părțile scoase «de lămurit» (aceeași regulă ca R1b și R3 ai mașinii) */
const peAcasaZi = (d: ZiDrax) => d.bucati.reduce((s, b) => {
  if (b.cat === 'livrare' && d.scosDeLamurit?.R1b) return s;
  if (b.cat === 'golTure' && d.scosDeLamurit?.R3) return s;
  return s + kmPeAcasaBucata(b);
}, 0);

/**
 * «Săptămâna asta»: km din GPS pe zilele măsurate, fără extrapolare — aceleași zile din care vin cifrele tabelului, ca
 * drumul pe acasă să fie R1b + R3 măsurați. Fără nicio zi măsurată se iau toate zilele.
 */
export function sumarSaptamana(m: MasinaDrax): SumarSaptamanaDrax {
  const masurate = m.detalii.filter((d) => d.economie && !d.exclus);
  const zile = masurate.length ? masurate : m.detalii;
  const suma = (f: (d: ZiDrax) => number) => r0(zile.reduce((s, d) => s + f(d), 0));
  return { zile: masurate.length, zileLucrate: m.zile, cuOameni: suma((d) => d.km.cuOameni), gol: suma(kmGoiZi), peAcasa: suma(peAcasaZi) };
}

/** cifra mașinii (gol din cauza drumului acasă între curse), dată din afară ca să fie aceeași ca în frază și în tabel */
export interface CifraMasinaDrax { kmSapt: number; parti: Record<'dimineata' | 'seara', { kmZi: number; kmSapt: number }> }

/** în locul rândului «Măsurat…»: ce a mers mașina în zilele măsurate și cifra ei, pe dimineață și seară */
export function frazaSaptamana(m: MasinaDrax, cifra: CifraMasinaDrax): string {
  const s = sumarSaptamana(m);
  const cand = !s.zile ? 'Nicio zi măsurată; pe toate zilele'
    : s.zile === s.zileLucrate ? 'Săptămâna asta' : `În cele ${s.zile} zile măsurate din ${s.zileLucrate}`;
  const parti = (['dimineata', 'seara'] as const).filter((p) => cifra.parti[p].kmSapt >= 0.5)
    .map((p) => `${p === 'dimineata' ? 'dimineața' : 'seara'} ≈ ${nr(cifra.parti[p].kmZi)} km`);
  const acasa = cifra.kmSapt >= 0.5
    ? `Drumul acasă între curse: ${parti.join(', ')} pe zi (${nr(cifra.kmSapt)} pe săptămână).`
    : 'Între curse nu merge acasă.';
  return `${cand}: ${nr(s.cuOameni)} km cu oameni, ${nr(s.gol)} km goi. ${acasa}`;
}
