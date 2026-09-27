// Drăxlmaier — planul de schimb al liniilor (ION-108 A): funcții PURE (fără disc, fără rețea), testate în test.mjs.
// Ziua mașinii = cursele sarcinilor ei în ordinea fixă a zilei Drăxlmaier (ts1 ~05–06:15, ts2 ~13–14:45, rs1 15:52, rs2 00:15).
// Km goi pe zi = casă → începutul primei curse + golurile dintre curse + sfârșitul ultimei curse → casă (km pe șosea, funcția d).
// Golurile: ts2 → rs1 (~1 h, ambele la poartă) = drumul direct poartă → poartă; celelalte (≥ 3 h) = prin casă DACĂ mașina merge
// azi acasă în golul de felul acesta (m.acasa.dim: ts1→ts2, m.acasa.seara: rs1→rs2, m.acasa.zi: tur→retur la mașina de un schimb),
// altfel drumul direct (așteaptă lângă poartă / merge direct la capătul următor). Obiceiul e al mașinii (al șoferului), nu al liniei.
export const ORDINE = ['ts1', 'ts2', 'rs1', 'rs2'];

/** felul golului dintre două jumătăți consecutive */
export function felGol(p, n) {
  if (p.k === 'ts2' && n.k === 'rs1') return 'direct';
  if (p.k === 'ts1' && n.k === 'ts2') return 'dim';
  if (p.k === 'rs1' && n.k === 'rs2') return 'seara';
  if (p.J === n.J) return 'zi';
  return 'alt';
}

/** jumătățile unei zile: sarcinile active în data z → [{k, a, b, J}] în ordinea zilei */
export function jumatati(sarcini, z) {
  const out = [];
  for (const J of sarcini) {
    if (!J || !J.zile.includes(z)) continue;
    if (J.tur) out.push({ k: 't' + J.schimb, a: J.tur.capat, b: J.tur.poarta, J });
    if (J.ret) out.push({ k: 'r' + J.schimb, a: J.ret.poarta, b: J.ret.capat, J });
  }
  return out.sort((x, y) => ORDINE.indexOf(x.k) - ORDINE.indexOf(y.k));
}

/** km goi ai mașinii în ziua z, pe bucăți: start (casă → prima cursă), final (ultima → casă), dim / seara / zi / alt / direct (golurile) */
export function kmZiDet(m, sarcini, z, d) {
  const J = jumatati(sarcini, z), o = { start: 0, final: 0, dim: 0, seara: 0, zi: 0, alt: 0, direct: 0 };
  if (!J.length) return o;
  const H = m.casa;
  o.start = d(H, J[0].a); o.final = d(J.at(-1).b, H);
  for (let i = 1; i < J.length; i++) {
    const p = J[i - 1], n = J[i], f = felGol(p, n);
    o[f] += f === "direct" || m.acasa?.[f] === false ? d(p.b, n.a) : d(p.b, H) + d(H, n.a);
  }
  return o;
}
/** km goi ai mașinii în ziua z; d(a, b) = km pe șosea (sincron); m = { casa, acasa: {dim, seara, zi, alt} } (lipsă = prin casă) */
export function kmZi(m, sarcini, z, d) { return Object.values(kmZiDet(m, sarcini, z, d)).reduce((a, x) => a + x, 0); }

/** km goi pe săptămână: suma pe zilele în care mașina are măcar o sarcină */
export function kmSapt(m, sarcini, d) {
  const zile = [...new Set(sarcini.filter(Boolean).flatMap((J) => J.zile))];
  return zile.reduce((a, z) => a + kmZi(m, sarcini, z, d), 0);
}

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

/** componentele legate de mutări: mutari = [{dela, la}] → liste de mașini (union-find) */
export function componente(mutari) {
  const par = new Map(); const f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const q of mutari) { const a = f(q.dela), b = f(q.la); if (a !== b) par.set(a, b); }
  const g = new Map(); for (const q of mutari) for (const x of [q.dela, q.la]) { const r = f(x); (g.get(r) ?? g.set(r, new Set()).get(r)).add(x); }
  return [...g.values()].map((s) => [...s]);
}

/** ordinea de povestire: pornește de la o mutare, apoi mutarea care PLEACĂ de la cel care a primit */
export function ordoneaza(mutari) {
  const rest = [...mutari], out = [];
  while (rest.length) {
    let q = rest.shift(); out.push(q);
    for (;;) { const i = rest.findIndex((x) => x.dela === q.la); if (i < 0) break; q = rest.splice(i, 1)[0]; out.push(q); }
  }
  return out;
}

/** ciclurile unei permutări pe schimb: mutari = [{schimb, dela, la}] → [[mutare…]] (fiecare ciclu se poate aplica singur) */
export function cicluri(mutari) {
  const rest = [...mutari], out = [];
  while (rest.length) {
    let q = rest.shift(); const c = [q];
    for (;;) { const i = rest.findIndex((x) => x.schimb === q.schimb && x.dela === q.la); if (i < 0) break; q = rest.splice(i, 1)[0]; c.push(q); }
    out.push(c);
  }
  return out;
}
