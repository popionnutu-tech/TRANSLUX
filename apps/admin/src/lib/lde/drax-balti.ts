// «Dorm în Bălți — livrarea de analizat» (ION-109, Ion 27.09: «mașina care doarme la Bălți, fie la uzină, fie lângă uzină la om
// acasă — trebuie de analizat livrările tot»; §7.4, §8.6, §12.1 după migrația 413). Bloc SEPARAT de «Ce faci» (nu e indicație
// pentru dispecer): pe fiecare mașină cu casa la ≤ 3 km de poartă, drumul gol casă ↔ capăt (R1a) în km pe săptămână, și zilele cu
// o cursă probabil nedetectată (ziua iese din măsurare, §8.6). Doar km, fără lei. Funcții pure.
import type { AnalizaDrax, MasinaDrax } from './drax-analiza';

export const ZONA_BALTI_KM = 3;
const MOTIV_NEDETECTATA = 'cursa probabil nedetectata la poarta';

export interface RandBalti {
  m: string; casa: string | null; kmPoarta: number; linie: string | null;
  r1a: number | null; zileMasurate: number; zile: number;
  /** zilele scoase din măsurare pentru o cursă probabil nedetectată: ziua + ce s-a văzut («tur 06:04») */
  nedetectate: { z: string; ce: string }[];
}

const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');
const n1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');

function nedetectate(m: MasinaDrax): RandBalti['nedetectate'] {
  return m.detalii
    .filter((d) => d.exclus?.startsWith(MOTIV_NEDETECTATA))
    .map((d) => ({ z: d.z, ce: (d.exclus ?? '').slice(MOTIV_NEDETECTATA.length).replace(/^\s*\(|\)\s*$/g, '') }));
}

/** liniile pe care mașina face cel puțin 20 % din km-ii ei cu rută (186OMM: R4 dimineața, R3 seara) */
function liniiMasina(m: MasinaDrax): string | null {
  const tot = m.rute.reduce((a, r) => a + r.km, 0);
  const l = [...m.rute].sort((x, y) => y.km - x.km).filter((r, i) => i === 0 || r.km >= 0.2 * tot).map((r) => r.nume ?? r.r);
  return l.length ? l.join(' și ') : null;
}

export function dormBalti(a: AnalizaDrax): RandBalti[] {
  return a.masini
    .filter((m) => m.casaKmPoarta != null && m.casaKmPoarta <= ZONA_BALTI_KM)
    .map((m) => ({
      m: m.m, casa: m.casa, kmPoarta: m.casaKmPoarta as number,
      linie: liniiMasina(m),
      r1a: m.extrapolat.R1a ?? null, zileMasurate: m.zileIncluse, zile: m.zile, nedetectate: nedetectate(m),
    }))
    .filter((r) => (r.r1a ?? 0) >= 0.5 || r.nedetectate.length > 0)
    .sort((x, y) => (y.r1a ?? -1) - (x.r1a ?? -1) || x.m.localeCompare(y.m));
}

export const INTRO_BALTI = 'Mașinile care dorm în Bălți — la uzină, în parc sau acasă la cel mult 3 km de poartă — fac drum gol până la capătul '
  + 'liniei și înapoi. Nu e o dispoziție pentru dispecer: drumul se taie doar dacă mașina doarme la capăt sau șoferul e din sat.';

/** o frază pe mașină, doar km */
export function textBalti(r: RandBalti): string {
  const unde = `${r.m} doarme la ${r.casa ?? 'un loc neștiut'} (${n1(r.kmPoarta)} km de poartă)`;
  // pe sens: ora primei apariții și în câte zile (744ARF: tur 5 zile, retur 1 zi)
  const pe = new Map<string, { ora: string; zile: number }>();
  for (const x of r.nedetectate) for (const q of x.ce.split(', ')) { const [sens, ora] = q.split(' '); const e = pe.get(sens) ?? pe.set(sens, { ora, zile: 0 }).get(sens)!; e.zile++; }
  const ce = [...pe].map(([sens, e]) => `${sens} pe la ${e.ora}, ${e.zile} ${e.zile === 1 ? 'zi' : 'zile'}`).join('; ');
  const nev = r.nedetectate.length;
  if (r.r1a == null || r.zileMasurate === 0) {
    return `${unde}. În ${nev} ${nev === 1 ? 'zi' : 'zile'} din ${r.zile} face probabil o cursă cu oameni pe care analiza n-o vede (${ce}): `
      + 'livrarea se măsoară abia după ce se lămurește ce cursă e (analiza n-o leagă de nicio linie).';
  }
  const linie = r.linie ? `, ${r.linie.includes(' și ') ? 'liniile' : 'linia'} ${r.linie}` : '';
  const putine = r.zileMasurate < 3 ? ` (extrapolare din doar ${r.zileMasurate} ${r.zileMasurate === 1 ? 'zi măsurată' : 'zile măsurate'})` : '';
  const plus = nev ? ` Plus ${nev} ${nev === 1 ? 'zi' : 'zile'} cu o cursă probabil nevăzută de analiză (${ce}), scoase din măsurare.` : '';
  return `${unde}${linie}: drumul gol până la capăt și înapoi ≈ ${nr(r.r1a)} km pe săptămână${putine}.${plus}`;
}
