// Poziția ORIENTATIVĂ a rutierei fără GPS pe harta «Acum» (ION-43). Ion, 24.09: «pune la el
// orientativ pe traseu mașina, și la toate care lipsesc» — trackerele 330 RQR, 805 BXI,
// 145 BZP, 725 YOZ nu dau poziție. Din orele opririlor cursei (crm_stop_fares), decalate cu
// întârzierea știută, se află între ce două opriri trebuie să fie acum mașina și se pune pe
// linia rutei (route_shapes), proporțional cu timpul. E o estimare: nu intră în ora
// estimată și nici în «a trecut deja», iar pe hartă se vede ca atare.

export type LatLon = [number, number];
export interface TimedStop { stop_order: number; lat: number; lon: number; minute: number }

const R = 6371;
function km(a: LatLon, b: LatLon): number {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180, dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Distanța de la începutul liniei până la proiecția punctului pe ea. */
export function alongLine(p: LatLon, line: LatLon[], cum: number[]): number {
  const k = Math.cos((p[0] * Math.PI) / 180);
  let best = Infinity, at = 0;
  for (let i = 1; i < line.length; i++) {
    const [ay, ax] = line[i - 1], [by, bx] = line[i];
    const dx = (bx - ax) * k, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, (((p[1] - ax) * k) * dx + (p[0] - ay) * dy) / len)) : 0;
    const d = ((ax + t * (bx - ax) - p[1]) * k) ** 2 + (ay + t * (by - ay) - p[0]) ** 2;
    if (d < best) { best = d; at = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
  }
  return at;
}

/** Punctul liniei aflat la distanța `d` de la începutul ei. */
export function pointAt(d: number, line: LatLon[], cum: number[]): LatLon {
  if (d <= 0) return line[0];
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= d) {
      const f = cum[i] === cum[i - 1] ? 0 : (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
      return [line[i - 1][0] + f * (line[i][0] - line[i - 1][0]), line[i - 1][1] + f * (line[i][1] - line[i - 1][1])];
    }
  }
  return line[line.length - 1];
}

/**
 * Unde ar trebui să fie acum mașina: `stops` au ora cursei (minute de la miezul nopții);
 * sensul spre nord parcurge stop_order descrescător. `now` e ora Chișinăului minus
 * întârzierea știută. null = cursa nu a început sau s-a terminat după ore, ori prea puține date.
 */
export function estimateOnLine(line: LatLon[], stops: TimedStop[], goingNorth: boolean, now: number): LatLon | null {
  if (line.length < 2) return null;
  const ordered = [...stops].sort((a, b) => (goingNorth ? b.stop_order - a.stop_order : a.stop_order - b.stop_order));
  if (ordered.length < 2) return null;
  const mins = ordered.map((s) => s.minute);
  for (let i = 1; i < mins.length; i++) while (mins[i] < mins[i - 1] - 12 * 60) mins[i] += 1440;
  let t = now;
  if (t < mins[0] - 12 * 60) t += 1440; // cursa a pornit ieri seară
  if (t < mins[0] || t > mins[mins.length - 1]) return null;
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + km(line[i - 1], line[i]));
  let i = 0;
  while (i < mins.length - 2 && mins[i + 1] < t) i++;
  const span = mins[i + 1] - mins[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (t - mins[i]) / span)) : 0;
  const da = alongLine([ordered[i].lat, ordered[i].lon], line, cum);
  const db = alongLine([ordered[i + 1].lat, ordered[i + 1].lon], line, cum);
  return pointAt(da + f * (db - da), line, cum);
}
