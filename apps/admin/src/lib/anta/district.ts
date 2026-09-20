// Raionul fiecărei opriri dintr-o cursă ANTA (Concurența pe direcție, ION-12).
//
// Fișierul ANTA n-are raioane, iar multe nume se repetă (Briceni oraș în r. Briceni ≠ Briceni sat în
// r. Dondușeni; Chetrosu în Anenii Noi și în Drochia; Costești în Rîșcani, Ialoveni și Hîncești).
// Regulile, în ordine:
//   1. numele există într-un singur raion → acela;
//   2. «or. X» / «mun. X» unde X e numele unui raion → raionul X (orașul = centrul de raion);
//   3. geometrie: dintre candidați îl luăm pe cel cu suma distanțelor cea mai mică până la cei mai
//      apropiați vecini deja rezolvați de pe cursă (înainte și după, după coordonate);
//   4. fără coordonate: raionul celui mai apropiat vecin (pe listă) care e printre candidați;
//   5. altfel null.
// Se repetă de câteva ori, ca o oprire rezolvată să-i ajute pe vecinii ei.

import { foldName, splitPrefix } from './names';

export interface LocalityRow {
  name: string;
  district: string;
  lat: number | null;
  lon: number | null;
}

type Coords = [number, number];

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

  /** Raioanele posibile pentru un punct ANTA, cu coordonate unde le avem. */
  candidates(point: string): Map<string, Coords | null> {
    const { ty, name } = splitPrefix(point);
    const key = foldName(name);
    const all = this.byName.get(key) ?? new Map<string, Coords | null>();
    if (ty === 'or' || ty === 'mun') {
      const d = this.districtByFold.get(key);
      if (d) return new Map([[d, all.get(d) ?? null]]);
    }
    return new Map(all);
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
        for (const [d, c] of cs) {
          const sum = (prev ? distanceKm(prev, c!) : 0) + (next ? distanceKm(next, c!) : 0);
          if (sum < bestD) { bestD = sum; best = d; }
        }
        fixed[i] = best;
        continue;
      }
      // fără coordonate: vecinul cel mai apropiat pe listă cu un raion dintre candidați
      for (let k = 1; k < stops.length; k++) {
        const near = [i - k, i + k].filter((j) => j >= 0 && j < stops.length);
        const hit = near.find((j) => fixed[j] && cs.has(fixed[j]!));
        if (hit !== undefined) { fixed[i] = fixed[hit]; break; }
      }
    }
  }
  return fixed;
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
