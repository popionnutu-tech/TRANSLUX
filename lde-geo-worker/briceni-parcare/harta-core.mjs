// ION-148 — funcțiile pure ale hărții Briceni (Trox + suburban), testate în harta-core.test.mjs.
// Ion, 01.10.2026 (răspunsul 5): «gol forțat» (gol pe rută, gol între ture, legătură) are o singură culoare, separată de livrare.

/** categoria raportului BRICENI (livrare.mjs, CAT) → tipul intervalului pe hartă (drax-harta.ts TipInterval) */
export const TIP_DIN_CAT = {
  cuOameni: 'cursa', nepotrivita: 'cursa',
  livrare: 'gol', brambura: 'gol', necunoscut: 'gol',
  golRuta: 'fortat', golTure: 'fortat', legatura: 'fortat',
  service: 'munca', deplasare: 'munca',
  stat: 'parcare',
};

/** tipul unui interval din km-ii lui pe categorii: cursa câștigă mereu; altfel grupul cu cei mai mulți km */
export function tipInterval(cats) {
  if ((cats.cuOameni ?? 0) + (cats.nepotrivita ?? 0) > 0) return 'cursa';
  const g = {};
  for (const [c, km] of Object.entries(cats)) { const t = TIP_DIN_CAT[c]; if (t) g[t] = (g[t] ?? 0) + km; }
  const ord = ['gol', 'fortat', 'munca', 'parcare'];
  let best = null; for (const t of ord) if (g[t] != null && (best == null || g[t] > g[best])) best = t;
  return best ?? 'parcare';
}

/** ruta din raport (T1…T6, 44…57, «46+52+53») → linia din scheletul public (schelet-briceni.json) */
export const linieSchelet = (r) => (r == null ? null : ['46', '52', '53', '54', '46+52+53'].includes(String(r)) ? '46+52+53+54' : String(r));

/** Douglas–Peucker în metri pe {lat, lon, t} */
export function dp(Pt, eps) {
  if (Pt.length < 3) return Pt;
  const k = 111320, c = Math.cos(Pt[0].lat * Math.PI / 180), X = Pt.map((p) => [p.lon * k * c, p.lat * k]);
  const keep = new Uint8Array(Pt.length); keep[0] = keep[Pt.length - 1] = 1; const st = [[0, Pt.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let m = -1, md = 0; const [x1, y1] = X[a], [x2, y2] = X[b], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - X[i][1]) - (x1 - X[i][0]) * (y2 - y1)) / L; if (d > md) { md = d; m = i; } }
    if (md > eps) { keep[m] = 1; st.push([a, m], [m, b]); }
  }
  return Pt.filter((_, i) => keep[i]);
}

/** economia pe zi din drumurile de parcare: Σ (real − propus) pe drumurile care încep în ziua z */
export function economieZile(legi) {
  const z = new Map();
  for (const l of legi) z.set(l.z, (z.get(l.z) ?? 0) + Math.max(0, l.real - l.prop));
  return z;
}
