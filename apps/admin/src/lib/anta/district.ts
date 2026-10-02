// Raionul fiecărei opriri dintr-o cursă ANTA (Concurența pe direcție, ION-12).
//
// Fișierul ANTA n-are raioane, iar multe nume se repetă (Briceni oraș în r. Briceni ≠ Briceni sat în
// r. Dondușeni; Chetrosu în Anenii Noi și în Drochia; Costești în Rîșcani, Ialoveni și Hîncești).
// Regulile, în ordine:
//   1. numele există într-un singur raion → acela;
//   2. «or. X» / «mun. X» unde X e numele unui raion → de regulă raionul X (orașul = centrul de raion); dar
//      ANTA scrie «or.» și la sate cu nume de oraș (ION-185: «or. Briceni» între Moșana și Sauca e satul Briceni
//      din Dondușeni), așa că dacă există și sate X cu coordonate, geometria (3) decide: satul câștigă doar
//      când e clar mai aproape de vecini (suma distanțelor sub jumătate din a orașului și cu ≥ 20 km mai mică);
//      fără vecini cu coordonate rămâne orașul;
//   3. geometrie: dintre candidați îl luăm pe cel cu suma distanțelor cea mai mică până la cei mai
//      apropiați vecini deja rezolvați de pe cursă (înainte și după, după coordonate);
//   4. fără coordonate: raionul celui mai apropiat vecin (pe listă) care e printre candidați;
//   5. altfel null. Intersecțiile («X (intersecție)», «Intersectia X») rămân mereu null.
// Se repetă de câteva ori, ca o oprire rezolvată să-i ajute pe vecinii ei.

import { foldName, splitPrefix } from './names';

export interface LocalityRow {
  name: string;
  district: string;
  lat: number | null;
  lon: number | null;
}

type Coords = [number, number];

/** Sufixul pus la import pe opririle cu mențiunea «Intersectie» (ex. «or. Soroca (intersecție)» = ramificația de pe M2, la 76 km de Chișinău, nu orașul Soroca). */
export const INTERSECTION_SUFFIX = ' (intersecție)';
export const isIntersection = (point: string) => point.endsWith(INTERSECTION_SUFFIX) || /^(?:(?:or|s)\.\s*)?intersec/i.test(point);

export class LocalityIndex {
  private byName = new Map<string, Map<string, Coords | null>>();
  private districtByFold = new Map<string, string>();

  constructor(rows: LocalityRow[]) {
    for (const r of rows) {
      const key = foldName(r.name);
      let m = this.byName.get(key);
      if (!m) { m = new Map(); this.byName.set(key, m); }
      const c: Coords | null = r.lat != null && r.lon != null ? [r.lat, r.lon] : null;
      if (!m.has(r.district) || (c && !m.get(r.district))) m.set(r.district, c);
      const dkey = foldName(r.district.replace(/^mun\.\s*/, ''));
      if (!this.districtByFold.has(dkey)) this.districtByFold.set(dkey, r.district);
    }
  }

  /** Raioanele posibile pentru un punct ANTA, cu coordonate unde le avem. O intersecție nu e localitatea. */
  candidates(point: string): Map<string, Coords | null> {
    if (isIntersection(point)) return new Map();
    const { ty, name } = splitPrefix(point);
    const key = foldName(name);
    const all = this.byName.get(key) ?? new Map<string, Coords | null>();
    if (ty === 'or' || ty === 'mun') {
      const d = this.districtByFold.get(key);
      // orașul de raion e singurul candidat doar dacă n-are omonime cu coordonate; altfel decide geometria (regula 2)
      if (d && ![...all].some(([k, c]) => k !== d && c)) return new Map([[d, all.get(d) ?? null]]);
    }
    return new Map(all);
  }

  /** Raionul al cărui centru poartă numele punctului («or. Briceni» → Briceni); null dacă nu e oraș/municipiu de raion. */
  raionOf(point: string): string | null {
    if (isIntersection(point)) return null;
    const { ty, name } = splitPrefix(point);
    if (ty !== 'or' && ty !== 'mun') return null;
    return this.districtByFold.get(foldName(name)) ?? null;
  }
}

/** Distanța pe glob, km. */
export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLon = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]), la2 = toRad(b[0]);
  const cosc = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLon);
  return 6371 * Math.acos(Math.min(1, Math.max(-1, cosc)));
}

/** Raionul fiecărei opriri (în ordinea cursei); null unde nu se poate spune. */
export function resolveDistricts(stops: string[], idx: LocalityIndex): (string | null)[] {
  const cands = stops.map((s) => idx.candidates(s));
  const fixed: (string | null)[] = cands.map((c) => (c.size === 1 ? [...c.keys()][0] : null));
  // orașul de raion preferat la «or. X» cu omonime (regula 2): geometria îl poate răsturna doar cu dovadă clară
  const pref = stops.map((s, i) => { const r = idx.raionOf(s); return r && cands[i].size > 1 && cands[i].has(r) ? r : null; });

  const coordsOf = (i: number): Coords | null => (fixed[i] ? cands[i].get(fixed[i]!) ?? null : null);
  const nearestCoords = (from: number, step: 1 | -1): Coords | null => {
    for (let j = from + step; j >= 0 && j < stops.length; j += step) {
      const c = coordsOf(j);
      if (c) return c;
    }
    return null;
  };

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < stops.length; i++) {
      if (fixed[i] || cands[i].size === 0) continue;
      const cs = cands[i];
      const prev = nearestCoords(i, -1), next = nearestCoords(i, 1);
      const allHaveCoords = [...cs.values()].every(Boolean);
      if ((prev || next) && allHaveCoords) {
        let best: string | null = null, bestD = Infinity;
        const sums = new Map<string, number>();
        for (const [d, c] of cs) {
          const sum = (prev ? distanceKm(prev, c!) : 0) + (next ? distanceKm(next, c!) : 0);
          sums.set(d, sum);
          if (sum < bestD) { bestD = sum; best = d; }
        }
        const p = pref[i];
        if (p && best !== p) {
          const sp = sums.get(p)!;
          if (!(bestD * 2 < sp && sp - bestD >= 20)) best = p;
        }
        fixed[i] = best;
        continue;
      }
      // «or. X» fără vecini cu coordonate: orașul de raion, dar abia la ultima trecere, ca vecinii să se rezolve întâi
      if (pref[i]) { if (pass === 2) fixed[i] = pref[i]; continue; }
      // fără coordonate: vecinul cel mai apropiat pe listă cu un raion dintre candidați
      for (let k = 1; k < stops.length; k++) {
        const near = [i - k, i + k].filter((j) => j >= 0 && j < stops.length);
        const hit = near.find((j) => fixed[j] && cs.has(fixed[j]!));
        if (hit !== undefined) { fixed[i] = fixed[hit]; break; }
      }
    }
  }
  // o intersecție rămâne fără raion: e un singur loc pe drum, nu o localitate (altfel ar apărea în listă o dată pe fiecare raion al vecinilor)
  return fixed;
}

/** «or. X» ajuns în alt raion decât raionul X e un sat cu nume de oraș de raion: numele devine «s. X» (ION-185). */
export function villageName(point: string, district: string | null, idx: LocalityIndex): string {
  const r = idx.raionOf(point);
  if (!r || !district || district === r) return point;
  return 's. ' + splitPrefix(point).name;
}

/** Fișierul `scripts/anta/localities-md.txt`: `name|district|lat|lon`, rândurile cu # sunt comentarii. */
export function parseLocalities(text: string): LocalityRow[] {
  const out: LocalityRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [name, district, lat, lon] = line.split('|');
    if (!name || !district) continue;
    out.push({
      name: name.trim(),
      district: district.trim(),
      lat: lat ? Number(lat) : null,
      lon: lon ? Number(lon) : null,
    });
  }
  return out;
}
