// Drăxlmaier — planul de schimb al liniilor pe toată flota (ION-108 A, 27.09.2026). Citește DOAR dosarul săptămânii (instantaneul),
// nu scrie nimic acolo; cache-ul Valhalla propriu în drax/date/plan-schimb/valhalla-cache.json (cache-ul săptămânii doar citit).
//   node plan-schimb.mjs <ECON_D> [--out <fișier.json>]      # fără --out: doar controalele și rezumatul (proba)
// Modelul (model.mjs): «sarcina» = ce face azi o mașină pe un schimb (linia turului + linia returului, zilele ei); sarcinile se
// mută ÎNTREGI între mașini; o mașină păstrează numărul de schimburi (1 sau 2) și schimbul; clasa: locurile liniei sau clasa mașinii
// care o face azi. Repartizarea: algoritmul ungar pe fiecare schimb (cu celălalt schimb fixat), alternat până nu mai scade, apoi
// schimburi două câte două. Km goi calculați la fel înainte și după (Valhalla), deci diferența = economia.
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { kmSapt, kmZiDet, ungar, cicluri } from './model.mjs';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';

const DIR = process.argv[2];
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (!DIR || !existsSync(`${DIR}/economie.json`) || !existsSync(`${DIR}/economie-zile.json`)) { console.error('plan-schimb.mjs <ECON_D> [--out f.json]'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const A = J('economie.json'), Z = J('economie-zile.json');
const PRAG_LANT = 20, PENAL_MUTARE = 0.5, MIN_ZILE = 2;
const PORTI = { EST: { lat: 47.78513, lon: 27.94307 }, VEST: { lat: 47.77408, lon: 27.91593 } };   // drax/cod/economie/comun.mjs:9
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const r1 = (x) => Math.round(x * 10) / 10;
const med = (a) => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
const pt = (c) => (Array.isArray(c) ? { lat: c[0], lon: c[1] } : c);
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const loc = (p) => idx.nearestWithin({ lat: p.lat, lon: p.lon }, 3.8)?.name ?? `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

// ---- Valhalla (km pe șosea, costing bus), aceeași cheie ca drax/cod/economie/comun.mjs:kmDrum
const CACHE_F = '/root/lde-worker/drax/date/plan-schimb/valhalla-cache.json';
const cheie = (a, b) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
const cache = new Map([...(existsSync(`${DIR}/economie-valhalla-cache.json`) ? Object.entries(J('economie-valhalla-cache.json')) : []),
  ...(existsSync(CACHE_F) ? Object.entries(JSON.parse(readFileSync(CACHE_F, 'utf8'))) : [])]);
let noi = 0; const nule = [];
async function valhalla(a, b) {
  const k = cheie(a, b); if (cache.has(k) && cache.get(k) != null) return;
  let v = null;
  if (hav(a, b) < 0.05) v = 0;
  else try {
    const r = await fetch('http://localhost:8002/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: 'bus', units: 'kilometers' }) });
    v = (await r.json())?.trip?.summary?.length ?? null;
  } catch { v = null; }
  if (v == null) { nule.push(k); return; }
  cache.set(k, +v.toFixed(2)); noi++;
}
const d = (a, b) => { const v = cache.get(cheie(a, b)); if (v == null) throw new Error(`km lipsă ${cheie(a, b)}`); return v; };

// ---- sarcinile de azi, din rândul săptămânii (economie-zile.json → seg cuOameni)
const LIN = Z.linii;
const locuri = (l) => LIN[l]?.locuri ?? null;
const numeLin = (l) => (l ? `${l.split('|')[0]} ${LIN[l]?.capat ?? l.split('|')[1]}` : null);
const poartaDe = (p) => Object.entries(PORTI).sort((x, y) => hav(p, x[1]) - hav(p, y[1]))[0][0];
const masini = [], faraCasa = [], neregulate = [];
const poartaVot = new Map();   // lin|sens|schimb → {EST: n, VEST: n}
for (const d0 of Z.zile) for (const s of d0.seg) if (s.cat === 'cuOameni' && s.lin && s.schimb) {
  const g = poartaDe(pt(s.sens === 'tur' ? s.pana : s.de)); const k = `${s.lin}|${s.sens}|${s.schimb}`;
  const v = poartaVot.get(k) ?? poartaVot.set(k, {}).get(k); v[g] = (v[g] ?? 0) + 1; }
const poarta = (lin, sens, schimb) => { const v = poartaVot.get(`${lin}|${sens}|${schimb}`); return v ? Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] : 'EST'; };
const sarcini = [];
for (const m of A.masini) {
  const zile = Z.zile.filter((x) => x.m === m.m);
  const jum = { ts1: new Map(), rs1: new Map(), ts2: new Map(), rs2: new Map() };
  const obs = [];   // golurile de azi: {f, km GPS, ocol, a (unde se termină cursa), b (unde începe următoarea)}; obiceiul se decide după Valhalla
  for (const x of zile) {
    // cursa principală a fiecărei jumătăți în ziua asta = cea mai lungă (o retur rupt în două bucăți nu devine altă linie)
    const princ = new Map();
    for (const s of x.seg) if (s.cat === 'cuOameni' && s.lin && s.schimb) { const k = (s.sens === 'tur' ? 't' : 'r') + s.schimb;
      if (!princ.has(k) || princ.get(k).km < s.km) princ.set(k, s); }
    for (const [k, s] of princ) { const mp = jum[k]; (mp.get(s.lin) ?? mp.set(s.lin, new Set()).get(s.lin)).add(x.z); }
    // obiceiul: merge acasă în gol? = un ocol pe acasă în gol SAU km GPS ai golului ≥ 0,8 × (a → casă → b) pe șosea
    const ord = ['ts1', 'ts2', 'rs1', 'rs2'].filter((k) => princ.has(k)).map((k) => ({ k, s: princ.get(k) }));
    for (let i = 1; i < ord.length && m.casa; i++) {
      const p = ord[i - 1], n = ord[i];
      const f = p.k === 'ts2' && n.k === 'rs1' ? null : p.k === 'ts1' && n.k === 'ts2' ? 'dim' : p.k === 'rs1' && n.k === 'rs2' ? 'seara' : p.k.slice(1) === n.k.slice(1) ? 'zi' : 'alt';
      if (!f) continue;
      const gol = x.seg.filter((q) => q.cat !== 'cuOameni' && q.t0 >= p.s.t1 && q.t1 <= n.s.t0);
      const km = gol.reduce((a, q) => a + q.km + (q.golImpus || 0), 0);
      const capP = (s) => pt(LIN[s.lin].capatC), porP = (s) => PORTI[poarta(s.lin, s.sens, s.schimb)];
      obs.push({ f, km, ocol: gol.some((q) => q.ocol), a: p.s.sens === "tur" ? porP(p.s) : capP(p.s), b: n.s.sens === "tur" ? capP(n.s) : porP(n.s) });
    }
  }
  const moda = (mp) => [...mp.entries()].sort((a, b) => b[1].size - a[1].size)[0] ?? null;
  const rec = { m: m.m, casa: m.casa ? { lat: m.casa.lat, lon: m.casa.lon } : null, leiKm: m.leiKm ?? null, sarcini: {}, zileRand: zile.map((x) => x.z),
    obs, acasa: {}, acasaVot: {} };
  for (const s of ['s1', 's2']) {
    const t = moda(jum['t' + s]), r = moda(jum['r' + s]);
    const zs = new Set([...(t ? t[1] : []), ...(r ? r[1] : [])]);
    if (zs.size < MIN_ZILE) { if (zs.size) neregulate.push({ m: m.m, schimb: s, zile: [...zs], tur: numeLin(t?.[0]), retur: numeLin(r?.[0]), motiv: `mai puțin de ${MIN_ZILE} zile` }); continue; }
    const S = { id: `${m.m}|${s}`, schimb: s, azi: m.m, zile: [...zs].sort(),
      tur: t ? { lin: t[0], capat: pt(LIN[t[0]].capatC), poarta: PORTI[poarta(t[0], 'tur', s)], poartaN: poarta(t[0], 'tur', s) } : null,
      ret: r ? { lin: r[0], capat: pt(LIN[r[0]].capatC), poarta: PORTI[poarta(r[0], 'retur', s)], poartaN: poarta(r[0], 'retur', s) } : null };
    S.clasa = Math.max(...[S.tur?.lin, S.ret?.lin].filter(Boolean).map((l) => locuri(l) ?? 0));
    S.nume = S.tur && S.ret && S.tur.lin !== S.ret.lin ? `${numeLin(S.tur.lin)} (tur) / ${numeLin(S.ret.lin)} (retur)` : numeLin((S.tur ?? S.ret).lin) + (S.tur && S.ret ? '' : S.tur ? ' (doar turul)' : ' (doar returul)');
    rec.sarcini[s] = S; sarcini.push(S);
    // cursele altor linii în zilele sarcinii: rămân pe loc (neregulate)
    for (const k of ['t' + s, 'r' + s]) for (const [l, zz] of jum[k]) if (l !== (k[0] === 't' ? S.tur?.lin : S.ret?.lin))
      neregulate.push({ m: m.m, schimb: s, sens: k[0] === 't' ? 'tur' : 'retur', linie: numeLin(l), zile: [...zz], motiv: 'altă linie decât cea obișnuită a mașinii' });
  }
  rec.doua = Object.keys(rec.sarcini).length === 2;
  rec.clasa = Math.max(0, ...Object.values(rec.sarcini).map((S) => S.clasa));
  if (!rec.casa) faraCasa.push(rec.m);
  if (Object.keys(rec.sarcini).length) masini.push(rec);
}
const M = new Map(masini.map((m) => [m.m, m]));
// ---- km pe șosea: fiecare casă ↔ fiecare capăt al sarcinilor și ↔ porți; poartă ↔ poartă
const capete = [...new Map(sarcini.flatMap((S) => [S.tur?.capat, S.ret?.capat]).filter(Boolean).map((c) => [cheie(c, c), c])).values()];
const tinte = [...capete, ...Object.values(PORTI)];
const perechi = [];
for (const m of masini) if (m.casa) for (const c of tinte) perechi.push([m.casa, c], [c, m.casa]);
for (const a of tinte) for (const b of tinte) perechi.push([a, b]);   // golurile directe: poartă ↔ capăt, capăt ↔ capăt, poartă ↔ poartă
for (const m of masini) if (m.casa) for (const o of m.obs) perechi.push([o.a, m.casa], [m.casa, o.b], [o.a, o.b]);
for (let i = 0; i < perechi.length; i += 8) await Promise.all(perechi.slice(i, i + 8).map(([a, b]) => valhalla(a, b)));
if (nule.length) { console.error(`Valhalla a întors null de ${nule.length} ori (ex. ${nule[0]}) — planul nu se face pe cifre incomplete`); process.exit(3); }
mkdirSync(dirname(CACHE_F), { recursive: true });
writeFileSync(CACHE_F + '.tmp', JSON.stringify(Object.fromEntries(cache))); renameSync(CACHE_F + '.tmp', CACHE_F);
// obiceiul fiecărei mașini pe felul golului (majoritatea zilelor; egalitate = acasă)
for (const m of masini) { if (!m.casa) continue; const v = {};
  for (const o of m.obs) { const acasa = o.ocol || o.km >= 0.8 * (d(o.a, m.casa) + d(m.casa, o.b)); (v[o.f] ??= [0, 0])[acasa ? 0 : 1]++; }
  m.acasaVot = v; m.acasa = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x[0] >= x[1]])); delete m.obs; }

// ---- starea de azi și optimizarea
const cost = (m, asg) => (m.casa ? kmSapt(m, [asg.s1, asg.s2], d) : 0);
const azi = new Map(masini.map((m) => [m.m, { s1: m.sarcini.s1 ?? null, s2: m.sarcini.s2 ?? null }]));
const forma = (S) => `${S.tur ? 'T' : '-'}${S.ret ? 'R' : '-'}`;
const semn = (S) => `${S.schimb}|${S.tur?.lin ?? ''}|${S.ret?.lin ?? ''}`;
const voie = (m, S) => {                       // capacitatea, aceeași formă (tur+retur / doar tur / doar retur), fără casă = pe loc
  if (S.azi === m.m) return true;
  if (!m.casa || !M.get(S.azi).casa) return false;
  const own = azi.get(m.m)[S.schimb]; if (!own || (!process.env.PLAN_FARA_FORMA && forma(own) !== forma(S))) return false;
  if (process.env.PLAN_FARA_CLASA) return true;   // doar pentru sensibilitate (plan-v1.md), niciodată în rând
  return m.clasa === S.clasa || m.clasa === M.get(S.azi).clasa;
};
const plan = new Map([...azi].map(([k, v]) => [k, { ...v }]));
const obiectiv = (m, asg) => cost(m, asg) + PENAL_MUTARE * ['s1', 's2'].filter((s) => asg[s] && asg[s].azi !== m.m).length;
let runde = 0, total0 = Infinity;
for (;;) {
  for (const s of ['s1', 's2']) {
    const rows = masini.filter((m) => plan.get(m.m)[s]); const cols = rows.map((m) => plan.get(m.m)[s]);
    const C = rows.map((m) => cols.map((S) => (voie(m, S) ? obiectiv(m, { ...plan.get(m.m), [s]: S }) : 1e9)));
    const p = ungar(C);
    rows.forEach((m, i) => { plan.get(m.m)[s] = cols[p[i]]; });
  }
  // schimburi două câte două (prinde legătura dintre schimburi prin poartă), până nu mai scade
  let bun = true;
  while (bun) { bun = false;
    for (const s of ['s1', 's2']) { const rows = masini.filter((m) => plan.get(m.m)[s]);
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j], Pa = plan.get(a.m), Pb = plan.get(b.m);
        if (!voie(a, Pb[s]) || !voie(b, Pa[s])) continue;
        const inainte = obiectiv(a, Pa) + obiectiv(b, Pb), dupa = obiectiv(a, { ...Pa, [s]: Pb[s] }) + obiectiv(b, { ...Pb, [s]: Pa[s] });
        if (dupa < inainte - 1e-6) { const t = Pa[s]; Pa[s] = Pb[s]; Pb[s] = t; bun = true; } } } }
  const tot = masini.reduce((a, m) => a + obiectiv(m, plan.get(m.m)), 0); runde++;
  if (tot > total0 - 1e-6 || runde > 20) break; total0 = tot;
}
// sarcini cu aceleași linii pe același schimb sunt interschimbabile: o mașină care a primit «aceeași» sarcină ca a ei își ia înapoi
// sarcina proprie (altfel textul ar spune «A lasă Prajila lui B; B lasă Prajila lui A»); se păstrează doar dacă nu crește suma
for (let ok = true; ok;) { ok = false;
  for (const m of masini) for (const s of ['s1', 's2']) { const S = plan.get(m.m)[s], own = azi.get(m.m)[s];
    if (!S || S === own || semn(S) !== semn(own)) continue;
    const x = masini.find((q) => plan.get(q.m)[s] === own); if (!x) continue;
    const Pm = plan.get(m.m), Px = plan.get(x.m);
    const inainte = cost(m, Pm) + cost(x, Px), dupa = cost(m, { ...Pm, [s]: own }) + cost(x, { ...Px, [s]: S });
    if (voie(x, S)) { Pm[s] = own; Px[s] = S; ok = true; } } }
// ---- lanțurile = ciclurile de mutări pe un schimb (A preia de la B, B de la C…, ultimul de la A); fiecare ciclu se poate aplica
// singur. Se aplică pe rând, cel mai bun întâi; economia unui lanț = câștigul LUI peste lanțurile deja aplicate (deci Σ lanțuri =
// economia planului, exact). Sub PRAG_LANT km/săpt. → deoparte, neaplicat.
const mutariToate = [];
for (const m of masini) for (const s of ['s1', 's2']) { const S = plan.get(m.m)[s]; if (S && S.azi !== m.m) mutariToate.push({ S, dela: S.azi, la: m.m, schimb: s }); }
const kmInainte = new Map(masini.map((m) => [m.m, cost(m, azi.get(m.m))]));
const lanturi = [], deoparte = [];
const aplica = (baza, c) => { const p = new Map([...baza].map(([k, v]) => [k, { ...v }])); for (const q of c) p.get(q.la)[q.schimb] = q.S; return p; };
const sumaPlan = (p, xs) => xs.reduce((a, x) => a + cost(M.get(x), p.get(x)), 0);
let curent = new Map([...azi].map(([k, v]) => [k, { ...v }]));
let ramase = cicluri(mutariToate);
while (ramase.length) {
  const eval1 = ramase.map((c) => { const xs = [...new Set(c.map((q) => q.la))]; const p = aplica(curent, c); return { c, xs, ec: sumaPlan(curent, xs) - sumaPlan(p, xs), p }; })
    .sort((a, b) => b.ec - a.ec);
  const best = eval1[0]; ramase = ramase.filter((c) => c !== best.c);
  const ord = best.c, ec = best.ec;
  const casaSpusa = new Set();
  const text = ord.map((q) => { const t = `${q.dela} lasă ${q.S.nume} (schimbul ${q.schimb.slice(1)}) lui ${q.la}${casaSpusa.has(q.la) ? '' : `, care stă la ${loc(M.get(q.la).casa)}`}`; casaSpusa.add(q.la); return t; }).join('; ') + ` → −${Math.round(ec)} km/săpt.`;
  const dLei = best.xs.map((x) => ({ x, dk: cost(M.get(x), curent.get(x)) - cost(M.get(x), best.p.get(x)), lk: M.get(x).leiKm }));
  const L = { economieKmSapt: r1(ec), masini: best.xs,
    leiSapt: dLei.every((q) => q.lk != null) ? Math.round(dLei.reduce((a, q) => a + q.dk * q.lk, 0)) : null,
    faraNorma: dLei.filter((q) => q.lk == null).map((q) => q.x),
    peMasina: dLei.map((q) => ({ m: q.x, kmSapt: r1(-q.dk) })),
    mutari: ord.map((q) => ({ linie: q.S.nume, tur: q.S.tur?.lin ?? null, retur: q.S.ret?.lin ?? null, schimb: q.schimb, dela: q.dela, la: q.la, zile: q.S.zile.length })), text };
  if (ec >= PRAG_LANT) { lanturi.push(L); curent = best.p; } else deoparte.push(L);
}
for (const [k, v] of curent) plan.set(k, v);

// ---- rezultatul pe mașini și flotă
const zileLucru = (asg) => new Set([asg.s1, asg.s2].filter(Boolean).flatMap((S) => S.zile)).size;
const eticheta = (S) => (S ? S.nume : null);
const rand = masini.map((m) => { const a = azi.get(m.m), p = plan.get(m.m), ki = kmInainte.get(m.m), kd = cost(m, p);
  return { m: m.m, casa: m.casa ? loc(m.casa) : null, clasa: m.clasa, schimburi: m.doua ? 2 : 1, leiKm: m.leiKm, acasa: m.acasa, acasaVot: m.acasaVot,
    inainte: { s1: eticheta(a.s1), s2: eticheta(a.s2), zile: zileLucru(a), kmGoiSapt: r1(ki), kmGoiZi: zileLucru(a) ? r1(ki / zileLucru(a)) : 0 },
    dupa: { s1: eticheta(p.s1), s2: eticheta(p.s2), zile: zileLucru(p), kmGoiSapt: r1(kd), kmGoiZi: zileLucru(p) ? r1(kd / zileLucru(p)) : 0 } }; });
const sI = masini.reduce((a, m) => a + kmInainte.get(m.m), 0), sD = masini.reduce((a, m) => a + cost(m, plan.get(m.m)), 0);
const leiEc = lanturi.reduce((a, L) => a + (L.leiSapt ?? 0), 0);
const faraNormaCuMutari = [...new Set(lanturi.flatMap((L) => L.faraNorma))];
const lanturiFaraLei = lanturi.filter((L) => L.leiSapt == null).length;

// ---- controalele
const C = {};
const toate = masini.flatMap((m) => ['s1', 's2'].map((s) => plan.get(m.m)[s]).filter(Boolean));
C.fiecareSarcinaOData = { trece: toate.length === sarcini.length && new Set(toate.map((S) => S.id)).size === sarcini.length, sarcini: sarcini.length, acoperite: new Set(toate.map((S) => S.id)).size };
C.capacitate = { trece: masini.every((m) => ['s1', 's2'].every((s) => !plan.get(m.m)[s] || voie(m, plan.get(m.m)[s]))) };
C.schimbPastrat = { trece: masini.every((m) => ['s1', 's2'].every((s) => !!plan.get(m.m)[s] === !!azi.get(m.m)[s] && (!plan.get(m.m)[s] || plan.get(m.m)[s].schimb === s))) };
C.oLiniePeSchimb = { trece: C.schimbPastrat.trece };    // pe construcție: un loc s1 și un loc s2 pe mașină
const sumaLant = lanturi.reduce((a, L) => a + L.economieKmSapt, 0);
C.economie = { trece: Math.abs((sI - sD) - sumaLant) < 0.5 && sD <= sI + 1e-6, inainte: r1(sI), dupa: r1(sD), diferenta: r1(sI - sD), sumaLanturi: r1(sumaLant) };
// modelul «înainte» față de GPS (rândul): km goi = total − cu oameni, pe zilele-mașină acoperite de sarcini
const goiGps = { total: 0, farăParc: 0 };
for (const m of masini) { const zs = new Set([m.sarcini.s1, m.sarcini.s2].filter(Boolean).flatMap((S) => S.zile));
  for (const x of Z.zile.filter((q) => q.m === m.m && zs.has(q.z))) { const k = x.km; goiGps.total += x.total - (k.cuOameni ?? 0);
    goiGps.farăParc += (k.livrare ?? 0) + (k.golRuta ?? 0) + (k.golTure ?? 0) + (k.legatura ?? 0); } }
C.modelVsGps = { modelInainte: r1(sI), gpsGoi: r1(goiGps.total), gpsGoiFaraParc: r1(goiGps.farăParc), abatere: r1((sI - goiGps.total) / goiGps.total * 100), abatereFaraParc: r1((sI - goiGps.farăParc) / goiGps.farăParc * 100),
  trece: Math.abs(sI - goiGps.total) / goiGps.total <= 0.05 };
// unde stă diferența model ↔ GPS: pe bucățile zilei (start, final, golurile), zilele-mașină cu sarcini, starea de azi
const buc = Object.fromEntries(['start', 'final', 'dim', 'seara', 'zi', 'alt', 'direct', 'inAfara'].map((k) => [k, { model: 0, gps: 0 }]));
for (const m of masini) { if (!m.casa) continue; const a = azi.get(m.m); const zs = new Set([a.s1, a.s2].filter(Boolean).flatMap((S) => S.zile));
  for (const x of Z.zile.filter((q) => q.m === m.m && zs.has(q.z))) {
    const o = kmZiDet(m, [a.s1, a.s2], x.z, d); for (const [k, v] of Object.entries(o)) buc[k].model += v;
    const main = new Map([a.s1, a.s2].filter((S) => S && S.zile.includes(x.z)).flatMap((S) => [S.tur && ['t' + S.schimb, S.tur.lin], S.ret && ['r' + S.schimb, S.ret.lin]]).filter(Boolean));
    const princ = [];
    for (const k of ['ts1', 'ts2', 'rs1', 'rs2']) { if (!main.has(k)) continue;
      const c = x.seg.filter((s) => s.cat === 'cuOameni' && (s.sens === 'tur' ? 't' : 'r') + s.schimb === k && s.lin === main.get(k)).sort((p, q) => q.km - p.km)[0];
      if (c) princ.push({ k, s: c }); }
    const goi = x.seg.filter((s) => s.cat !== 'cuOameni'); const km = (s) => s.km + (s.golImpus || 0);
    if (!princ.length) { buc.inAfara.gps += goi.reduce((a0, s) => a0 + km(s), 0); continue; }
    for (const s of goi) {
      let f = 'inAfara';
      if (s.t1 <= princ[0].s.t0) f = 'start'; else if (s.t0 >= princ.at(-1).s.t1) f = 'final';
      else for (let i = 1; i < princ.length; i++) { const p = princ[i - 1], n = princ[i];
        if (s.t0 >= p.s.t1 && s.t1 <= n.s.t0) { f = p.k === 'ts2' && n.k === 'rs1' ? 'direct' : p.k === 'ts1' && n.k === 'ts2' ? 'dim' : p.k === 'rs1' && n.k === 'rs2' ? 'seara' : p.k.slice(1) === n.k.slice(1) ? 'zi' : 'alt'; break; } }
      buc[f].gps += km(s);
    } } }
for (const v of Object.values(buc)) { v.model = r1(v.model); v.gps = r1(v.gps); v.dif = r1(v.model - v.gps); }
C.modelVsGps.peBucati = buc;
const perMasinaGps = masini.map((m) => { const zs = new Set([m.sarcini.s1, m.sarcini.s2].filter(Boolean).flatMap((S) => S.zile));
  const g = Z.zile.filter((q) => q.m === m.m && zs.has(q.z)).reduce((a, x) => a + x.total - (x.km.cuOameni ?? 0), 0);
  return { m: m.m, model: r1(kmInainte.get(m.m)), gps: r1(g), dif: r1(kmInainte.get(m.m) - g) }; }).sort((a, b) => a.dif - b.dif);

const out = { sapt: Object.values(A.fereastra)[0][0], pana: Object.values(A.fereastra)[0][1], versiune: 'plan-schimb v1.2 (ION-108 A)', rulat: new Date().toISOString(),
  model: { unitate: 'sarcina = linia turului + linia returului pe un schimb, zilele ei; se mută întreagă', km: 'Valhalla, costing bus, casă ↔ capăt, casă ↔ poartă, poartă ↔ poartă',
    goluri: 'ts2→rs1 direct poartă→poartă; celelalte goluri prin casă dacă mașina merge azi acasă în golul de felul acesta (obiceiul măsurat pe GPS, al mașinii), altfel direct', clasa: 'locurile liniei sau clasa mașinii de azi', pragLant: PRAG_LANT },
  inainte: { kmGoiSapt: r1(sI) }, dupa: { kmGoiSapt: r1(sD) },
  economie: { kmSapt: r1(sI - sD), leiSapt: Math.round(leiEc), leiNota: 'lei = Σ pe lanțurile în care toate mașinile au normă (km × lei/km al fiecărei mașini)', lanturiFaraLei, faraNorma: faraNormaCuMutari },
  lanturi, deoparte: deoparte.map((L) => ({ economieKmSapt: L.economieKmSapt, text: L.text, mutari: L.mutari })),
  masini: rand, neregulate, faraCasa, control: C, modelVsGpsPeMasina: perMasinaGps, valhalla: { noi, inCache: cache.size } };
console.log(`${out.sapt}: ${masini.length} mașini, ${sarcini.length} sarcini · înainte ${r1(sI)} → după ${r1(sD)} km goi/săpt. · economie ${r1(sI - sD)} km ≈ ${Math.round(leiEc)} lei (fără normă: ${faraNormaCuMutari.join(' ') || '—'}) · lanțuri ${lanturi.length} (deoparte ${deoparte.length}) · runde ${runde} · Valhalla noi ${noi}`);
for (const [k, v] of Object.entries(C)) console.log(`  control ${k}: ${v.trece ? 'TRECE' : 'PICĂ'} ${JSON.stringify(v)}`);
for (const L of lanturi) console.log(`  ${L.economieKmSapt} km · ${L.text}`);
for (const L of deoparte) console.log(`  (deoparte) ${L.economieKmSapt} km · ${L.text}`);
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT + '.tmp', JSON.stringify(out, null, 1)); renameSync(OUT + '.tmp', OUT); console.log(`scris ${OUT}`); }
if (!Object.values(C).filter((c) => c !== C.modelVsGps).every((c) => c.trece)) process.exit(1);
