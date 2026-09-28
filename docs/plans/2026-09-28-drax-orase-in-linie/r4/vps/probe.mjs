// Drăxlmaier F2 — probele, pe zile REALE și pe TOATĂ flota (v2, triaj r1: S4 / B7).
//   P1–P4 = probele obligatorii din umbrelă — CONSISTENȚĂ INTERNĂ (verifică regulile care au creat segmentele):
//   P1 doarme în afara rutei → livrare > 0 · P2 două linii → legătură > 0 · P3 o pereche + acasă la prânz → gol între ture
//   > 0, fără gol pe rută · P4 două linii + acasă între ele → livrare = doar ocolul, legătura = drumul direct
//   P5–P7 = cazurile defectelor găsite de revizori: P5 mașina care așteaptă în zona uzinei (parc) → R3 = 0 (B1);
//   P6 cursa opusă prinsă în afara ferestrei → nu e livrare economisibilă: e promovată (cu oameni) sau ziua iese din
//   eșantion (B2); P7 excursia în intervalul perechii → deplasare, nu R3 (B4)
//   P8–P9 = probe INDEPENDENTE de cod, pe Valhalla: P8 golul între ture cu trecere pe acasă ≈ poartă → casă → poartă
//   pe șosea ± 20 %; P9 livrarea de dimineață ≈ locul nopții → capătul liniei pe șosea ± 20 %.
//   node probe.mjs  →  date/economie-probe.json
import { readFileSync } from 'node:fs';
import { D, PANA, hav, r1, med, kmDrum, salveazaCache, verificaValhalla, scrieAtomic } from './comun.mjs';
const Z = JSON.parse(readFileSync(`${D}/economie-zile.json`, 'utf8'));
const A = JSON.parse(readFileSync(`${D}/economie.json`, 'utf8'));
const S = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const O = JSON.parse(readFileSync(`${D}/economie-obs.json`, 'utf8')).curse;
const sateLin = new Map(S.map((l) => [`${l.ruta}|${l.linie}`, (l.sateDrum ?? []).map((s) => ({ lat: s.c[0], lon: s.c[1] })).concat(l.capatC ? [{ lat: l.capatC[0], lon: l.capatC[1] }] : [])]));
const esantion = new Set(A.zile.filter((x) => !x.exclus).map((x) => `${x.m}|${x.z}`));   // L–V fără jumătate nedetectată (weekendul nu e în eșantion)
const zile = Z.zile.filter((d) => d.tipar !== 'fara curse' && !A.atipice[d.z] && d.z <= PANA);
const bucati = (d, f = () => true) => d.seg.filter(f).map((s) => `${s.ora} ${s.cat} ${s.km}${s.golImpus ? ` (+${s.golImpus} gol impus)` : ''}${s.r3km != null ? ` [R3 ${s.r3km}]` : ''}${s.lin ? ' ' + s.lin : ''}${s.motiv ? ' — ' + s.motiv : ''}`);
const P = {};
const proba = (id, tip, titlu, cond, trece, arata) => {
  const c = zile.filter(cond), ok = c.filter(trece), pic = c.filter((d) => !trece(d));
  const ex = [...ok].sort((a, b) => b.total - a.total)[Math.floor(ok.length / 2)];
  P[id] = { tip, titlu, conditie: c.length, trec: ok.length, pica: pic.length, picaExemple: pic.slice(0, 10).map((d) => `${d.m} ${d.z}`),
    exemplu: ex ? { m: ex.m, z: ex.z, total: ex.total, bucati: bucati(ex, arata ? (s) => arata(ex, s) : undefined) } : null };
  console.log(`${id} ${titlu}: condiția ${c.length} · trec ${ok.length} · pică ${pic.length}${pic.length ? ' (' + P[id].picaExemple.join(', ') + ')' : ''}`);
};
const inAfaraRutei = (d) => d.noapteA && d.noapteA.tip === 'loc' && d.linii.every((l) => (sateLin.get(l) ?? []).every((s) => hav(s, d.noapteA) > 3));
proba('P1', 'intern', 'doarme în afara rutei → livrare > 0', inAfaraRutei, (d) => d.km.livrare > 0, (d, s) => s.cat === 'livrare');
proba('P2', 'intern', 'două linii → legătură > 0', (d) => d.linii.length >= 2 && !d.jumatati.length, (d) => d.km.legatura > 0, (d, s) => ['legatura', 'livrare'].includes(s.cat));
const gt = (d) => d.seg.filter((s) => s.cat === 'golTure');
proba('P3', 'intern', 'o pereche + acasă la prânz → gol între ture > 0, fără gol pe rută', (d) => d.perechi.length === 1 && gt(d).some((s) => s.pePeAcasa),
  (d) => { const g = gt(d).find((s) => s.pePeAcasa); return g && g.km > 0 && !d.seg.some((s) => s.cat === 'golRuta' && s.t0 >= g.t0 && s.t1 <= g.t1); }, (d, s) => s.cat !== 'cuOameni');
const ocolDif = (d) => d.seg.filter((s) => s.ocol && s.cat === 'livrare' && s.prevLin && s.nextLin && s.prevLin !== s.nextLin);
proba('P4', 'intern', 'două linii + acasă între ele → livrare = doar ocolul, legătura = drumul direct', (d) => ocolDif(d).length > 0,
  (d) => ocolDif(d).every((o) => { const dir = d.seg.find((s) => s.direct && s.t0 === o.t0 && s.t1 === o.t1);
    return o.km > 0 && (dir ? dir.cat === 'legatura' && dir.km > 0 : /\(100 %/.test(o.motiv)); }), (d, s) => s.ocol || s.direct);
// P5 — B1: orice interval de pereche rămas în zona uzinei (≤ 3 km de porți / parc) are R3 = 0; 293QVT și 346KAJ
proba('P5', 'defect', 'km-ii din zona uzinei ai oricărui interval nu intră în R3 (intervalul întreg în zonă → R3 = 0)', (d) => gt(d).length > 0, (d) => gt(d).every((s) => (!s.inZona || s.r3km === 0) && Math.abs((s.r3km ?? 0) + (s.kmZona ?? 0) - s.km) <= 0.2),
  (d, s) => s.cat === 'golTure' || s.cat === 'parc');
P.P5.masini = A.masini.filter((x) => ['293QVT', '346KAJ'].includes(x.m)).map((x) => ({ m: x.m, R3: x.R3, deja: x.deja, v1: x.m === '293QVT' ? 855.9 : 456.4 }));
// P6 — B2: cursa opusă a unei jumătăți, prinsă în afara ferestrei → promovată (cu oameni) sau ziua e în afara eșantionului
const afara = new Map(); for (const o of O.filter((o) => !o.schimb)) { const k = `${o.m}|${o.zi}`; (afara.get(k) ?? afara.set(k, []).get(k)).push(o); }
const prom = new Set((Z.promovate ?? []).map((p) => `${p.m}|${p.zi}`));
proba('P6', 'defect', 'cursa opusă prinsă în afara ferestrei → cu oameni (promovată) sau zi scoasă din eșantion', (d) => d.jumatati.some((j) => j.motiv === 'in afara ferestrei') || prom.has(`${d.m}|${d.z}`),
  (d) => d.jumatati.filter((j) => j.motiv === 'in afara ferestrei' && !j.reala).length === 0 || !esantion.has(`${d.m}|${d.z}`),
  (d, s) => s.cat === 'cuOameni' || s.cat === 'livrare');
P.P6.promovateCuOameni = (Z.promovate ?? []).filter((p) => zile.find((d) => d.m === p.m && d.z === p.zi)?.seg.some((s) => s.cat === 'cuOameni' && s.inAfara)).length;
P.P6.promovate = (Z.promovate ?? []).length;
// P7 — B4: intervalul perechii care iese la > 15 km de ancore are partea în exces la deplasare
proba('P7', 'defect', 'excursie în intervalul perechii → deplasare, nu R3', (d) => gt(d).some((s) => s.departe > 15),
  (d) => gt(d).filter((s) => s.departe > 15).every((s) => s.excursieKm > 0 && d.seg.some((q) => q.cat === 'deplasare' && q.t0 === s.t0)),
  (d, s) => s.cat === 'golTure' || s.cat === 'deplasare');
const b146 = zile.find((d) => d.m === '146BRAZ' && d.z === '2026-09-17');
P.P7.caz146BRAZ = b146 ? bucati(b146, (s) => s.cat === 'golTure' || s.cat === 'deplasare') : null;
// P8 / P9 — independente, pe șosea
const tol = (x, ref) => ref > 0 && Math.abs(x - ref) / ref <= 0.2;
const P8 = [];   // P8 v2: tot intervalul față de poartă → casă → poartă (păstrat pentru «înainte»)
for (const d of zile) for (const s of gt(d)) {
  if (!s.pePeAcasa || s.inZona || !s.de || !s.pana) continue;
  const casa = d.noapteA?.tip === 'loc' ? d.noapteA : d.noapteB?.tip === 'loc' ? d.noapteB : null; if (!casa) continue;
  const a = { lat: s.de[0], lon: s.de[1] }, b = { lat: s.pana[0], lon: s.pana[1] };
  const k1 = await kmDrum(a, casa), k2 = await kmDrum(casa, b); if (k1 == null || k2 == null) continue;
  const ref = k1 + k2, km = s.km + (s.excursieKm ?? 0);
  P8.push({ m: d.m, z: d.z, km: r1(km), ref: r1(ref), rap: +(km / ref).toFixed(2), ok: tol(km, ref) });
}
P.P8v2 = { tip: 'independent', titlu: 'v2: tot golul între ture pe acasă ≈ poartă → casă → poartă pe șosea ± 20 %', conditie: P8.length, trec: P8.filter((x) => x.ok).length,
  pica: P8.filter((x) => !x.ok).length, raportMedian: med(P8.map((x) => x.rap)), picaExemple: P8.filter((x) => !x.ok).slice(0, 10).map((x) => `${x.m} ${x.z} ${x.km}/${x.ref}`) };
const Q = A.flota.P8;
P.P8 = { tip: 'independent', titlu: 'v3: km-ii R3 din afara zonei ≈ ieșirea din zonă → casă → intrarea în zonă pe șosea ± 20 % (poarta: > 1/3 în afara toleranței → plafonare)', conditie: Q.intervale, trec: Q.intervale - Q.pica, pica: Q.pica,
  raportMedian: Q.raportMedian, plafon: Q.plafon, picaExemple: Q.lista.filter((x) => !x.ok).slice(0, 10).map((x) => `${x.m} ${x.z} ${x.km}/${x.ref}`) };
const P9 = [];
for (const d of zile) {
  const s = d.seg.find((q) => q.cat === 'livrare' && q.motiv?.startsWith('de la locul nopții') && q.noapteTip === 'loc' && !q.golImpus);
  const leg = d.seg.find((q) => q.cat === 'cuOameni'); if (!s || !leg || !d.noapteA || leg.sens !== 'tur') continue;
  // ION-124 (Codex r2 C2): capătul efectiv — prima urcare din oraș la cursa prelungită, altfel capatC
  const cap = leg.prelungit && leg.de ? { lat: leg.de[0], lon: leg.de[1] } : Z.linii[leg.lin]?.capatC; if (!cap) continue;
  const ref = await kmDrum(d.noapteA, cap); if (ref == null || ref < 2) continue;
  P9.push({ m: d.m, z: d.z, km: s.km, ref: r1(ref), rap: +(s.km / ref).toFixed(2), ok: tol(s.km, ref) });
}
P.P9 = { tip: 'independent', titlu: 'livrarea de dimineață ≈ locul nopții → capătul liniei pe șosea ± 20 %', conditie: P9.length, trec: P9.filter((x) => x.ok).length,
  pica: P9.filter((x) => !x.ok).length, raportMedian: med(P9.map((x) => x.rap)), picaExemple: P9.filter((x) => !x.ok).slice(0, 10).map((x) => `${x.m} ${x.z} ${x.km}/${x.ref}`),
  subEtalon: P9.filter((x) => x.rap < 0.8).length, pesteEtalon: P9.filter((x) => x.rap > 1.2).length };
for (const k of ['P8v2', 'P8', 'P9']) console.log(`${k} ${P[k].titlu}: ${P[k].trec} / ${P[k].conditie} în ± 20 % · raport median ${P[k].raportMedian}${k === 'P9' ? ` · sub 0,8: ${P.P9.subEtalon}, peste 1,2: ${P.P9.pesteEtalon}` : ''} · ex. picate: ${P[k].picaExemple.slice(0, 5).join(', ')}`);
console.log(`P5 ${JSON.stringify(P.P5.masini)} · P6 promovate cu oameni ${P.P6.promovateCuOameni}/${P.P6.promovate} · P7 146BRAZ 17.09: ${JSON.stringify(P.P7.caz146BRAZ)}`);
// P10 (Codex r2, C3): intervalul perechii tăiat la cursa de prânz; bucățile după liniile adiacente. Sintetic (pur) + cazurile reale.
{
  const { taieLaPranz } = await import('./categorii.mjs');
  const runB = [{ t0: 30, t1: 50, ruta: 'R2', linie: 'B', sens: 'tur' }], runA = [{ t0: 30, t1: 50, ruta: 'R1', linie: 'A', sens: 'tur' }];
  const s1 = taieLaPranz(0, 100, 'R1|A', 'R1|A', runB).map((q) => q.cat).join(','), s2 = taieLaPranz(0, 100, 'R1|A', 'R1|A', runA).map((q) => q.cat).join(',');
  const okB = s1 === 'legatura,golRuta,legatura', okA = s2 === 'golRuta,golRuta,golRuta';
  const reale = zile.flatMap((d) => d.seg.filter((s) => s.cursaPranz).map((s) => `${d.m} ${d.z} ${s.ora} ${s.cat}${s.cursaInsasi ? ' (cursa însăși)' : ''} ${s.km} km ${s.prevLin ?? ''} → ${s.nextLin ?? ''}`));
  const cuLinieDiferita = zile.filter((d) => d.seg.some((s) => s.cursaPranz && s.cat === 'legatura')).length;
  P.P10 = { tip: 'defect', titlu: 'interval tur–retur cu cursă de prânz → tăiat la ea; aceeași linie = gol pe rută, linie diferită = legătură', conditie: 2, trec: (okB ? 1 : 0) + (okA ? 1 : 0), pica: (okB ? 0 : 1) + (okA ? 0 : 1),
    picaExemple: [okB ? null : `sintetic A→B→A: ${s1}`, okA ? null : `sintetic A→A→A: ${s2}`].filter(Boolean), sintetic: { AB: s1, AA: s2 }, reale, zileRealeCuLinieDiferita: cuLinieDiferita, exemplu: null };
  console.log(`P10 sintetic A→B→A: ${s1} (${okB ? 'ok' : 'PICĂ'}) · A→A→A: ${s2} (${okA ? 'ok' : 'PICĂ'}) · reale: ${reale.length} bucăți, zile cu linie diferită: ${cuLinieDiferita}`);
  for (const r of reale) console.log('   ' + r);
}
// P11 (ION-119, Codex r1 C1/C3): detectorul cursei între uzine, sintetic — 925FTI (VEST → EST, începe la VEST, stă la EST), trecere în mers prin
// ambele porți (nu intră), dus-întors EST → VEST → EST, drum de 70 min între razele porților (nu intră), ieșire din zonă între porți (nu intră)
{
  const { drumuriIntrePorti } = await import('./categorii.mjs');
  const V = { lat: 47.77408, lon: 27.91593 }, E = { lat: 47.78513, lon: 27.94307 }, N = { lat: 47.84, lon: 27.93 }, M = { lat: 47.7796, lon: 27.9295 };
  const drum = (a, b, t0, min, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ lat: a.lat + (b.lat - a.lat) * i / n, lon: a.lon + (b.lon - a.lon) * i / n, t: t0 + i * min * 60e3 / n }));
  const sta = (g, t0, min) => [{ ...g, t: t0, stat: 1, t1: t0 + min * 60e3 }];
  const T = 1e12;
  const cazuri = [
    ['925FTI VEST→EST', [...drum(V, E, T, 10), ...sta(E, T + 11 * 60e3, 60)], 'VEST → EST'],
    ['trecere în mers', [...drum({ lat: 47.765, lon: 27.90 }, V, T, 3, 6), ...drum(V, E, T + 3 * 60e3, 6), ...drum(E, { lat: 47.79, lon: 27.96 }, T + 9 * 60e3, 3, 6)], ''],
    ['dus-întors', [...sta(E, T, 5), ...drum(E, V, T + 5 * 60e3, 10), ...sta(V, T + 16 * 60e3, 5), ...drum(V, E, T + 21 * 60e3, 10), ...sta(E, T + 32 * 60e3, 30)], 'EST → VEST, VEST → EST'],
    ['70 de minute între porți', [...sta(V, T, 5), ...drum(V, M, T + 5 * 60e3, 4), ...sta(M, T + 10 * 60e3, 70), ...drum(M, E, T + 81 * 60e3, 4), ...sta(E, T + 86 * 60e3, 5)], ''],
    ['iese din zonă', [...sta(V, T, 5), ...drum(V, N, T + 5 * 60e3, 8), ...drum(N, E, T + 13 * 60e3, 8), ...sta(E, T + 22 * 60e3, 5)], ''],
    ['oprire 50 s la ambele porți', [...drum({ lat: 47.765, lon: 27.90 }, V, T, 3, 6).slice(0, -1), ...sta(V, T + 3 * 60e3, 50 / 60), ...drum(V, E, T + 230e3, 8).slice(1, -1), ...sta(E, T + 230e3 + 8 * 60e3, 50 / 60), ...drum(E, { lat: 47.79, lon: 27.96 }, T + 280e3 + 8 * 60e3, 3, 6).slice(1)], ''],
    ['oprire 70 s la ambele porți', [...drum({ lat: 47.765, lon: 27.90 }, V, T, 3, 6), ...sta(V, T + 3 * 60e3, 70 / 60), ...drum(V, E, T + 5 * 60e3, 8), ...sta(E, T + 14 * 60e3, 70 / 60), ...drum(E, { lat: 47.79, lon: 27.96 }, T + 16 * 60e3, 3, 6)], 'VEST → EST'],
  ];
  const rez = cazuri.map(([n, mv, asteptat]) => { const r = drumuriIntrePorti(mv).drum.join(', '); return { n, r, ok: r === asteptat }; });
  P.P11 = { tip: 'defect', titlu: 'cursă între uzine: oprire efectivă la porți, fără trecere în mers, în zonă, ≤ 40 min', conditie: rez.length, trec: rez.filter((x) => x.ok).length,
    pica: rez.filter((x) => !x.ok).length, picaExemple: rez.filter((x) => !x.ok).map((x) => `${x.n}: «${x.r}»`) };
  console.log('P11 cursă între uzine (sintetic): ' + rez.map((x) => `${x.n} «${x.r}» ${x.ok ? 'ok' : 'PICĂ'}`).join(' · '));
  if (P.P11.pica) process.exitCode = 3;
}
// P12 (ION-124, runda 2–3): prelungirea cursei prin orașul rutei — sintetic, pe funcția reală
{
  const { prelungesteCurse } = await import('./categorii.mjs');
  const O = { R19: [{ n: 'Sîngerei', lat: 47.6385, lon: 28.1426 }] }, T = 1e12, M = 60e3;
  const pas = (lat, lon, t, v) => ({ lat, lon, t, v });
  const opr = (lat, lon, t, s) => [pas(lat, lon, t, 5), pas(lat, lon, t + s * 1000, 3)];
  const drumOras = (t) => [pas(47.6385, 28.10, t, 40), pas(47.6385, 28.12, t + 60e3, 40)];
  const leg = (sens, t0, t1) => ({ sens, t0, t1, lin: 'R19|Bilicenii Vechi', schimb: 's1' });
  const run = (L, pts, P = [], nopti = []) => prelungesteCurse({ L, pts, P, nopti, ta: T - 3600e3, tb: T + 36000e3, orase: O });
  const c = [];
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [...drumOras(T), ...opr(47.6385, 28.1426, T + 10 * M, 30), ...opr(47.6365, 28.1500, T + 15 * M, 40), ...opr(47.6340, 28.1600, T + 20 * M, 25), pas(47.66, 28.05, T + 40 * M, 50)];
    run(L, pts); c.push(['3 urcări scurte → prelungit', !!L[0].prelungit && L[0].t0 === T + 10 * M]); }
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [pas(47.6385, 28.13, T + 10 * M, 15), pas(47.6385, 28.14, T + 11 * M, 12), pas(47.6385, 28.15, T + 12 * M, 18)];
    run(L, pts); c.push(['încetinire fără oprire → nu', !L[0].prelungit]); }
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [...opr(47.6385, 28.1426, T + 5 * M, 30), pas(47.63, 28.13, T + 7 * M, 30), ...opr(47.6385, 28.1426, T + 10 * M, 30), pas(47.63, 28.13, T + 12 * M, 30), ...opr(47.6385, 28.1426, T + 15 * M, 30)];
    run(L, pts); c.push(['același semafor de 3 ori → nu', !L[0].prelungit]); }
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [pas(47.6385, 28.1426, T + 10 * M, 3), pas(47.6485, 28.1426, T + 13 * M, 30), pas(47.6365, 28.15, T + 20 * M, 3), pas(47.6465, 28.15, T + 23 * M, 30), pas(47.634, 28.16, T + 26 * M, 3), pas(47.644, 28.16, T + 29 * M, 30)];
    run(L, pts); c.push(['gol GPS de 3 min în mers (punctul următor la 1 km) → nu', !L[0].prelungit]); }
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [...opr(47.6385, 28.1426, T + 10 * M, 30), ...opr(47.6365, 28.1500, T + 15 * M, 40), ...opr(47.6340, 28.1600, T + 20 * M, 25)];
    run(L, pts, [], [{ lat: 47.6380, lon: 28.1440 }, { lat: 47.6362, lon: 28.1510 }]); c.push(['lângă locul nopții → nu (1 urcare rămasă)', !L[0].prelungit]); }
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [...opr(47.6385, 28.1426, T + 10 * M, 30), ...opr(47.6365, 28.1500, T + 15 * M, 40), ...opr(47.6340, 28.1600, T + 20 * M, 25)];
    run(L, pts, [{ stat: 1, t: T + 25 * M, t1: T + 35 * M, lat: 47.62, lon: 28.12 }]); c.push(['staționare > 5 min între urcări și capăt → nu', !L[0].prelungit]); }
  { const L = [leg('retur', T - 30 * M, T), leg('tur', T + 40 * M, T + 60 * M)]; const pts = [...opr(47.6385, 28.1426, T + 10 * M, 30), ...opr(47.6365, 28.1500, T + 20 * M, 40), ...opr(47.6340, 28.1600, T + 25 * M, 25)];
    run(L, pts); c.push(['retur → tur fără odihnă, urcări comune → ambele ambigue', !L[0].prelungit && !L[1].prelungit && L[0].prelungireAmbigua && L[1].prelungireAmbigua]); }
  { const L = [leg('retur', T - 30 * M, T), leg('tur', T + 40 * M, T + 60 * M)]; const pts = [...opr(47.6385, 28.1426, T + 10 * M, 30), ...opr(47.6365, 28.1500, T + 38 * M, 20), ...opr(47.6340, 28.1600, T + 39 * M, 20)];
    run(L, pts, [{ stat: 1, t: T + 12 * M, t1: T + 37 * M, lat: 47.62, lon: 28.12 }]); c.push(['retur → tur cu odihnă 25 min: 1 urcare / 2 urcări → niciuna', !L[0].prelungit && !L[1].prelungit && !L[0].prelungireAmbigua]); }
  { const L = [leg('retur', T, T + 20 * M)]; const pts = [...opr(47.6340, 28.1600, T + 25 * M, 30), ...opr(47.6365, 28.1500, T + 30 * M, 40), ...opr(47.6385, 28.1426, T + 35 * M, 25)];
    run(L, pts); c.push(['retur cu 3 coborâri → prelungit, t1 = ultimul punct lent', !!L[0].prelungit && L[0].t1 === T + 35 * M + 25e3]); }
  { const L = [leg('retur', T, T + 20 * M)]; const pts = [pas(47.6340, 28.1600, T + 25 * M, 0), pas(47.6341, 28.1601, T + 25 * M + 9e3, 20), pas(47.6365, 28.1500, T + 30 * M, 0), pas(47.6366, 28.1501, T + 30 * M + 8e3, 20), pas(47.6385, 28.1426, T + 35 * M, 0), pas(47.6386, 28.1427, T + 35 * M + 10e3, 20)];
    run(L, pts); c.push(['retur cu 3 coborâri de 8–10 s → prelungit', !!L[0].prelungit]); }
  { const L = [leg('tur', T + 40 * M, T + 60 * M)]; const pts = [pas(47.6340, 28.1600, T + 10 * M, 0), pas(47.6341, 28.1601, T + 10 * M + 9e3, 20), pas(47.6365, 28.1500, T + 15 * M, 0), pas(47.6366, 28.1501, T + 15 * M + 8e3, 20), pas(47.6385, 28.1426, T + 20 * M, 0), pas(47.6386, 28.1427, T + 20 * M + 10e3, 20)];
    run(L, pts); c.push(['tur cu opriri de 8–10 s → nu (urcarea cere 15 s)', !L[0].prelungit]); }
  const pica = c.filter((x) => !x[1]);
  P.P12 = { tip: 'defect', titlu: 'prelungirea cursei prin orașul rutei (urcări 15 s – 5 min, ≥ 3 distincte, exclusivitate)', conditie: c.length, trec: c.length - pica.length, pica: pica.length, picaExemple: pica.map((x) => x[0]) };
  console.log('P12 prelungire prin oraș (sintetic): ' + c.map(([n, ok]) => `${n} ${ok ? 'ok' : 'PICĂ'}`).join(' · '));
  if (pica.length) process.exitCode = 3;
}
salveazaCache(); verificaValhalla();
scrieAtomic(`${D}/economie-probe.json`, P);
