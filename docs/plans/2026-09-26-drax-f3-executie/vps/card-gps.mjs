// Pasul E.1b (execuție ION-94, contractul actualizat de sesiune din runda finală ION-95):
// cardul fiecărei linii din schelet-ideal v2 = ETALONUL GPS COMPLETAT (mediana km GPS pe zilele bune, pe poarta fiecărui sens,
// + raza porții EST 0,6 / VEST 0,5 km), calculat cu modulul COMUN al verificatorului /home/verif/verificator/cod/etalon-gps.mjs
// (același cu care verifică ION-95). Excepții (cardul vechi rămâne, cu steag):
//   · linia fără etalon GPS (< 3 zile bune)                        → steag «fără etalon GPS»;
//   · linia cu < 60 % din picioare în ±max(10 % × E, 1 km) (C47)   → steag «diagnostic cerut».
// Pragurile și C47 = copia din drax.mjs (P, C47, SCURTE); nimic citit din drax/date, nimic scris în afara dosarului dat.
// Regula lui Ion 26.09: «nu folosim geometria, folosim km reali din GPS».
//   node card-gps.mjs /root/lde-worker/drax/date/ideal-v2
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { creeazaEtalon, VERSIUNE_ETALON } from '/home/verif/verificator/cod/etalon-gps.mjs';
const DIR = process.argv[2]; if (!DIR || !DIR.includes('ideal-v2')) { console.error('card-gps.mjs <…/ideal-v2>'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const S = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), N = J('nomenclator.json');
const PORTI = JSON.parse(readFileSync('/home/verif/verificator/date/porti-drax.json', 'utf8'));
const P = { DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, C47_TOL: 0.10, C47_MIN_KM: 1, C47_ABATERE: 0.60, R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, SEPT: '2026-09-01', C4_FEREASTRA_MIN: 15 };
const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P });
const okey = (c) => `${c.m}|${c.t0}|${c.km}`;
// SCURTE (drax.mjs:157-158): cursele scurte ale perechilor «sigur» (aceeași mașină, același sens, suprapuse în timp, ≤ 15 min)
const obsPe = new Map(); for (const o of O.curse) { const k = okey(o); (obsPe.get(k) ?? obsPe.set(k, []).get(k)).push(o); }
const SCURTE = new Set(); const byMZ = new Map();
for (const d of D.curse) { const k = `${d.m}|${new Date(new Date(d.t0).getTime() + 3 * 3600000).toISOString().slice(0, 10)}`; (byMZ.get(k) ?? byMZ.set(k, []).get(k)).push(d); }
for (const arr of byMZ.values()) { arr.sort((x, y) => new Date(x.t0) - new Date(y.t0));
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const a = arr[i], b = arr[j];
    if ((new Date(b.t0) - new Date(a.t0)) / 60000 > P.C4_FEREASTRA_MIN) break;
    if (a.dinP !== b.dinP || a.spreP !== b.spreP || !(new Date(b.t0) < new Date(a.t1))) continue;
    if (!(obsPe.get(okey(a))?.length || obsPe.get(okey(b))?.length)) continue;
    const sc = a.km >= b.km ? b : a; for (const o of obsPe.get(okey(sc)) ?? []) SCURTE.add(okey(o)); } }
const areKm = (l) => typeof l.km === 'number' && l.km > 0;
const rap = []; let schimbate = 0, diag = 0, fara = 0;
for (const l of S) {
  if (!areKm(l) || l.informativ) continue;
  const m = EG.metrici(l, new Set()), E0 = m.etalonGPS;
  const vechi = { km: l.km, kmZi: l.kmZi };
  if (E0 == null) { l.card = { sursa: 'card vechi (lanțul ION-71)', steag: 'fără etalon GPS', zileBuneGPS: m.nBune, versiune: VERSIUNE_ETALON }; fara++;
    rap.push(`${l.ruta}|${l.linie}: fără etalon GPS (${m.nBune} zile bune) — card vechi ${l.km}`); continue; }
  const src = (c) => l.sursa === 'toate' || c.zi >= P.SEPT, tol = Math.max(P.C47_TOL * E0, P.C47_MIN_KM);
  const peP = (c) => c.poarta === (c.sens === 'tur' ? l.real?.poartaTur : l.real?.poartaRetur);
  const pe = O.curse.filter((c) => c.schimb && c.ruta === l.ruta && c.linie === l.linie && src(c) && !SCURTE.has(okey(c)) && !c.rt && peP(c));
  const k = pe.filter((c) => EG.plinC(c) != null && Math.abs(EG.plinC(c) - E0) <= tol).length, r = pe.length ? k / pe.length : null;
  if (r != null && r < P.C47_ABATERE) { diag++;
    l.card = { sursa: 'card vechi (lanțul ION-71)', steag: 'diagnostic cerut', etalonGPS: E0, c47: +(100 * r).toFixed(0), picioare: pe.length, zileBuneGPS: m.nBune, versiune: VERSIUNE_ETALON };
    rap.push(`${l.ruta}|${l.linie}: DIAGNOSTIC CERUT — C47 ${k}/${pe.length} (${(100 * r).toFixed(0)} %) în ±${tol.toFixed(1)} km de ${E0}; card vechi ${l.km} rămâne`); continue; }
  if (l.km !== E0) schimbate++;
  l.km = E0; if (typeof l.tureZi === 'number') l.kmZi = +(2 * E0 * l.tureZi).toFixed(1);
  l.card = { sursa: 'etalon GPS completat', versiune: VERSIUNE_ETALON, etalonGPS: E0, etalonBrut: m.etalonBrut, zileBuneGPS: m.nBune, c47: r == null ? null : +(100 * r).toFixed(0), vechi };
  rap.push(`${l.ruta}|${l.linie}: card ${vechi.km} → ${E0} km GPS completat (brut ${m.etalonBrut}; ${m.nBune} zile; C47 ${r == null ? '—' : (100 * r).toFixed(0) + ' %'}) · km/zi ${vechi.kmZi} → ${l.kmZi}`);
}
const f = `${DIR}/schelet-ideal.json`; writeFileSync(f + '.tmp', JSON.stringify(S)); renameSync(f + '.tmp', f);
writeFileSync(`${DIR}/card-gps-raport.txt`, rap.join('\n') + '\n');
console.log(`card GPS: ${S.filter((l) => l.card?.sursa === 'etalon GPS completat').length} linii cu cardul = etalonul GPS completat (${schimbate} schimbate) · diagnostic cerut ${diag} · fără etalon GPS ${fara} · SCURTE ${SCURTE.size} · ${VERSIUNE_ETALON}`);
console.log(`km/zi total: ${S.filter((l) => areKm(l) && !l.informativ).reduce((s, l) => s + (l.kmZi || 0), 0).toFixed(0)}`);
