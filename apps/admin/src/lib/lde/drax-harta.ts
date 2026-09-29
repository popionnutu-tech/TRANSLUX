// Harta unei mașini Drăxlmaier pe o zi (ION-130). Ion, 28.09.2026: «ar fi bine să putem fiecare mașină s-o vizualizăm pe schelet,
// să fie o pagină separată în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă».
// Rândul îl scrie VPS-ul (drax/cod/saptamanal/harta-zi.mjs) în lde_harta_zi; aici doar tipurile și funcțiile pure ale paginii.
import type { ZiDrax } from './drax-analiza';
import type { DrumPropus, LocParcare, ZiParcare } from './drax-parcare';

export type Punct = [number, number];
/** tipul intervalului: cursă cu oameni, gol, muncă (între uzine / deplasare / service), la uzină (parc, gol între ture) */
export type TipInterval = 'cursa' | 'gol' | 'munca' | 'uzina';

export interface IntervalHarta {
  ora: string; t0: number; t1: number; tip: TipInterval; cats: Record<string, number>; km: number;
  de: string | null; pana: string | null; ocol: boolean; lin: string | null; prelungit: string | null;
  /** urma simplificată: [lat, lon, secunde de la începutul zilei] */
  s: [number, number, number][];
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
  parcare?: { locuri: LocParcare[]; economieSapt: number; idealSapt: number | null; zi: ZiParcare | null; legi: DrumPropus[] } | null;
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
}
export interface RandListaHarta { m: string; z: string; sumar: SumarZiHarta }

/** linia din schelet sub urma mașinii */
export interface LinieSchelet { id: string; capat: string | null; plin: Punct[]; sate: { n: string; c: Punct }[] }

export const CULOARE: Record<TipInterval, string> = { cursa: '#1D6B6B', gol: '#B3261E', munca: '#2F5DA8', uzina: '#8A7F72' };
export const LINIE: Record<TipInterval, string | undefined> = { cursa: undefined, gol: '8 6', munca: '2 6', uzina: '4 5' };
export const NUME_TIP: Record<TipInterval, string> = { cursa: 'cu oameni', gol: 'gol', munca: 'între uzine / service', uzina: 'lângă uzină' };

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
  for (const l of zi.parcare?.locuri ?? []) pts.push(l.c);   // ION-136: locurile de parcare propuse rămân în cadru
  if (pts.length < 2) for (const l of linii) pts.push(...l.plin);
  if (pts.length < 2) return null;
  const la = pts.map((p) => p[0]), lo = pts.map((p) => p[1]);
  return [[Math.min(...la), Math.min(...lo)], [Math.max(...la), Math.max(...lo)]];
}
