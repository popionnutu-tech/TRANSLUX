// Drăxlmaier — planul de așteptare și de schimb al liniilor (ION-108 A, v2): funcții PURE, testate în test.mjs.
// O «jumătate» = o cursă reală cu oameni: { z: data zilei de lucru, k: 'ts1'|'ts2'|'rs1'|'rs2', lin, a: de unde pleacă, b: unde ajunge }.
// Un «program» = lista jumătăților unei mașini pe un schimb (calendarul EXACT: fiecare cursă pe data ei, nimic inventat).
// Ziua Drăxlmaier are ordinea fixă ts1 (~05–06:15) → ts2 (~13–14:45) → rs1 (15:52) → rs2 (00:15).
// Km goi pe zi = casă → prima cursă + golurile + ultima cursă → casă (noaptea mașina e acasă, ca azi).
// Golul: ts2 → rs1 (~1 h la poartă) = direct; celelalte (≥ 3 h) = prin casă dacă mod = 'obicei' și mașina merge azi acasă în golul
// de felul acesta (m.acasa[f]); în mod = 'asteapta' (pârghia b) mașina rămâne la uzină / la capătul cursei următoare = direct.
// Direct = min(drumul direct, prin casă): Valhalla poate da directul mai lung decât ocolul (un capăt prins pe un sens unic).
export const ORDINE = ['ts1', 'ts2', 'rs1', 'rs2'];

export function felGol(p, n) {
  if (p.k === 'ts2' && n.k === 'rs1') return 'direct';
  if (p.k === 'ts1' && n.k === 'ts2') return 'dim';
  if (p.k === 'rs1' && n.k === 'rs2') return 'seara';
  if (p.k.slice(1) === n.k.slice(1)) return 'zi';
  return 'alt';
}

/** jumătățile unei zile din programele date, în ordinea zilei */
export function jumatati(programe, z) {
  const out = [];
  for (const P of programe) if (P) for (const h of P.jum) if (h.z === z) out.push(h);
  return out.sort((x, y) => ORDINE.indexOf(x.k) - ORDINE.indexOf(y.k));
}

/** două curse în aceeași zi pe același loc (ts1/ts2/rs1/rs2) = program imposibil */
export function conflict(programe) {
  const v = new Set();
  for (const P of programe) if (P) for (const h of P.jum) { const q = `${h.z}|${h.k}`; if (v.has(q)) return true; v.add(q); }
  return false;
}

export const zileDin = (programe) => [...new Set(programe.filter(Boolean).flatMap((P) => P.jum.map((h) => h.z)))].sort();

/** golurile zilei: [{f, p, n, direct, prinCasa, acasa}] — acasa = în modul dat mașina merge acasă în golul acesta */
export function goluri(m, programe, z, d, mod) {
  const J = jumatati(programe, z), H = m.casa, out = [];
  for (let i = 1; i < J.length; i++) {
    const p = J[i - 1], n = J[i], f = felGol(p, n);
    const prinCasa = d(p.b, H) + d(H, n.a), direct = Math.min(d(p.b, n.a), prinCasa);
    const acasa = f !== 'direct' && mod === 'obicei' && m.acasa?.[f] !== false;
    out.push({ f, p, n, direct, prinCasa, acasa });
  }
  return out;
}

/** km goi ai mașinii în ziua z, pe bucăți */
export function kmZiDet(m, programe, z, d, mod = 'obicei') {
  const J = jumatati(programe, z), o = { start: 0, final: 0, dim: 0, seara: 0, zi: 0, alt: 0, direct: 0 };
  if (!J.length) return o;
  o.start = d(m.casa, J[0].a); o.final = d(J.at(-1).b, m.casa);
  for (const g of goluri(m, programe, z, d, mod)) o[g.f] += g.acasa ? g.prinCasa : g.direct;
  return o;
}
export const kmZi = (m, programe, z, d, mod) => Object.values(kmZiDet(m, programe, z, d, mod)).reduce((a, x) => a + x, 0);
export const kmSapt = (m, programe, d, mod) => zileDin(programe).reduce((a, z) => a + kmZi(m, programe, z, d, mod), 0);

/** Algoritmul ungar (Kuhn–Munkres, O(n³)) pe matrice pătrată; întoarce p[i] = coloana rândului i. */
export function ungar(C) {
  const n = C.length, INF = 1e18;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(n + 1).fill(INF), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n);
  for (let j = 1; j <= n; j++) res[p[j] - 1] = j - 1;
  return res;
}

/** componentele legate de mutări (pe ambele schimburi): mutari = [{dela, la}] → liste de mașini */
export function componente(mutari) {
  const par = new Map(); const f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const q of mutari) { const a = f(q.dela), b = f(q.la); if (a !== b) par.set(a, b); }
  const g = new Map(); for (const q of mutari) for (const x of [q.dela, q.la]) { const r = f(x); (g.get(r) ?? g.set(r, new Set()).get(r)).add(x); }
  return [...g.values()].map((s) => [...s].sort());
}

/** ordinea de povestire: o mutare, apoi mutarea care PLEACĂ de la cel care a primit */
export function ordoneaza(mutari) {
  const rest = [...mutari], out = [];
  while (rest.length) {
    let q = rest.shift(); out.push(q);
    for (;;) { const i = rest.findIndex((x) => x.dela === q.la); if (i < 0) break; q = rest.splice(i, 1)[0]; out.push(q); }
  }
  return out;
}

/** multisetul curselor (data, loc, linie) — pentru proba de conservare */
export const amprenta = (programe) => programe.filter(Boolean).flatMap((P) => P.jum.map((h) => `${h.z}|${h.k}|${h.lin}`)).sort().join(',');
