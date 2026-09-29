// Parcarea propusă a mașinilor Drăxlmaier (ION-136, 29.09.2026) — în locul «zilei ideale» (maximul teoretic). Ion: «hai maximele teoretice să le scoatem,
// ele nu pot fi realizate în realitate … poți oferi 2 locuri propuneri, pe hartă ele să fie evidențiate clar».
// Rândul îl scrie VPS-ul (drax/cod/saptamanal/parcare.mjs + scrie-parcare.mjs) în date.parcare; aici doar tipurile și funcțiile pure.

export type Punct = [number, number];
/** pref: 2 = mașina deja stă aici ≥ 60 min, 1 = oraș, 0 = sat */
export interface LocParcare { nr: number; n: string; fel: 'village' | 'town' | 'city' | 'parc' | 'casa' | string; c: Punct; drumuri: number; pref?: number }
export interface ZiParcare { z: string; masurata: boolean; motiv: string | null; real: number | null; propus: number | null; economie: number | null }
export interface MasinaParcare {
  m: string; locuri: LocParcare[]; unLoc: { n: string; kmSapt: number } | null; doiLocuri: { n: string[]; kmSapt: number; castig: number } | null;
  /** de ce mașina n-are loc propus (nicio zi măsurată, lista separată, propunerea nu scade km) */
  motivFara?: string | null;
  /** câștigul celui de-al doilea loc față de cel mai bun loc unic (km/săpt., adus la 5 zile) */
  castigAlDoilea?: number | null;
  zileMasurate: number; zileLV: number; real: number; propus: number; economieMasurata: number; economieSapt: number; idealSapt: number | null;
  zile: ZiParcare[];
}
export interface ParcareDrax {
  versiune: string; rulat: string;
  parametri: { ACELASI_KM: number; RAZA_CAND: number; PRAG_AL_DOILEA: number; MIN_DRUMURI?: number; TOLERANTA?: number; VAL_F: number };
  flota: { masini: number; economieMasurata: number; economieSapt: number; idealSapt: number; doiLocuri: number; pestePrag: number; faraPropunere?: string[] };
  masini: MasinaParcare[];
}
/** un drum propus pe hartă: de la capătul cursei la locul de parcare și de acolo la plecarea următoare */
export interface DrumPropus {
  z: string; zUrm: string | null; parte: 'intre' | 'noapte'; ora: string | null; oraDim: string | null;
  a: Punct; b: Punct; aN: string | null; bN: string | null; loc: number; km: number; separat: boolean; seara?: boolean; dimineata?: boolean;
}

/** eticheta locului, ex. «P1 · Ilenuța», «P2 · acasă (Ciuciulea)» */
export const etichetaLoc = (l: Pick<LocParcare, 'nr' | 'n'>) => `P${l.nr} · ${l.n}`;

export const CULOARE_LOC = ['#E8590C', '#7B2CBF'] as const;
export const culoareLoc = (nr: number) => CULOARE_LOC[(nr - 1) % CULOARE_LOC.length];

/** textul propunerii pentru o mașină */
export function textPropunere(x: Pick<MasinaParcare, 'locuri'>): string {
  if (!x.locuri.length) return 'fără propunere';
  if (x.locuri.length === 1) return `parcare la ${x.locuri[0].n}`;
  return `parcare la ${x.locuri[0].n} sau ${x.locuri[1].n} (după cursă)`;
}

/** mașinile pentru tabel: cele cu km de tăiat întâi */
export const randuriParcare = (p: ParcareDrax) => [...p.masini].sort((a, b) => b.economieSapt - a.economieSapt || a.m.localeCompare(b.m));
