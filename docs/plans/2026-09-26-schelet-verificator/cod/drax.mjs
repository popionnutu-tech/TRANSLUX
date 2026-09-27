// schelet-verificator (ION-95) v3 — controalele MECANICE pe scheletul ideal Drăxlmaier (ION-71), rulate DOAR pe copii, ca utilizatorul `verif`.
//   Pornit numai de ruleaza.sh (care copiază intrările ca root, apoi rulează `runuser -u verif -- node drax.mjs` cu VERIF_D = dosarul rulării).
// Intrări ($VERIF_D/in/, copii `cp`, nlink 1): schelet/obs/etalon/curse/regulate/schimburi/care-schimb/dubluri-ideal.json, nomenclator.json,
//   ferestre-drax.json, explicatii-drax.json, surse.json ({fișier: {sursa: cale reală, sha256}} scris de ruleaza.sh la copiere).
// Ieșiri ($VERIF_D/out/): controale.json (toate constatările + tabelul `linii` pe km GPS) și verdict.json.tmp — publicat ca verdict.json
//   de ruleaza.sh DOAR după manifestul de închidere identic (sigiliul). Schema: verdict.schema.md.
// Regula lui Ion (26.09): «nu folosim geometria, folosim km reali din GPS» — etalonul liniei = mediana km GPS (`plin`) pe zilele bune GPS;
//   drumul desenat e doar harta (C23 hartă). Cazurile cunoscute NU sunt aici (notarea: noteaza.mjs, de sesiune, pe fișierul-etalon din afara repo-ului).
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaEtalon, VERSIUNE_ETALON } from './etalon-gps.mjs';
import { variante as variantePeDispozitiv, efectLinie } from './c4.mjs';
import { ziLucru } from './timp.mjs';   // v5: ziua de lucru = timp.mjs al lanțului ideal-v3 (03:00 pe ceasul local), aceeași copie (sha în GATA)

const BAZA_RULARI = '/home/verif/verificator/rulari';
const VD = process.env.VERIF_D;
if (!VD) { console.error('VERIF_D lipsește — fără valoare implicită'); process.exit(2); }
const VDR = realpathSync(VD);
if (!VDR.startsWith(realpathSync(BAZA_RULARI) + '/')) { console.error(`VERIF_D (${VDR}) nu e sub ${BAZA_RULARI} — refuz`); process.exit(2); }
const IN = join(VDR, 'in'), OUT = join(VDR, 'work');   // work/ = al lui verif; root publică în out/ (Codex r2 C2) mkdirSync(OUT, { recursive: true });
const SCOATE = process.env.VERIF_SCOATE || null;              // proba R1: «R|linie» scoasă din schelet, în MEMORIE
const FARA_REG = process.env.VERIF_FARA_REGISTRU === '1';     // proba registrului: aceeași rulare, fără explicații
const sha = b => createHash('sha256').update(b).digest('hex');
const SCRIPT = { drax_sha256: sha(readFileSync(fileURLToPath(import.meta.url))), etalon_sha256: sha(readFileSync(fileURLToPath(new URL('./etalon-gps.mjs', import.meta.url)))), timp_sha256: sha(readFileSync(fileURLToPath(new URL('./timp.mjs', import.meta.url)))), etalon: VERSIUNE_ETALON, c4_sha256: sha(readFileSync(fileURLToPath(new URL('./c4.mjs', import.meta.url)))), filtru_sha256: sha(readFileSync(fileURLToPath(new URL('./filtru-rupte.mjs', import.meta.url)))), ruleaza_sha256: process.env.VERIF_RULEAZA_SHA || null,
  node: process.version, tz: process.versions.tz, icu: process.versions.icu, fus: Intl.DateTimeFormat().resolvedOptions().timeZone };
const VERSIUNE = `drax.mjs v5 · ${SCRIPT.drax_sha256.slice(0, 12)}`;
const SURSE = JSON.parse(readFileSync(join(IN, 'surse.json'), 'utf8'));
const intrari = {}; const J = f => { const b = readFileSync(join(IN, f)); const h = sha(b);
  if (SURSE[f] && SURSE[f].sha256 !== h) { console.error(`copia ${f} ≠ sursa (${SURSE[f].sursa})`); process.exit(3); }
  intrari[f] = { sursa: SURSE[f]?.sursa ?? null, sha256: h, bytes: b.length }; return JSON.parse(b); };
const S0 = J('schelet-ideal.json'), O = J('obs-ideal.json'), E = J('etalon-ideal.json'), D = J('curse-ideal.json'), RG = J('regulate-ideal.json');
const SH = J('schimburi-ideal.json'), CSC = J('care-schimb-ideal.json'), DUB = J('dubluri-ideal.json'), N = J('nomenclator.json'), FER = J('ferestre-drax.json');
const PORTI = J('porti-drax.json');   // razele porților (drax/cod/ideal/curse.mjs:18), fișier sigilat
const EXPL0 = J('explicatii-drax.json'); const EXPL = FARA_REG ? [] : EXPL0;
// v5 (d): deciziile pe linie (decizii-v3.json al sursei, copiat și sigilat de ruleaza.sh; lipsă = nicio decizie)
const DEC0 = existsSync(join(IN, 'decizii-v3.json')) ? J('decizii-v3.json') : null;
const DEC = new Map((DEC0?.linii || []).map(d => [`${d.ruta}|${d.linie}`, d]));
const S = SCOATE ? S0.filter(l => `${l.ruta}|${l.linie}` !== SCOATE) : S0;
if (SCOATE && S.length === S0.length) { console.error(`VERIF_SCOATE=${SCOATE} nu există în schelet`); process.exit(2); }

// ── praguri, fiecare cu sursa ─────────────────────────────────────────────────
const P = {
  DIF_TUR_RETUR: 0.18,      // drax/cod/ideal/alege.mjs:20 DIF; control.mjs:21
  BANDA_TUR_RETUR: 0.15,    // Ungheni/SEBN/Briceni/ION-45 (briceni/cod/control.mjs:13)
  S1_S2: 0.18,              // drax/cod/ideal/control.mjs:25 (c2)
  MIN_ZILE: 3,              // drax/cod/ideal/alege.mjs:54 (≥3 zile bune)
  KM_5: 0.05,               // ±5 %: alege.mjs:20 APROAPE; plan ION-71 Verificare 7; triaj r2 Q2 (etalon GPS «schimbat»), Q3 (card ≠ GPS blochează)
  ORE_MIN: 15,              // mejgorod/cod/control.mjs:30
  C4_FEREASTRA_MIN: 15,     // dezbaterea ION-95 Q1 (treapta a doua); r2: treapta = suprapunerea în timp
  SALT_KM: 5,               // triaj r2 N3/V6: deplasare poartă→altă poartă ≤5 km (măsurat 3,6–4,0)
  C47_TOL: 0.10, C47_MIN_KM: 1, C47_REPER: 0.90, C47_ABATERE: 0.60,   // briceni/cod/verifica-km.mjs:16; triaj r2 R6
  R_SAT: 1.2, R_TRECE: 1.5, R_OPR: 0.8, NEUTRU_PORTI: 4,              // ideal/verif.mjs:13,22; alege.mjs:20 R_TRECE (triaj r2 Q1)
  KM_LIPIT: 140,            // memoria analiza-verifica-toata-flota
  PRANZ: [10.5, 14.5],      // F2 docs/plans/2026-09-26-drax-f2.md:39,61
  REGULAT_MIN: 30, REGULAT_ZILE: 5,   // triaj r2 R7 (aceeași mașină ±30 min, ≥5 zile)
  EEST: ['2026-03-29', '2026-10-25'], W53_ATENTIE: '2026-12-01', W53_BLOCANT: '2026-12-21',   // ora de vară; triaj r2 R8
  SEPT: '2026-09-01',       // sursa «sept» (alege.mjs:20)
};
const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : null; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const lung = d => { let k = 0; for (let i = 1; i < d.length; i++) k += hav({ lat: d[i - 1][0], lon: d[i - 1][1] }, { lat: d[i][0], lon: d[i][1] }); return k; };
const fmtLoc = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const loc = t => { const p = Object.fromEntries(fmtLoc.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { zi: `${p.year}-${p.month}-${p.day}`, h: +p.hour + +p.minute / 60 }; };
const luni = z => { const d = new Date(z + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
const cur = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
const kk = s => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };   // copie din drax/cod/ideal/verif.mjs:15-17
const byK = new Map(); for (const t of D.tinte) { if (!byK.has(t.k)) byK.set(t.k, []); byK.get(t.k).push(t); }
const tinteSat = n => kk(n).flatMap(k => byK.get(k) || []);
const langaPoarta = p => N.porti.some(g => hav(p, g) < P.NEUTRU_PORTI);
const id = (r, l) => `${r}|${l}`;
const okey = c => `${c.m}|${c.t0}|${c.km}`;   // cheia observației: placă + t0 + km (două dispozitive pot avea același t0 — triaj r2 N7)
// `id` = identificatorul CANONIC scurt (C31, C4, D6, R1, G1, V2…), pe care se potrivește registrul; `control` = eticheta afișată
const C = []; const pune = (ctl, nivel, o) => { const x = { id: ctl.match(/^[A-Z]+\d+/)[0], control: ctl, nivel, ...o }; C.push(x); return x; };   // blocant | abatere | informativ
const areKm = l => l.km != null && !l.faraIdeal && !l.deCompletat;
const act = S.filter(l => !l.gps), cu = S.filter(l => areKm(l) && !l.informativ);
const unitati = { linii_act: act.length, linii_gps: S.filter(l => l.gps).length, linii_cu_ideal: cu.length, masini: new Set(D.curse.map(c => c.m)).size,
  observatii_cu_ruta: O.curse.length, deplasari_cu_ruta: new Set(O.curse.map(c => c.m + '|' + c.t0 + '|' + c.km)).size, deplasari_brute: D.curse.length };

// ── C5 ora ────────────────────────────────────────────────────────────────────
{ const ok = D.FROM >= P.EEST[0] && D.TO <= P.EEST[1];
  pune('C5', ok ? 'informativ' : 'blocant', { cifra: `${D.FROM}…${D.TO}`, motiv: ok ? 'fereastra ⊂ EEST; lanțul ION-71 folosește UTC+3 fix (etalon.mjs:19) — corect doar vara' : 'fereastra iese din EEST, iar lanțul folosește UTC+3 fix' }); }

// ── R1 reconcilierea cheilor rută × linie: nomenclator ↔ schelet (lipsă, necunoscută, dublă) ──
{ const dinAct = N.rute.flatMap(r => r.linii.map(l => id(r.id, l.start))), dinS = act.map(l => id(l.ruta, l.linie));
  const cnt = a => a.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()); const cA = cnt(dinAct), cS = cnt(dinS);
  for (const [k] of cA) if (!cS.has(k)) { const [r, l] = k.split('|'); pune('R1 linie dispărută', 'blocant', { ruta: r, linie: l, motiv: 'linie din act absentă din schelet' }); }
  for (const [k, n] of cS) { const [r, l] = k.split('|'); if (!cA.has(k)) pune('R1 linie necunoscută', 'blocant', { ruta: r, linie: l, motiv: 'linie din schelet fără pereche în act' }); if (n > 1) pune('R1 linie dublă', 'blocant', { ruta: r, linie: l, cifra: `${n} rânduri` }); }
  pune('R1', 'informativ', { cifra: `act ${cA.size} linii · schelet ${cS.size}${SCOATE ? ` · PROBĂ: scos ${SCOATE}` : ''}` }); }

// ── C31–C43 recalculate din fișiere + V1 ──────────────────────────────────────
for (const l of act) if (l.faraIdeal || l.deCompletat) pune('C31(a)', 'blocant', { ruta: l.ruta, linie: l.linie, cifra: `candidate ${l.nCand?.toate ?? 0}`, motiv: l.motiv || 'de completat' });
for (const l of S) if (!l.faraIdeal && !l.deCompletat && !(l.km > 0 && l.kmZi > 0)) pune('V1(m)', 'blocant', { ruta: l.ruta, linie: l.linie, cifra: `km ${l.km} kmZi ${l.kmZi}`, motiv: 'km/kmZi nevalid pe o linie care nu e faraIdeal (control.mjs:14 o filtra)' });
for (const l of cu) if (l.sursa === 'toate') pune('C32(b)', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `bune sept ${l.zileBune?.sept}, toate ${l.zileBune?.toate}` });
for (const l of cu) { const t = l.real?.tur, r = l.real?.retur; if (!t || !r) continue; const d = Math.abs(t - r) / Math.max(t, r);
  if (l.asim || d > P.DIF_TUR_RETUR) pune('C33(c)', 'abatere', { ruta: l.ruta, linie: l.linie, cifra: `${t}/${r} (${(100 * d).toFixed(1)} %)${l.asim ? ' asim' : ''}` });
  else if (d > P.BANDA_TUR_RETUR) pune('C33(c) banda 15–18 %', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `${t}/${r} (${(100 * d).toFixed(1)} %)` }); }
for (const [r, v] of Object.entries(RG.lipsaPeRuta || {})) if (v.length) pune('C35(d)', 'informativ', { ruta: r, cifra: v.join(', '), motiv: 'sat din act cu 0 % pe rută' });
for (const l of cu) if (l.inPlus?.length) pune('C35(e)', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: l.inPlus.map(x => `${x.n} ${x.p}%`).join(', ') });
{ const k1 = new Map(); let n = 0; const ex = [];
  for (const c of O.curse) { if (!c.schimb) continue; const k = `${okey(c)}|${c.schimb}|${c.sens}`; const v = id(c.ruta, c.linie); if (k1.has(k) && k1.get(k) !== v) { n++; if (ex.length < 5) ex.push(`${c.m} ${c.zi} ${k1.get(k)} / ${v}`); } k1.set(k, v); }
  if (n) pune('C36(f)', 'blocant', { cifra: `${n} cazuri`, motiv: ex.join(' · ') }); }
{ const byL = new Map(); for (const c of O.curse) { if (!c.schimb) continue; const k = `${c.ruta}|${c.linie}|${c.zi}|${c.schimb}|${c.sens}`; if (!byL.has(k)) byL.set(k, []); byL.get(k).push(c); }
  const nML = new Map(); for (const c of O.curse) if (c.schimb) { const k = `${c.ruta}|${c.linie}|${c.m}`; nML.set(k, (nML.get(k) || 0) + 1); }
  const dub = new Map();
  for (const [k, a] of byL) for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i].m !== a[j].m && Math.abs(new Date(a[i].t0) - new Date(a[j].t0)) <= 180000 && Math.abs(a[i].km - a[j].km) <= 1) {
    const [r, l] = k.split('|'); const q = `${r}|${l}|${[a[i].m, a[j].m].sort().join('=')}`; dub.set(q, (dub.get(q) || 0) + 1); }
  for (const [q, n] of dub) { const [r, l, p] = q.split('|'); const [a, b] = p.split('='); const mn = Math.min(nML.get(`${r}|${l}|${a}`) || 1, nML.get(`${r}|${l}|${b}`) || 1);
    if (n >= 3) pune('C37(f)', n / mn >= 0.5 ? 'blocant' : 'informativ', { ruta: r, linie: l, cifra: `${p}: ${n} curse / ${mn} pe linie (${(100 * n / mn).toFixed(0)} %)` }); } }
{ const lip = O.curse.filter(c => c.plin > P.KM_LIPIT); if (lip.length) pune('C38(g) curse', 'informativ', { cifra: `${lip.length} observații cu plin > 140 km`, motiv: [...new Set(lip.map(c => id(c.ruta, c.linie)))].slice(0, 12).join(', ') });
  for (const l of cu) if (l.turZi > P.KM_LIPIT || l.returZi > P.KM_LIPIT) pune('C38(g) linie', 'blocant', { ruta: l.ruta, linie: l.linie, cifra: `${l.turZi}/${l.returZi}` }); }
for (const e of E) if (!e.gps && (!e.capat || !(e.atingeri > 0 || e.nCand?.toate > 0))) pune('C43(l)', 'blocant', { ruta: e.ruta, linie: e.linie, cifra: `${e.capat || 'NEGĂSIT'} (${e.atingeri})` });
for (const l of cu) { const a = l.autobuze ? l.autobuze.EZ + l.autobuze.D : null; if (a !== null && l.tureZi !== a) pune('C42(k)', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `GPS ${l.tureZi} (sept ${l.tureZiE?.sept ?? '·'} / toate ${l.tureZiE?.toate ?? '·'}) · act ${a}` }); }
for (const l of S) if (l.gps && l.informativ) pune('C41(j)', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: l.masini.map(m => m.m).join(',') });
// C23 = doar consecvența hărții, nu sursă de km
for (const l of cu) { if (!l.drum?.length) { pune('C23 hartă', 'informativ', { ruta: l.ruta, linie: l.linie, motiv: 'fără drum desenat' }); continue; }
  const k = lung(l.drum), d = Math.abs(k - l.km) / l.km; if (d > P.KM_5) pune('C23 hartă', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `card ${l.km} / drum desenat ${k.toFixed(1)} (${(100 * d).toFixed(1)} %)` }); }

// ── C4 autodublura / V6 salt între porți (după ORICE unire; cheia pe deplasare, nu pe picior) ──
const obsPeDepl = new Map(); for (const c of O.curse) { const k = okey(c); if (!obsPeDepl.has(k)) obsPeDepl.set(k, []); obsPeDepl.get(k).push(c); }
const obsDe = d => obsPeDepl.get(`${d.m}|${d.t0}|${d.km}`) || [];
const eSalt = d => d.dinP && d.spreP && d.pIn && d.pOut && d.pIn !== d.pOut && d.km <= P.SALT_KM;
const c4 = [];   // { m, zi, a, b, dtMin, treapta: sigur | salt | de verificat }
{ const byMZ = new Map(); for (const c of D.curse) { const k = c.m + '|' + ziLucru(c.t0); if (!byMZ.has(k)) byMZ.set(k, []); byMZ.get(k).push(c); }
  for (const [k, arr] of byMZ) { arr.sort((x, y) => new Date(x.t0) - new Date(y.t0)); const [m, zi] = k.split('|');
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const a = arr[i], b = arr[j]; const dt = (new Date(b.t0) - new Date(a.t0)) / 60000; if (dt > P.C4_FEREASTRA_MIN) break;
      if (a.dinP !== b.dinP || a.spreP !== b.spreP) continue; const ra = obsDe(a), rb = obsDe(b); if (!ra.length && !rb.length) continue;
      const suprapus = new Date(b.t0) < new Date(a.t1);   // un autobuz nu face două deplasări simultane → două dispozitive
      const treapta = suprapus ? 'sigur' : (eSalt(a) || eSalt(b)) ? 'salt' : (ra.length && rb.length) ? 'de verificat' : null; if (!treapta) continue;
      c4.push({ m, zi, a, b, ra, rb, dtMin: +dt.toFixed(1), treapta }); } } }
{ const g = new Map(); for (const x of c4) { const k = `${x.m}|${x.treapta}`; if (!g.has(k)) g.set(k, { z: new Set(), n: 0 }); g.get(k).z.add(x.zi); g.get(k).n++; }
  for (const [k, v] of g) { const [m, t] = k.split('|'); pune(t === 'salt' ? 'V6 salt între porți' : 'C4', 'informativ', { masina: m, treapta: t, cifra: `${t}: ${v.z.size} zile, ${v.n} perechi (${[...v.z].sort().slice(0, 12).join(',')}${v.z.size > 12 ? '…' : ''})` }); }
  const salturi = D.curse.filter(eSalt), peRuta = salturi.filter(d => obsDe(d).length);
  pune('V6 salt între porți', 'informativ', { cifra: `${salturi.length} deplasări poartă→altă poartă ≤${P.SALT_KM} km; ${peRuta.length} atribuite unei linii`, motiv: [...new Set(peRuta.flatMap(d => obsDe(d).map(o => id(o.ruta, o.linie))))].join(', ') || '—' }); }

// ── metricile GPS ale unei linii: modulul comun etalon-gps.mjs (îl folosește și F3), pe poarta sensului, km completați cu raza porții ──
const depl = new Map(); for (const c of D.curse) depl.set(`${c.m}|${c.t0}|${c.km}`, c);
const EG = creeazaEtalon({ O, D, E, N, porti: PORTI, P }); const metrici = EG.metrici, plinC = EG.plinC;

// ── G1 km card = etalonul GPS COMPLETAT (poarta sensului + raza porții; Ion 26.09, triaj r3 Q1 (c)): >5 % sau nedeterminat = blocant ──
const LINII = [], BAZA = new Map(), G1 = new Map();
const SCOATE_DEC = new Map();   // rută|linie → Set(okey) scoase prin decizie (aceeași populație ca generatorul)
for (const l of cu) { const dec = DEC.get(id(l.ruta, l.linie)) || null;
  const r = dec?.metoda === 'card-vechi' ? null : EG.etalonLinie(l, dec); const m = r ? { ...r.m, etalonGPS: r.etalon, nBune: r.zile, sursa: r.sursa } : metrici(l, new Set());
  SCOATE_DEC.set(id(l.ruta, l.linie), r?.scoate ?? new Set()); BAZA.set(id(l.ruta, l.linie), m);
  const kmZiGPS = m.etalonGPS != null && m.tureZi != null ? +(2 * m.etalonGPS * m.tureZi).toFixed(1) : null; const za = l.zi ? `${l.schimbZi}|${l.masinaZi}|${l.zi}` : null;
  const k = id(l.ruta, l.linie), rgT = (RG.linii[k]?.[m.sursa]?.tur?.regulate || []).slice().sort(), rgR = (RG.linii[k]?.[m.sursa]?.retur?.regulate || []).slice().sort();
  LINII.push({ ruta: l.ruta, linie: l.linie, sursa: m.sursa, porti: m.poarta, zileBuneGPS: m.nBune, etalonGPS: m.etalonGPS, etalonGPS_brut: m.etalonBrut, km_card: l.km,
    dif_pct: m.etalonGPS ? +(100 * (l.km - m.etalonGPS) / m.etalonGPS).toFixed(1) : null, tureZiGPS: m.tureZi, tureZi_schelet: l.tureZi, kmZiGPS, kmZi_schelet: l.kmZi,
    ore: m.ore, picioareAltaPoarta: m.altaPoarta, picioareRupte: m.rupte, etalonOricePoarta: m.etalonOricePoarta, zileBuneOricePoarta: m.nBuneOrice, steag: l.diagnostic ?? null, ziAleasa: za, ziAleasaBunaGPS: za ? m.bune.has(za) : null, corectie: null,
    decizie: dec ? { metoda: dec.metoda, scoate: dec.scoate?.masini ?? [], asteptat: dec.asteptat } : null, metoda_etalon: r?.metoda ?? 'poarta sensului', rezerva: r?.rezerva ?? null, scoase_decizie: r?.scoate?.size ?? 0,
    replica_regulate: m.reg.tur?.join() === rgT.join() && m.reg.retur?.join() === rgR.join() });
  if (m.etalonGPS == null) G1.set(k, pune('G1', 'blocant', { ruta: l.ruta, linie: l.linie, cifra: `${m.nBune} zile bune GPS pe poarta sensului în sursa «${m.sursa}» (<${P.MIN_ZILE})`, motiv: 'etalon GPS nedeterminat — cardul nu poate purta km GPS' }));
  else { const d = Math.abs(l.km - m.etalonGPS) / m.etalonGPS;
    if (d > P.KM_5) G1.set(k, pune('G1', 'blocant', { ruta: l.ruta, linie: l.linie, cifra: `card ${l.km} / GPS completat ${m.etalonGPS} km (brut ${m.etalonBrut}; ${(100 * d).toFixed(1)} %, ${m.nBune} zile)`, motiv: 'corecția: cardul ia etalonul GPS completat' }));
    else if (d > P.KM_5 / 2) pune('G1 bandă', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `card ${l.km} / GPS completat ${m.etalonGPS} (${(100 * d).toFixed(1)} %)` }); } }
{ const a = LINII.reduce((s, x) => s + (x.kmZiGPS || 0), 0), b = LINII.reduce((s, x) => s + (x.kmZi_schelet || 0), 0), rep = LINII.filter(x => !x.replica_regulate).length;
  pune('G1 total', 'informativ', { cifra: `km/zi GPS completat ${a.toFixed(0)} față de card ${b.toFixed(0)}; fără etalon GPS ${LINII.filter(x => x.etalonGPS == null).length}; replica satelor regulate ≠ lanț pe ${rep} linii`, motiv: `razele porților: ${PORTI.map(p => p.nume + ' ' + p.raza).join(', ')} km` }); }

// ── C4 efect: variantele = eliminarea COERENTĂ a fiecărui dispozitiv (c4.mjs; Codex r2 C1); fără identitate = NEDETERMINAT = blocant ──
const SCURTE = new Set();   // cursele scurte ale perechilor «sigur» — scoase din C47 (informativ; triaj r2 N4)
{ const sig = c4.filter(x => x.treapta === 'sigur'); for (const x of sig) for (const o of obsDe(x.a.km >= x.b.km ? x.b : x.a)) SCURTE.add(okey(o));
  const cursePeZi = (m, zi) => D.curse.filter(c => c.m === m && ziLucru(c.t0) === zi);
  const peLinie = new Map(); for (const x of sig) for (const c of [...x.ra, ...x.rb]) { const k = id(c.ruta, c.linie); if (!peLinie.has(k)) peLinie.set(k, new Set()); peLinie.get(k).add(x); }
  for (const [k, xsS] of peLinie) { const xs = [...xsS]; const [ruta, linie] = k.split('|'); const l = S.find(q => q.ruta === ruta && q.linie === linie);
    const masina = [...new Set(xs.map(x => x.m))].join(','), zile = new Set(xs.map(x => x.zi)).size;
    if (!l || !areKm(l) || l.informativ) { pune('C4 efect', 'informativ', { ruta, linie, masina, cifra: `${zile} zile cu dublură sigură`, motiv: 'linie fără ideal' }); continue; }
    const V = variantePeDispozitiv(xs, cursePeZi, obsDe); const sd = SCOATE_DEC.get(k) ?? new Set(); const r = efectLinie({ l, baza: BAZA.get(k), metrici: (l2, sc, x) => metrici(l2, new Set([...sc, ...sd]), x), V, P });
    pune('C4 efect', r.nivel, { ruta, linie, masina, cifra: `${zile} zile cu dublură sigură · ${V.determinat ? 'dispozitive ' + V.devs.join(', ') : 'identitatea dispozitivului lipsește'} · baza: etalon GPS ${BAZA.get(k).etalonGPS}, ture/zi ${BAZA.get(k).tureZi}`, motiv: r.motiv }); } }

// ── V2 efect: ture/zi cu dedup ±3 min DOAR pe aceeași mașină (etalon.mjs:122 unește și mașini diferite) ──
// v5: implicitul e acum dedup doar pe aceeași mașină / același dispozitiv; V2 arată diferența față de regula v4.1 (dedup între mașini)
for (const l of cu) { const b = BAZA.get(id(l.ruta, l.linie)), q = metrici(l, SCOATE_DEC.get(id(l.ruta, l.linie)) ?? new Set(), false);
  if (b.tureZi != null && q.tureZi !== b.tureZi) { const km = b.etalonGPS ?? l.km; pune('V2 efect', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `ture/zi ${b.tureZi} (v5, aceeași mașină) · ${q.tureZi} cu dedup între mașini (v4.1) (${(2 * km * (b.tureZi - q.tureZi)).toFixed(0)} km/zi)`, motiv: 'verdictul ideal-v3 (a): două autobuze reale nu se contopesc' }); }
  if (typeof l.tureZi === 'number' && b.tureZi != null && l.tureZi !== b.tureZi) pune('V2 ture ≠ schelet', 'abatere', { ruta: l.ruta, linie: l.linie, cifra: `schelet ${l.tureZi} · GPS ${b.tureZi}` }); }
// ── D8 deciziile: valoarea recalculată aici față de valoarea așteptată (toleranța din fișier) ──
if (DEC0) { const tol = DEC0.toleranta_km ?? 0.1; for (const [k, d] of DEC) { const l = S.find(x => id(x.ruta, x.linie) === k), b = BAZA.get(k);
  if (!l) { pune('D8 decizie', 'blocant', { ruta: d.ruta, linie: d.linie, motiv: 'decizie pentru o linie absentă din schelet' }); continue; }
  const kmV = d.metoda === 'card-vechi' ? l.km : b?.etalonGPS; const ok = kmV != null && Math.abs(kmV - d.asteptat.km) <= tol && Math.abs(l.km - d.asteptat.km) <= tol && l.tureZi === d.asteptat.tureZi && Math.abs(l.kmZi - d.asteptat.kmZi) <= 2 * tol * d.asteptat.tureZi && !!l.diagnostic === !!d.asteptat.steag;
  pune('D8 decizie', ok ? 'informativ' : 'blocant', { ruta: d.ruta, linie: d.linie, cifra: `${d.metoda}${d.scoate?.masini?.length ? ' fără ' + d.scoate.masini.join(',') : ''} · verificator ${kmV} · card ${l.km} × ${l.tureZi} = ${l.kmZi} · așteptat ${d.asteptat.km} × ${d.asteptat.tureZi} = ${d.asteptat.kmZi} · steag ${!!l.diagnostic}/${!!d.asteptat.steag}`, motiv: ok ? `${DEC0.sursa}` : 'decizia nu se reproduce (toleranța ' + tol + ' km)' }); } }
// ── V3 / V5 ───────────────────────────────────────────────────────────────────
{ const k = new Map(); for (const c of O.curse) if (c.schimb) { const q = c.m + '|' + c.t0; k.set(q, (k.get(q) || 0) + 1); }
  const col = [...k].filter(([, v]) => v > 1).length; if (col) pune('V3', 'informativ', { cifra: `${col} chei m|t0 cu >1 observație cu schimb`, motiv: 'alege.mjs:34 păstrează doar ultima' }); }
for (const [k, q] of Object.entries(SH)) if (!q.sapt.filter(w => w.tip !== 'putin').length) { const [r, l] = k.split('|'); pune('V5', 'abatere', { ruta: r, linie: l, cifra: `regim «${q.regim}» din 0 săptămâni complete`, motiv: 'date insuficiente, nu regim confirmat (schimburi.mjs:29)' }); }

// ── D1 regimul: pe fereastra idealului (sursa liniei) vs toată fereastra; faza majoritară; W53 ──
const perZi = new Map();   // rută|linie → zi → { s1: Set(m), s2: Set(m) } — perechi tur+retur pe (schimb, mașină, zi)
{ const per = new Map(); for (const c of O.curse) { if (!c.schimb) continue; const k = `${c.ruta}|${c.linie}|${c.zi}|${c.schimb}|${c.m}`; if (!per.has(k)) per.set(k, {}); per.get(k)[c.sens] = 1; }
  for (const [k, p] of per) { if (!p.tur || !p.retur) continue; const [r, l, z, s, m] = k.split('|'); const g = id(r, l); if (!perZi.has(g)) perZi.set(g, new Map()); if (!perZi.get(g).has(z)) perZi.get(g).set(z, { s1: new Set(), s2: new Set() }); perZi.get(g).get(z)[s].add(m); } }
function regim(zile) {   // aceleași praguri ca drax/cod/ideal/schimburi.mjs:27-38, cu «date insuficiente» (V5)
  const W = new Map(); for (const [z, v] of zile) { const lu = luni(z); if (!W.has(lu)) W.set(lu, { lu, s1: 0, s2: 0, ambele: 0, zile: 0 }); const w = W.get(lu); w.zile++; if (v.s1.size && v.s2.size) w.ambele++; else if (v.s1.size) w.s1++; else w.s2++; }
  const S = [...W.values()].map(w => ({ ...w, tip: w.zile < 2 ? 'putin' : w.ambele >= Math.max(2, 0.5 * w.zile) ? 'ambele' : w.s1 >= 0.7 * w.zile ? 's1' : w.s2 >= 0.7 * w.zile ? 's2' : 'amestec' }));
  const full = S.filter(w => w.tip !== 'putin'); const n = t => S.filter(w => w.tip === t).length;
  if (!full.length) return { regim: 'date insuficiente', S };
  if (n('ambele') >= 0.6 * full.length) return { regim: 'ambele', S };
  if (n('s1') + n('s2') >= 0.6 * full.length && n('s1') && n('s2')) {   // faza majoritară (nu ultima săptămână — triaj r2 N8)
    const ref = new Date('2026-01-05T12:00:00Z'); const faza = w => (Math.round((new Date(w.lu + 'T12:00:00Z') - ref) / 604800000) % 2 === 0) === (w.tip === 's1');
    const R = S.filter(w => w.tip === 's1' || w.tip === 's2'); const a = R.filter(faza).length, cons = Math.max(a, R.length - a) / R.length;
    return { regim: cons >= 0.8 ? 'rotatie' : 'rotatie-neregulata', cons: +cons.toFixed(2), S }; }
  return { regim: n('s1') && !n('s2') ? 'doar s1' : n('s2') && !n('s1') ? 'doar s2' : 'neclar', S };
}
for (const l of act) { const k = id(l.ruta, l.linie), Z = perZi.get(k); const q = SH[k]; if (!Z || !q) continue;
  const sursa = l.sursa || 'sept'; const rs = regim([...Z].filter(([z]) => sursa === 'toate' || z >= P.SEPT)), rt = regim([...Z]);
  if (rs.regim !== rt.regim) pune('D1 regim sursă ≠ total', 'abatere', { ruta: l.ruta, linie: l.linie, cifra: `sursa «${sursa}»: ${rs.regim} · toată fereastra: ${rt.regim} (lanț: ${q.regim})`, motiv: 'regimul trebuie calculat pe aceeași fereastră ca idealul' });
  if (q.regim === 'neclar' || (q.ideal && !q.dupaAct)) pune('D1 ≠ act', q.regim === 'neclar' ? 'abatere' : 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `act ${q.grupa ?? '—'} → GPS ${q.regim} (sursa: ${rs.regim})`, motiv: `săpt.: ${JSON.stringify(q.cnt)}` });
  if (rt.regim === 'rotatie-neregulata') pune('D1 fază', 'abatere', { ruta: l.ruta, linie: l.linie, cifra: `consistența fazei ${rt.cons}` }); }
{ const areParitate = !!(CSC.impare || CSC.pare); const azi = new Date().toISOString().slice(0, 10);
  const niv = areParitate && D.TO >= P.W53_BLOCANT ? 'blocant' : areParitate && azi >= P.W53_ATENTIE ? 'abatere' : 'informativ';
  pune('D1 W53', niv, { cifra: `care-schimb-ideal.json ${areParitate ? 'are încă impare/pare' : 'fără paritate'}; 2026 are ISO 53 (28.12.2026–03.01.2027)`, motiv: 'regula = alternanța de la ancoră; pe fereastra de azi e identică cu paritatea; se verifică abia pe date din ian. 2027' }); }

// ── D2 grupa Z: bloc (≥3 zile pe ambele schimburi în aceeași săptămână) vs izolat (≤1), condiționat pe grupa din act ──
for (const [k, q] of Object.entries(SH)) { if (!/^rotatie|^doar/.test(q.regim)) continue; const Z = perZi.get(k); if (!Z) continue;
  const amb = [...Z].filter(([, v]) => v.s1.size && v.s2.size); if (!amb.length) continue;
  const pw = new Map(); for (const [z] of amb) pw.set(luni(z), (pw.get(luni(z)) || 0) + 1);
  const bloc = [...pw].filter(([, n]) => n >= 3), izol = [...pw].filter(([, n]) => n <= 1).length, aceeasi = amb.filter(([, v]) => [...v.s1].some(m => v.s2.has(m))).length; const [r, l] = k.split('|');
  if (bloc.length) pune('D2 ambele parțial', 'informativ', { ruta: r, linie: l, cifra: `${bloc.length} săptămâni-bloc (${bloc.map(([w, n]) => `${w}:${n}`).join(', ')})`, motiv: 'regim «ambele» pe perioadă, nu Z' });
  if (izol) { const niv = q.grupa === 'D' ? 'abatere' : 'informativ'; const et = q.grupa === 'EZ' ? 'posibil Z' : q.grupa === 'D' ? 'abatere de la rotație pe linie D (nu Z) — diagnostic' : q.grupa === 'EZ+D' ? 'fără semnal Z' : 'fără grupă în act';
    pune('D2 izolat', niv, { ruta: r, linie: l, cifra: `${izol} zile izolate pe ambele schimburi (din ${amb.length}; aceeași mașină ${aceeasi})`, motiv: et }); } }

// ── D3 / D4 ───────────────────────────────────────────────────────────────────
for (const l of cu) { const q = SH[id(l.ruta, l.linie)]; if (!q || q.regim !== 'ambele') continue; const s1 = l.schimburi?.s1?.masini?.map(m => m.m) || [], s2 = l.schimburi?.s2?.masini?.map(m => m.m) || [];
  pune('D3', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `ture/zi ${l.tureZi} · s1 ${s1.slice(0, 3).join(',')} · s2 ${s2.slice(0, 3).join(',')} · comune ${s1.filter(m => s2.includes(m)).length}` }); }
for (const l of cu) { if (l.real?.poartaTur && l.real?.poartaRetur && l.real.poartaTur !== l.real.poartaRetur) pune('D4 tur ≠ retur', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `tur ${l.real.poartaTur} / retur ${l.real.poartaRetur}` });
  const q = SH[id(l.ruta, l.linie)]; if (q?.ore?.s1 && q?.ore?.s2 && q.ore.s1.poarta !== q.ore.s2.poarta) pune('D4 s1 ≠ s2', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `s1 ${q.ore.s1.poarta} / s2 ${q.ore.s2.poarta}` }); }
// ── D5 orele prin Intl față de ferestrele din bază, pe poartă (tautologic vara: schimbul e dat de aceleași ferestre) ──
{ const inF = (h, f) => { const m = Math.round(h * 60); return f.de <= f.pana ? m >= f.de && m <= f.pana : m >= f.de || m <= f.pana; };
  const fer = (sens, s) => FER.find(f => f.s === sens && f.n === (s === 's1' ? 1 : 2));
  const g = new Map(); for (const c of O.curse) { if (!c.schimb) continue; const h = loc(c.sens === 'tur' ? c.t1 : c.t0).h; const k = `${c.poarta}|${c.schimb}|${c.sens}`; if (!g.has(k)) g.set(k, { n: 0, in: 0 }); const x = g.get(k); x.n++; if (inF(h, fer(c.sens, c.schimb))) x.in++; }
  for (const [k, x] of g) if (x.in / x.n < 0.95) pune('D5', 'abatere', { cifra: `${k}: ${x.in}/${x.n} în fereastra din bază (Intl)` });
  pune('D5', 'informativ', { cifra: `${[...g.values()].reduce((s, x) => s + x.in, 0)}/${[...g.values()].reduce((s, x) => s + x.n, 0)} observații cu schimb în ferestrele din bază (Intl)`, motiv: 'tautologic vara; contează la ora de iarnă (C5) sau la schimbarea ferestrelor' }); }
// ── D6 s1 ≠ s2: ≥3 zile candidate pe fiecare schimb ȘI confirmat pe medianele observațiilor (triaj r2 N2, R3) ──
for (const l of cu) { const a = l.schimburi?.s1?.km, b = l.schimburi?.s2?.km; if (!a || !b) continue; const ma = (a.tur + a.retur) / 2, mb = (b.tur + b.retur) / 2; const d = Math.abs(ma - mb) / Math.max(ma, mb); if (d <= P.S1_S2) continue;
  const src = c => l.sursa === 'toate' || c.zi >= P.SEPT; const ob = s => O.curse.filter(c => c.schimb === s && c.ruta === l.ruta && c.linie === l.linie && src(c) && !c.rt).map(c => c.plin);
  const o1 = med(ob('s1')), o2 = med(ob('s2')), dObs = o1 && o2 ? Math.abs(o1 - o2) / Math.max(o1, o2) : null;
  const esantion = Math.min(a.zile || 0, b.zile || 0) >= P.MIN_ZILE, confirmat = esantion && dObs != null && dObs > P.S1_S2;
  const cifra = `candidate s1 ${ma.toFixed(1)} (${a.zile} z) / s2 ${mb.toFixed(1)} (${b.zile} z); mediane obs. s1 ${o1?.toFixed(1)} / s2 ${o2?.toFixed(1)} (${dObs != null ? (100 * dObs).toFixed(0) + ' %' : '—'})`;
  if (!confirmat) pune('D6', 'informativ', { ruta: l.ruta, linie: l.linie, cifra, motiv: esantion ? 'neconfirmat pe observații — un singur km' : 'eșantion mic (<3 zile pe un schimb) — un singur km; C44 pe zilele atipice' });
  else pune('D6', 'blocant', { ruta: l.ruta, linie: l.linie, cifra, motiv: 'drum diferit pe schimb confirmat — exportul poartă km pe schimb și kmZi = Σ pe schimb' }); }

// ── D7 deplasările fără schimb la prânz, pe mecanism; «regulată» = aceeași mașină ±30 min, ≥5 zile ──
{ const pr = O.curse.filter(c => !c.schimb && c.ora >= P.PRANZ[0] && c.ora < P.PRANZ[1]);
  const clasa = c => { const g = (obsPeDepl.get(okey(c)) || []).filter(x => x !== c); const d = depl.get(okey(c)); if (d && eSalt(d)) return 'salt între porți';
    if (c.rt && g.some(x => x.schimb)) return 'geamăn rt'; if (c.rt) return 'rt fără picior în fereastră';
    return c.opr.filter(o => (c.sens === 'tur' ? o.km >= c.kmCap - P.R_OPR : o.km <= c.kmCap + P.R_OPR) && !langaPoarta(o)).length ? 'rest' : 'goală'; };
  const cnt = {}, rest = []; for (const c of pr) { const k = clasa(c); cnt[k] = (cnt[k] || 0) + 1; if (k === 'rest') rest.push(c); }
  const pm = new Map(); for (const c of rest) { const k = `${c.m}|${c.ruta}|${c.linie}`; if (!pm.has(k)) pm.set(k, []); pm.get(k).push(c); }
  const reg = []; for (const [k, a] of pm) { const h = med(a.map(c => c.ora)); const z = new Set(a.filter(c => Math.abs(c.ora - h) * 60 <= P.REGULAT_MIN).map(c => c.zi)); if (z.size >= P.REGULAT_ZILE) reg.push(`${k.replace(/\|/g, ' ')} ${z.size} zile ~${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`); }
  const sept = pr.filter(c => c.zi >= P.SEPT);
  pune('D7', 'informativ', { cifra: `${pr.length} observații; sept ${sept.length} în ${new Set(sept.map(c => c.zi)).size} zile · ${JSON.stringify(cnt)}`, motiv: `regulate: ${reg.join(' · ') || '—'}` });
  for (const l of act.filter(x => x.faraIdeal)) { const o = O.curse.filter(c => c.ruta === l.ruta && c.linie === l.linie); const sch = {}; for (const c of o) { const q = `${c.sens} ${c.schimb || 'fără'}`; sch[q] = (sch[q] || 0) + 1; }
    const ms = {}; for (const c of o) ms[c.m] = (ms[c.m] || 0) + 1; const pz = new Map(); for (const c of o) { const k = `${c.m}|${c.zi}`; if (!pz.has(k)) pz.set(k, new Set()); if (c.schimb) pz.get(k).add(`${c.sens} ${c.schimb}`); }
    const incr = [...pz.values()].filter(s => (s.has('tur s1') && s.has('retur s2')) || (s.has('tur s2') && s.has('retur s1'))).length;
    pune('D7 linie fără ideal', 'informativ', { ruta: l.ruta, linie: l.linie, cifra: `${o.length} obs. (${new Set(o.map(okey)).size} deplasări, rt ${o.filter(c => c.rt).length}, plin median ${med(o.map(c => c.plin))?.toFixed(1)}) · ${JSON.stringify(sch)} · zile-mașină ${pz.size}, încrucișate ${incr} · mașini ${Object.entries(ms).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => m + ' ' + n).join(', ')}` }); } }

// ── C47 km GPS completați, cursă cu cursă, față de etalonul GPS completat, pe POARTA fiecărui sens; rt separat; fără cursele scurte ale dublurilor ──
// G1 pe o linie cu C47 <60 %: corecția NU e automată — «diagnostic cerut» (două variante de drum posibile; triaj r3 M2)
{ let tot = 0, ok = 0, alta = 0, ruptTot = 0; const sub = [];
  for (const l of cu) { const k0 = id(l.ruta, l.linie), E0 = BAZA.get(k0)?.etalonGPS; if (E0 == null) { pune('C47', 'informativ', { ruta: l.ruta, linie: l.linie, motiv: 'fără etalon GPS — necomparabil' }); continue; }
    const sE = BAZA.get(k0)?.sursa ?? l.sursa, sd = SCOATE_DEC.get(k0) ?? new Set(); const src = c => sE === 'toate' || c.zi >= P.SEPT; const tol = Math.max(P.C47_TOL * E0, P.C47_MIN_KM);
    const o = O.curse.filter(c => c.schimb && c.ruta === l.ruta && c.linie === l.linie && src(c) && !SCURTE.has(okey(c)) && !sd.has(okey(c)));
    const peP = c => c.poarta === (c.sens === 'tur' ? l.real?.poartaTur : l.real?.poartaRetur);
    const rupteL = o.filter(c => EG.rupt(c)).length; ruptTot += rupteL; const o2 = o.filter(c => !EG.rupt(c));
    const pe = o2.filter(c => !c.rt && peP(c)), rt = o2.filter(c => c.rt), altaP = o2.filter(c => !c.rt && !peP(c)).length; alta += altaP;
    const inTol = c => plinC(c) != null && Math.abs(plinC(c) - E0) <= tol;
    const k = pe.filter(inTol).length, kr = rt.filter(inTol).length, rap = pe.length ? k / pe.length : null;
    tot += pe.length; ok += k; const cal = med(pe.map(c => plinC(c) / E0));
    const niv = rap != null && pe.length >= 10 && rap < P.C47_ABATERE ? 'abatere' : 'informativ'; if (rap != null && rap < P.C47_REPER) sub.push(`${l.ruta} ${l.linie} ${k}/${pe.length}`);
    const L = LINII.find(x => x.ruta === l.ruta && x.linie === l.linie); L.c47 = rap != null ? +(100 * rap).toFixed(0) : null;
    if (G1.has(k0)) { const diag = rap != null && rap < P.C47_ABATERE; L.corectie = diag ? 'diagnostic cerut' : 'directă'; G1.get(k0).motiv = diag ? `diagnostic cerut înaintea corecției: doar ${(100 * rap).toFixed(0)} % din picioare în toleranță (două variante de drum?)` : G1.get(k0).motiv; }
    pune('C47', niv, { ruta: l.ruta, linie: l.linie, cifra: `${k}/${pe.length} (${rap != null ? (100 * rap).toFixed(0) : '—'} %) în ±max(10 %, 1 km) de ${E0} km (completat), poarta pe sens (tur ${l.real?.poartaTur}, retur ${l.real?.poartaRetur}) · plin/etalon ${cal?.toFixed(2) ?? '—'} · rt ${kr}/${rt.length} · altă poartă ${altaP} · urmă ruptă ${rupteL} (în afara comparației)`, motiv: niv === 'abatere' ? 'sub 60 % — diagnostic C44 cursă cu cursă' : undefined }); }
  pune('C47 total', 'informativ', { cifra: `${ok}/${tot} (${tot ? (100 * ok / tot).toFixed(1) : '—'} %); picioare de pe cealaltă poartă ${alta}, cu urmă ruptă ${ruptTot} — în afara comparației`, motiv: `sub 90 %: ${sub.length} linii — ${sub.join(' · ')}` }); }

// ── C22: ziua aleasă (harta) nu e zi bună GPS — abatere; harta NU se realiniază mecanic (verdictul dezbaterii, pct. 3) ──
for (const L of LINII) if (L.ziAleasaBunaGPS === false) pune('C22 zi aleasă', 'abatere', { ruta: L.ruta, linie: L.linie, cifra: `${L.ziAleasa} nu e zi bună GPS (etalon completat ${L.etalonGPS}, ${L.zileBuneGPS} zile)`, motiv: 'harta rămâne până la rezolvarea variantei; nu se realiniază mecanic' });
// ── G1 pe orice poartă: diagnostic SEPARAT de selecția perechilor pe poarta sensului (pct. 4) ──
for (const L of LINII) { if (L.etalonGPS == null || L.etalonOricePoarta == null) continue; const d = Math.abs(L.etalonGPS - L.etalonOricePoarta) / L.etalonGPS; L.variante = d > P.KM_5;
  if (L.variante) pune('G1 orice poartă', 'informativ', { ruta: L.ruta, linie: L.linie, cifra: `poarta sensului ${L.etalonGPS} (${L.zileBuneGPS} zile) · orice poartă ${L.etalonOricePoarta} (${L.zileBuneOricePoarta} zile) · ${(100 * d).toFixed(1)} %`, motiv: 'porți / variante de drum divergente — diagnostic' }); }
// ── E1 eligibilitatea exportului (pct. 7): fiecare linie cu C47 <60 % sau variante nerezolvate poartă steagul «diagnostic» în schelet
//    (câmpul `diagnostic` pe linie, scris de F3 în candidat) sau o explicație E1 în registru; altfel blocant ──
for (const L of LINII) { const c47 = L.c47 != null && L.c47 < 100 * P.C47_ABATERE; if (!(c47 || L.variante)) continue;
  if (L.steag) { pune('E1 steag', 'informativ', { ruta: L.ruta, linie: L.linie, cifra: `steag «${String(L.steag).slice(0, 60)}»`, motiv: 'diagnostic cerut, marcat în schelet' }); continue; }
  pune('E1 steag lipsă', 'blocant', { ruta: L.ruta, linie: L.linie, cifra: `${c47 ? 'C47 ' + L.c47 + ' %' : ''}${c47 && L.variante ? ' · ' : ''}${L.variante ? 'variante: sens ' + L.etalonGPS + ' / orice poartă ' + L.etalonOricePoarta : ''}`, motiv: 'lipsește steagul «diagnostic» în schelet (sau explicația E1 în registru)' }); }

// ── registrul de explicații (id canonic + rută + linie + sha_intrare); rândurile moarte se văd ──
const shaSchelet = intrari['schelet-ideal.json'].sha256;
const potriv = (x, c) => x.id === c.id && (x.ruta ?? null) === (c.ruta ?? null) && (x.linie ?? null) === (c.linie ?? null) && x.sha_intrare === shaSchelet;
for (const x of EXPL) if (!C.some(c => c.nivel === 'blocant' && potriv(x, c))) pune('X1 registru mort', 'abatere', { ruta: x.ruta, linie: x.linie, cifra: `${x.id} · sha ${String(x.sha_intrare).slice(0, 12)}`, motiv: x.sha_intrare !== shaSchelet ? `scheletul s-a schimbat: sesiunea re-semnează pe ${shaSchelet}` : 'nu explică nicio constatare blocantă' });
{ const vechi = EXPL.filter(x => x.sha_intrare !== shaSchelet); if (vechi.length) pune('X2 re-semnare', 'abatere', { cifra: `${vechi.length} explicații pe alt sha (${[...new Set(vechi.map(x => x.id))].join(', ')})`, motiv: `sursa verificată are schelet-ideal ${shaSchelet}; C31 revin blocante până când sesiunea re-semnează registrul` }); }
const blocante = [], explicate = [];
for (const c of C.filter(x => x.nivel === 'blocant')) { const e = EXPL.find(x => potriv(x, c)); if (e) explicate.push({ ...c, explicatie: e.motiv, hotarat_prin: e.hotarat_prin, data: e.data }); else blocante.push(c); }
const verdict = { versiune: VERSIUNE, script: SCRIPT, uzina: 'DRAXELMAIER_BALTI', rulat_la: new Date().toISOString(), verif_d: VDR, verif_src: process.env.VERIF_SRC || null,
  proba: SCOATE ? { scoate: SCOATE } : FARA_REG ? { fara_registru: true } : null, intrari, unitati, praguri: P,
  blocante, explicate, numarate: C.reduce((a, c) => (a[c.nivel] = (a[c.nivel] || 0) + 1, a), {}), valid_pentru_export: !SCOATE && !FARA_REG && blocante.length === 0 };
writeFileSync(join(OUT, 'controale.json'), JSON.stringify({ versiune: VERSIUNE, script: SCRIPT, verif_src: verdict.verif_src, intrari, unitati, linii: LINII, controale: C }, null, 1));
writeFileSync(join(OUT, 'verdict.json.tmp'), JSON.stringify(verdict, null, 1));
console.log(`${VERSIUNE} · ${JSON.stringify(unitati)}`);
console.log(`constatări ${C.length} ${JSON.stringify(verdict.numarate)} · blocante ${blocante.length} · explicate ${explicate.length} · valid_pentru_export ${verdict.valid_pentru_export}`);
const gr = new Map(); for (const c of C) gr.set(c.control, (gr.get(c.control) || 0) + 1); console.log([...gr].map(([k, v]) => `${k}:${v}`).join(' · '));
