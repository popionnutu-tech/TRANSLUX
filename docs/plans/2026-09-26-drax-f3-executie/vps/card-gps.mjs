// Idealul v2, pasul 5c (execuție ION-94 E.1b; verdictul dezbaterii Claude + Codex pe verificarea 1 ION-95, pct. 1–2 și 7):
// cardul fiecărei linii = ETALONUL GPS COMPLETAT (mediana km GPS pe zilele-pereche bune, pe poarta fiecărui sens, + raza porții
// EST 0,6 / VEST 0,5), cu modulele COMUNE ale verificatorului, importate (citire, fără copie modificată):
//   /home/verif/verificator/cod/etalon-gps.mjs (etalonul; folosește el însuși filtru-rupte.mjs)
//   /home/verif/verificator/cod/filtru-rupte.mjs (urma ruptă — scoasă și din C47, ca în drax.mjs)
// Rulat în lant.sh după ultima operație care rescrie scheletul (alege / schimburi) și înainte de control / pagină.
// Excepții — cardul vechi (ION-71) rămâne și linia primește `diagnostic: "diagnostic cerut"` + `diagnosticMotiv`:
//   · «< 3 perechi bune»   etalonul GPS nedeterminat după filtru;
//   · «C47 x %»            sub 60 % din picioarele de pe poarta sensului în ±max(10 % × E, 1 km);
//   · «variante de drum» / «porți divergente»  mediana pe poarta sensului față de mediana pe orice poartă > 5 %
//                           (porți divergente = turul și returul liniei pe porți diferite).
// 0 km schimbați de mână. Regula lui Ion 26.09: «nu folosim geometria, folosim km reali din GPS».
//   cd /root/lde-worker/drax/cod/ideal-v2 && node card-gps.mjs ../../date/ideal-v2
import { readFileSync, writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
import { creeazaEtalon, VERSIUNE_ETALON } from '/home/verif/verificator/cod/etalon-gps.mjs';
import { creeazaFiltru, VERSIUNE_FILTRU } from '/home/verif/verificator/cod/filtru-rupte.mjs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };
const DIR = process.argv[2]; if (!DIR || !DIR.includes('ideal-v2')) { console.error('card-gps.mjs <…/ideal-v2>'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const S = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), N = J('nomenclator.json');
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8'));
// pragurile = drax.mjs:39-55 (P)
const P = { DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, KM_5: 0.05, C47_TOL: 0.10, C47_MIN_KM: 1, C47_ABATERE: 0.60, R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, SEPT: '2026-09-01', C4_FEREASTRA_MIN: 15 };
const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P });
const FR = creeazaFiltru({ porti: PORTI, E });
const okey = (c) => `${c.m}|${c.t0}|${c.km}`;
// SCURTE (drax.mjs:159): cursele scurte ale perechilor «sigur» (aceeași plăcuță, același sens, suprapuse în timp, ≤ 15 min)
const obsPe = new Map(); for (const o of O.curse) { const k = okey(o); (obsPe.get(k) ?? obsPe.set(k, []).get(k)).push(o); }
const SCURTE = new Set(); const byMZ = new Map();
for (const d of D.curse) { const k = `${d.m}|${new Date(new Date(d.t0).getTime() + 3 * 3600000).toISOString().slice(0, 10)}`; (byMZ.get(k) ?? byMZ.set(k, []).get(k)).push(d); }
for (const arr of byMZ.values()) { arr.sort((x, y) => new Date(x.t0) - new Date(y.t0));
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const a = arr[i], b = arr[j];
    if ((new Date(b.t0) - new Date(a.t0)) / 60000 > P.C4_FEREASTRA_MIN) break;
    if (a.dinP !== b.dinP || a.spreP !== b.spreP || !(new Date(b.t0) < new Date(a.t1))) continue;
    if (!(obsPe.get(okey(a))?.length || obsPe.get(okey(b))?.length)) continue;
    for (const o of obsPe.get(okey(a.km >= b.km ? b : a)) ?? []) SCURTE.add(okey(o)); } }
const areKm = (l) => typeof l.km === 'number' && l.km > 0;
const rap = []; let schimbate = 0, cuSteag = 0, rupteTot = 0;
for (const l of S) {
  if (!areKm(l) || l.informativ) continue;
  delete l.diagnostic; delete l.diagnosticMotiv; delete l.card;
  const m = EG.metrici(l, new Set()), E0 = m.etalonGPS;
  const vechi = { km: l.km, kmZi: l.kmZi }, motive = [];
  let c47 = null, pe = [];
  if (E0 == null) motive.push(`< 3 perechi bune (${m.nBune})`);
  else {
    const src = (c) => l.sursa === 'toate' || c.zi >= P.SEPT, tol = Math.max(P.C47_TOL * E0, P.C47_MIN_KM);
    const peP = (c) => c.poarta === (c.sens === 'tur' ? l.real?.poartaTur : l.real?.poartaRetur);
    const o = O.curse.filter((c) => c.schimb && c.ruta === l.ruta && c.linie === l.linie && src(c) && !SCURTE.has(okey(c)));
    rupteTot += o.filter((c) => FR.rupt(c)).length;
    pe = o.filter((c) => !FR.rupt(c) && !c.rt && peP(c));
    const k = pe.filter((c) => EG.plinC(c) != null && Math.abs(EG.plinC(c) - E0) <= tol).length;
    c47 = pe.length ? k / pe.length : null;
    if (c47 != null && c47 < P.C47_ABATERE) motive.push(`C47 ${(100 * c47).toFixed(0)} %`);
    if (m.etalonOricePoarta != null && Math.abs(E0 - m.etalonOricePoarta) / E0 > P.KM_5)
      motive.push(`${l.real?.poartaTur && l.real?.poartaRetur && l.real.poartaTur !== l.real.poartaRetur ? 'porți divergente' : 'variante de drum'} (poarta sensului ${E0} / orice poartă ${m.etalonOricePoarta})`);
  }
  const meta = { versiune: `${VERSIUNE_ETALON} · ${VERSIUNE_FILTRU}`, etalonGPS: E0, etalonBrut: m.etalonBrut, etalonOricePoarta: m.etalonOricePoarta,
    zileBuneGPS: m.nBune, picioareRupte: m.rupte, c47: c47 == null ? null : +(100 * c47).toFixed(0), picioare: pe.length };
  if (motive.length) {
    cuSteag++; l.diagnostic = 'diagnostic cerut'; l.diagnosticMotiv = motive.join('; ');
    l.card = { sursa: 'card vechi (lanțul ION-71)', ...meta };
    rap.push(`${l.ruta}|${l.linie}: DIAGNOSTIC CERUT — ${l.diagnosticMotiv}; card vechi ${l.km} (km/zi ${l.kmZi}) rămâne`); continue;
  }
  if (l.km !== E0) schimbate++;
  l.km = E0; if (typeof l.tureZi === 'number') l.kmZi = +(2 * E0 * l.tureZi).toFixed(1);
  l.card = { sursa: 'etalon GPS completat', ...meta, vechi };
  rap.push(`${l.ruta}|${l.linie}: card ${vechi.km} → ${E0} km GPS completat (brut ${m.etalonBrut}; ${m.nBune} zile; C47 ${meta.c47 ?? '—'} %) · km/zi ${vechi.kmZi} → ${l.kmZi}`);
}
scrieAtomic(`${DIR}/schelet-ideal.json`, JSON.stringify(S));
scrieAtomic(`${DIR}/card-gps-raport.txt`, rap.join('\n') + '\n');
console.log(`card GPS: ${S.filter((l) => l.card?.sursa === 'etalon GPS completat').length} linii cu etalonul GPS completat (${schimbate} schimbate) · diagnostic cerut ${cuSteag} · picioare cu urmă ruptă ${rupteTot} · SCURTE ${SCURTE.size} · ${VERSIUNE_ETALON}`);
console.log(`km/zi total: ${S.filter((l) => areKm(l) && !l.informativ).reduce((s, l) => s + (l.kmZi || 0), 0).toFixed(0)}`);
