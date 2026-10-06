/**
 * Harta biletului din mini app-ul clientului (Ion, 06.10.2026: «La client pentru bilet harta să se vadă macro și doar
 * punctele care este biletul lui»): doar stația de urcare, stația de coborâre și autobuzul; linia doar pe porțiunea
 * biletului; încadrarea pe ce contează acum — autobuzul și stația spre care merge. Funcții pure, testate în
 * harta-bilet.test.ts; harta «Acum» de pe site nu le folosește pentru încadrare.
 */

export type LatLon = [number, number];

/** Cel mai apropiat punct al liniei (proiecție pe segmente); departe de linie (~2 km) — punctul însuși, seg = -1. */
export function snapOn(p: LatLon, line: LatLon[]): { at: LatLon; seg: number } {
  const k = Math.cos((p[0] * Math.PI) / 180);
  let best: LatLon = p, bestD = Infinity, seg = -1;
  for (let i = 1; i < line.length; i++) {
    const [ay, ax] = line[i - 1], [by, bx] = line[i];
    const dx = (bx - ax) * k, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, (((p[1] - ax) * k) * dx + (p[0] - ay) * dy) / len)) : 0;
    const q: LatLon = [ay + t * (by - ay), ax + t * (bx - ax)];
    const d = ((q[1] - p[1]) * k) ** 2 + (q[0] - p[0]) ** 2;
    if (d < bestD) { bestD = d; best = q; seg = i; }
  }
  // ~0,02° ≈ 2 km: mai departe, autobuzul chiar nu e pe linia asta (ocol, depou).
  return bestD < 0.02 ** 2 ? { at: best, seg } : { at: p, seg: -1 };
}

/** Km aproximativi între două puncte (suficient pentru ordonare pe linie). */
function km(a: LatLon, b: LatLon): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]), (b[1] - a[1]) * k) * 111.2;
}

/** Poziția punctului pe linie, în km de la începutul ei; null = punctul nu e pe linie. */
export function kmPeLinie(p: LatLon, line: LatLon[]): number | null {
  const s = snapOn(p, line);
  if (s.seg < 1) return null;
  let d = 0;
  for (let i = 1; i < s.seg; i++) d += km(line[i - 1], line[i]);
  return d + km(line[s.seg - 1], s.at);
}

/**
 * Bucata de linie dintre două puncte (în ordinea a → b, oricare ar fi sensul liniei). Linia e în ordinea opririlor spre
 * Chișinău; spre nord se merge înapoi pe ea. null = unul din puncte nu e pe linie — atunci nu se poate tăia.
 */
export function intre(line: LatLon[], a: LatLon, b: LatLon): LatLon[] | null {
  if (line.length < 2) return null;
  const sa = snapOn(a, line), sb = snapOn(b, line);
  if (sa.seg < 1 || sb.seg < 1) return null;
  // Segmentul `seg` e între line[seg-1] și line[seg].
  if (sa.seg < sb.seg) return [sa.at, ...line.slice(sa.seg, sb.seg), sb.at];
  if (sa.seg > sb.seg) return [sa.at, ...line.slice(sb.seg, sa.seg).reverse(), sb.at];
  return [sa.at, sb.at];
}

/**
 * - `fara-autobuz`: autobuzul cursei încă nu e pe hartă;
 * - `spre-urcare`: autobuzul vine spre stația omului (sau stă chiar în ea);
 * - `spre-coborare`: autobuzul a trecut de stația omului — merge spre destinație.
 */
export type FazaBilet = 'fara-autobuz' | 'spre-urcare' | 'spre-coborare';

/** Sub atâția km dincolo de stație autobuzul încă «e în stație» (GPS-ul sare, gara e lungă). */
const TRECUT_KM = 0.3;

export function fazaBilet(o: {
  bus: LatLon | null; from: LatLon | null; to: LatLon | null; line: LatLon[] | null;
  /** /pozitie: cursa a trecut deja de oprirea omului (ION-249). */
  plecata?: boolean;
  /** Autobuzul stă chiar în stația omului (ION-43). */
  inStatiaMea?: boolean;
}): FazaBilet {
  if (!o.bus) return 'fara-autobuz';
  if (o.plecata) return 'spre-coborare';
  if (o.inStatiaMea || !o.line || !o.from || !o.to) return 'spre-urcare';
  const b = kmPeLinie(o.bus, o.line), f = kmPeLinie(o.from, o.line), t = kmPeLinie(o.to, o.line);
  if (b == null || f == null || t == null || f === t) return 'spre-urcare';
  // Sensul biletului: de la urcare spre coborâre, pe linie.
  const sens = t > f ? 1 : -1;
  return (b - f) * sens > TRECUT_KM ? 'spre-coborare' : 'spre-urcare';
}

/** Punctele pe care se încadrează harta în fiecare fază (fără zoom mai mic decât e necesar). */
export function incadrareBilet(faza: FazaBilet, bus: LatLon | null, from: LatLon | null, to: LatLon | null): LatLon[] {
  const pts = faza === 'fara-autobuz' ? [from ?? to]
    : faza === 'spre-urcare' ? [bus, from ?? to]
    : [bus, to ?? from];
  return pts.filter((p): p is LatLon => p != null);
}

/** Cel mai apropiat nivel de zoom la încadrarea biletului: autobuzul chiar în stație nu intră pe stradă. */
export const BILET_MAX_ZOOM = 13;
/** O singură stație (autobuzul încă nu e pe hartă): localitatea, cu împrejurimile. */
export const BILET_ZOOM_UN_PUNCT = 12;

/**
 * Marginile hărții acoperite în mini app: antetul sus, cardul biletului jos (≈35–40 % din ecran). Înălțimea reală a
 * cardului, când se știe, câștigă; altfel 40 % din hartă.
 */
export function paddingBilet(w: number, h: number, panouH = 0): { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] } {
  const side = Math.min(48, Math.round(w * 0.1));
  const jos = Math.max(Math.round(h * 0.4), panouH > 0 ? panouH + 36 : 0);
  // Harta rămasă deasupra cardului nu coboară sub ~120 px, ca fitBounds să aibă unde pune cele două puncte.
  return { paddingTopLeft: [side, 72], paddingBottomRight: [side, Math.min(jos, Math.max(0, h - 72 - 120))] };
}
