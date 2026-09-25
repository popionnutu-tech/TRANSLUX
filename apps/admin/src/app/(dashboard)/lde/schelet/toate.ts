import type { Punct } from '@/components/ScheletMap';
import type { Schelet } from './ScheletClient';
import type { ScheletSebn } from './ScheletSebnClient';
import type { ScheletFloresti } from './ScheletFlorestiClient';
import type { ScheletMejgorod } from './ScheletMejgorodClient';

// Fila «Toate rutele» (ION-67). Ion, 25.09.2026: «fă o hartă unică unde să se aplice toate rutele,
// vizual să fie frumos, fiecare să fie sub egida ei cumva vizibil». Cele patru schelete au împreună
// ~50.000 de puncte GPS și 1,7 MB — prea mult pentru o singură hartă în browser. Aici, pe server, se
// păstrează doar drumul cu oameni al fiecărei rute, subțiat la ~60 m, plus zona fiecărei rețele.

export type RutaToate = { id: string; nume: string; km: number | null; culoare: string; linie: Punct[] };
export type Retea = {
  id: string; nume: string; sub: string; culoare: string; zona: Punct[] | null;
  porti: { c: Punct; n: string }[]; rute: RutaToate[]; kmZi: number;
};

// Egida = familia de culoare a rețelei: rutele ei sunt nuanțe ale aceleiași tente, ca dintr-o
// privire să se vadă a cui e linia, iar două rute vecine din aceeași rețea să nu se confunde.
const TENTE = {
  lear: { h: 174, culoare: '#2F6F68' },
  orhei: { h: 222, culoare: '#3C5795' },
  straseni: { h: 272, culoare: '#6B4A96' },
  floresti: { h: 30, culoare: '#B06A1F' },
  mejgorod: { h: 352, culoare: '#8E2A3A' },
} as const;
const nuanta = (h: number, i: number) => `hsl(${h} 58% ${30 + ((i * 9) % 24)}%)`;

const KM_LAT = 111.32;
const kmX = (p: Punct, lat0: number) => p[1] * KM_LAT * Math.cos((lat0 * Math.PI) / 180);

// Douglas–Peucker în km: sub 60 m abaterea nu se vede la nicio scară la care cad toate rutele.
function subtiaza(linie: Punct[], tol = 0.06): Punct[] {
  if (linie.length < 3) return linie;
  const lat0 = linie[0][0];
  const xy = linie.map((p) => [kmX(p, lat0), p[0] * KM_LAT] as const);
  const pastrez = new Uint8Array(linie.length);
  pastrez[0] = pastrez[linie.length - 1] = 1;
  const stiva: [number, number][] = [[0, linie.length - 1]];
  while (stiva.length) {
    const [a, b] = stiva.pop()!;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
      const d = ex * ex + ey * ey;
      if (d > max) { max = d; idx = i; }
    }
    if (idx > 0 && max > tol * tol) { pastrez[idx] = 1; stiva.push([a, idx], [idx, b]); }
  }
  return linie.filter((_, i) => pastrez[i]).map((p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]);
}

// Zona rețelei: învelitoarea convexă a rutelor ei, lărgită cu `raza` km și rotunjită (fiecare punct
// devine un cerc de 12 puncte, iar învelitoarea cercurilor e o formă cu colțuri moi).
function zona(linii: Punct[][], raza = 3.5): Punct[] | null {
  const toate = linii.flat();
  if (toate.length < 3) return null;
  const lat0 = toate.reduce((s, p) => s + p[0], 0) / toate.length;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const pts: [number, number][] = [];
  for (const p of toate) {
    for (let k = 0; k < 12; k++) {
      const u = (k * Math.PI) / 6;
      pts.push([p[1] * KM_LAT * cos + raza * Math.cos(u), p[0] * KM_LAT + raza * Math.sin(u)]);
    }
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const jos: [number, number][] = [], sus: [number, number][] = [];
  for (const p of pts) {
    while (jos.length >= 2 && cr(jos[jos.length - 2], jos[jos.length - 1], p) <= 0) jos.pop();
    jos.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (sus.length >= 2 && cr(sus[sus.length - 2], sus[sus.length - 1], p) <= 0) sus.pop();
    sus.push(p);
  }
  const inv = [...jos.slice(0, -1), ...sus.slice(0, -1)];
  return inv.map(([x, y]) => [Math.round((y / KM_LAT) * 1e4) / 1e4, Math.round((x / (KM_LAT * cos)) * 1e4) / 1e4]);
}

const plin = (g?: { tur?: { plin: Punct[] }; retur?: { plin: Punct[] } }) =>
  (g?.tur?.plin?.length ?? 0) > 1 ? g!.tur!.plin : (g?.retur?.plin ?? []);

// Poarta LEAR Ungheni — aceeași ca în ScheletMap (acolo e poarta implicită).
const POARTA_UNGHENI: Punct = [47.223, 27.8016];

export function construiesteToate(
  lear: Schelet, sebn: ScheletSebn, floresti: ScheletFloresti, mejgorod: ScheletMejgorod,
): Retea[] {
  const retea = (
    id: keyof typeof TENTE, nume: string, sub: string, porti: Retea['porti'],
    rute: { id: string; nume: string; km: number | null; linie: Punct[] }[], cuZona = true,
  ): Retea => {
    const t = TENTE[id];
    const r = rute.map((x, i) => ({ ...x, culoare: nuanta(t.h, i), linie: subtiaza(x.linie) }));
    const linii = r.map((x) => x.linie).filter((l) => l.length > 1);
    return {
      id, nume, sub, culoare: t.culoare, porti, rute: r,
      zona: cuZona ? zona([...linii, porti.map((p) => p.c)]) : null,
      kmZi: r.reduce((s, x) => s + (x.km ?? 0), 0),
    };
  };

  // km pe rută = km cu oameni pe zi, exact cum îi numără fila fiecărei rețele
  const orhei = sebn.uzine.find((u) => u.id === 'orhei');
  const straseni = sebn.uzine.find((u) => u.id === 'straseni');
  const sebnRute = (uz: string) => sebn.rute.filter((r) => r.uz === uz).map((r) => {
    const acum = r.schimburi.filter((s) => !s.pana);
    return { id: r.id, nume: r.nume, km: acum.length ? acum.reduce((s, x) => s + x.tur + x.retur, 0) : null, linie: plin(r.g) };
  });

  return [
    retea('lear', 'LEAR Ungheni', 'uzină · tura A și B', [{ c: POARTA_UNGHENI, n: 'LEAR Ungheni' }],
      lear.rute.map((r) => ({ id: r.id, nume: r.capat ?? r.sate[0], km: r.etalon != null ? r.etalon * 2 : null, linie: plin(r.g) }))),
    retea('floresti', 'LEAR Florești', 'uzină · actul 36.1', [{ c: floresti.poarta, n: 'LEAR Florești' }],
      floresti.rute.map((r) => ({ id: r.id, nume: r.capat ?? r.sate[0], km: r.etalon != null ? (r.tur ?? 0) + (r.retur ?? 0) : null, linie: plin(r.g) }))),
    retea('orhei', 'SEBN Orhei', 'uzină · 3 schimburi', orhei ? [{ c: orhei.poarta, n: 'SEBN Orhei' }] : [], sebnRute('orhei')),
    retea('straseni', 'SEBN Strășeni', 'uzină · 3 schimburi', straseni ? [{ c: straseni.poarta, n: 'SEBN Strășeni' }] : [], sebnRute('straseni')),
    // Interurbanele traversează tot nordul: o zonă în jurul lor ar acoperi celelalte rețele, deci n-au.
    retea('mejgorod', 'Rute interurbane', 'nord ↔ Chișinău', [{ c: mejgorod.gari.chisinau, n: 'Chișinău' }],
      mejgorod.rute.map((r) => ({ id: String(r.id), nume: `${r.capNord} ↔ ${r.capSud}`, km: 2 * r.km, linie: r.shape })), false),
  ];
}
