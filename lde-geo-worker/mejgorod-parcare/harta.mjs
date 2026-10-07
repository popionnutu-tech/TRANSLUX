// ION-149 — harta autobuzelor interurbane (mejgorod) pe zi + locul de noapte P1/P2 (pagina /lde/harta?uz=mejgorod).
// Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR»;
// 01.10.2026: «adaugă toate direcțiile» — variantele recomandate din docs/plans/2026-09-30-mejgorod-parcare/raspunsuri.md:
//   1. noaptea în care returul se oprește înainte de capăt: ocolul pe acasă se socotește; regula din 25.09 se arată ca informație;
//   2. locul propus = capătul rutei când costă ≤ 20 km/săpt. mai mult decât satul cel mai ieftin;
//   3. Briceni: «parcare existentă» — noaptea dormită acolo nu se mută (Ion, 01.10);  4–5. nopțile până la 20 h, zilele libere afară;
//   6. «rămâne cum e» la ≤ 4 km;  7. ocolul de la prânz = «timp liber», separat;  8. locuri propuse doar pentru noapte;
//   9. 652AKD la SEBN Orhei = muncă știută, afară;  12. doar pe /lde/harta?uz=mejgorod; fără migrație, REST, ștergere + rescriere.
//
// Intrări (lant.sh le face, în date/): nomenclator-<LUNI>.json + curse-<LUNI>.json (copiile mej/ ale lanțului ION-55),
// optim2-<LUNI>.json (regula din 25.09), ideal.json (scheletul fix). Urma GPS din tracker.
//   node --env-file=/root/lde-worker/.env harta.mjs --sapt=AAAA-LL-ZZ (luni) [--write]
// Fără --write doar calculează și tipărește controlul flotei și probele. Cu --write: lde_harta_zi 'MEJGOROD' (săptămâna ștearsă și
// rescrisă) + controlul flotei în lde_analiza_reguli 'MEJGOROD_HARTA' (rândul 'MEJGOROD' al analizei de luni nu se atinge).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { nmea, normPlate, inMd, utcText, STATII } from './mej/geo.mjs';
import {
  adaugaZile, alegeNoapte, bucataLa, bucatiGol, eBriceni, felGol, hav, intervaleZi, judecaPauza, kmPas, miezulNoptii, numeAcum, oraLoc, regula2509,
  statii, ziLocala, ziLucru, PREF, LA_FEL_KM, TOLERANTA, GOL_MAX_H,
} from './harta-core.mjs';
import { planMejgorod, cheie } from './mej/plan-si.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));   // w_date = UTC fără fus (ora-locala.mjs)

const AICI = path.dirname(new URL(import.meta.url).pathname);
const DATE = path.join(AICI, 'date');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const WRITE = process.argv.includes('--write');
const SAPT = arg('sapt');
if (!/^\d{4}-\d{2}-\d{2}$/.test(SAPT ?? '') || new Date(`${SAPT}T12:00:00Z`).getUTCDay() !== 1) { console.error('--sapt=AAAA-LL-ZZ (o zi de luni)'); process.exit(2); }
const ZILE = Array.from({ length: 7 }, (_, k) => adaugaZile(SAPT, k));
const D0 = [...ZILE, adaugaZile(SAPT, 7)].map(miezulNoptii);
const T0 = miezulNoptii(adaugaZile(SAPT, -1)), T1 = miezulNoptii(adaugaZile(SAPT, 8)) + 4 * 3600e3;   // nopțile de la margini se închid
const citeste = (f) => JSON.parse(fs.readFileSync(path.join(DATE, f), 'utf8'));
const N = citeste(`nomenclator-${SAPT}.json`), C = citeste(`curse-${SAPT}.json`), I = citeste('ideal.json');
const O2 = fs.existsSync(path.join(DATE, `optim2-${SAPT}.json`)) ? citeste(`optim2-${SAPT}.json`) : null;
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const VAL_F = 1.05, RAZA_CAND = 15, CAPAT_KM = 3, R_BALTI = 4, PARC_BALTI = { lat: 47.770, lon: 27.9235 };
const PORTI = [[47.78513, 27.94307, 0.6, 'Drăxlmaier E'], [47.77408, 27.91593, 0.5, 'Drăxlmaier V'], [47.3864, 28.8014, 0.5, 'SEBN Orhei'],
  [47.38724, 28.81155, 0.4, 'SEBN Orhei E'], [47.15225, 28.62686, 0.5, 'SEBN Strășeni'], [47.223, 27.8016, 0.5, 'LEAR Ungheni'],
  [47.89645, 28.29982, 0.5, 'LEAR Florești'], [48.34648, 27.08318, 0.4, 'Trox Briceni']].map(([lat, lon, r, n]) => ({ lat, lon, r, n }));
const CHIS = { lat: 47.0245, lon: 28.8323 };
const NUME_GARA = { chisinau: 'Chișinău', balti: 'Bălți', edinet: 'Edineț', briceni: 'Briceni', lipcani: 'Lipcani', ocnita: 'Ocnița', riscani: 'Rîșcani' };

// ── localitățile OSM (Moldova) pentru nume și candidați ──
const LOC = [];
for (const l of fs.readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  const c = l.replace(/\x1e/g, '').trim(); if (!c || !c.includes('"place"')) continue; let q; try { q = JSON.parse(c); } catch { continue; }
  const pr = q.properties || {}, nm = pr['name:ro'] || pr.name; if (!nm || !['city', 'town', 'village'].includes(pr.place)) continue;
  const p = { n: nm, lat: q.geometry.coordinates[1], lon: q.geometry.coordinates[0], oras: pr.place !== 'village' };
  if (inMd(p)) LOC.push(p);
}
const numeLoc = (p) => {
  for (const [g, s] of STATII) if (hav(p, s) <= 0.4) return `gara ${NUME_GARA[g] ?? g}`;
  if (hav(p, CHIS) <= 12) return 'Chișinău';
  let b = null, d = 1e9; for (const s of LOC) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } }
  return d <= 2 ? b : `${b} (${r1(d)} km)`;
};

// ── Valhalla bus (VPS :8002), cache pe disc ──
const CF = path.join(DATE, 'drum-cache.json');
const cache = fs.existsSync(CF) ? new Map(Object.entries(JSON.parse(fs.readFileSync(CF, 'utf8')))) : new Map();
const kc = (a, b) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
async function matrice(src, dst) {
  const lipsa = []; for (const a of src) for (const b of dst) if (hav(a, b) >= 0.3 && !cache.has(kc(a, b))) lipsa.push([a, b]);
  const S = [...new Map(lipsa.map(([a]) => [kc(a, a), a])).values()], T = [...new Map(lipsa.map(([, b]) => [kc(b, b), b])).values()];
  for (let i = 0; i < S.length; i += 40) for (let j = 0; j < T.length; j += 60) {
    const s = S.slice(i, i + 40), t = T.slice(j, j + 60);
    const r = await fetch('http://localhost:8002/sources_to_targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ sources: s.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), targets: t.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), costing: 'bus', units: 'kilometers' }) });
    const j2 = await r.json();
    (j2.sources_to_targets ?? []).forEach((row, a) => row.forEach((c, b) => { if (c?.distance != null) cache.set(kc(s[a], t[b]), c.distance); }));
  }
}
let faraV = 0;
const V = (a, b) => { if (hav(a, b) < 0.3) return hav(a, b); const d = cache.get(kc(a, b)); if (d == null) faraV++; return (d ?? hav(a, b) * 1.4) * VAL_F; };
const areDrum = (a, b) => hav(a, b) < 0.3 || cache.has(kc(a, b));
const opresteLa = (P, t0, t1, c, r, min = 2) => { let t = null; for (const p of P) { if (p.t < t0 || p.t > t1) continue;
  if (hav(p, c) <= r && p.v <= 1) { t ??= p.t; if (p.t - t >= min * 6e4) return true; } else t = null; } return false; };
/** indicele primului punct cu t ≥ t0 (P.length dacă nu există) */
const primulDupa = (P, t0) => { let lo = 0, hi = P.length; while (lo < hi) { const m = (lo + hi) >> 1; if (P[m].t < t0) lo = m + 1; else hi = m; } return lo; };
const pozLa = (P, t) => { let lo = 0, hi = P.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m].t <= t) lo = m; else hi = m - 1; } return P[lo]; };

// capetele din grafic: nord = prima oprire din schelet, sud = Chișinău (ultima oprire)
const CAP = new Map(I.map((x) => [x.ruta, { nord: { lat: x.stops[0].lat, lon: x.stops[0].lon, n: x.stops[0].n }, sud: { lat: x.stops.at(-1).lat, lon: x.stops.at(-1).lon, n: 'Chișinău' } }]));
const capDupa = (c) => (c.s === 'retur' ? CAP.get(c.r)?.nord : CAP.get(c.r)?.sud);      // unde trebuia să se termine cursa
const capInainte = (c) => (c.s === 'tur' ? CAP.get(c.r)?.nord : CAP.get(c.r)?.sud);    // de unde trebuia să pornească

const tr = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await tr.connect();
const { rows: devs } = await tr.query(`SELECT id, "CarName", "RegNo" FROM devices`);
const byPlate = new Map();
for (const d of devs) for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) { if (!p) continue; if (!byPlate.has(p)) byPlate.set(p, []); byPlate.get(p).push(d.id); }

const inSapt = (z) => z >= ZILE[0] && z <= ZILE[6];
const ATR = N.atribuiri.filter((a) => inSapt(a.z));
const PLACI = [...new Set(ATR.map((a) => a.m))].sort();
// ION-268 «schelet întâi»: planul din grafic, GPS-ul confirmă (mej/plan-si.mjs). Muncă = cursele din plan făcute sau neconfirmate (lipsa n-are urmă);
// nicio bucată de muncă în afara planului (toate cursele vin din atribuiri). Km cu oameni = km din schelet ai curselor făcute, pe porțiunea parcursă.
const PLAN = planMejgorod(N, C, I, ZILE);
const statutDe = (c) => PLAN.pe.get(cheie(c)) ?? null;
const cuUrma = C.curse.filter((c) => !c.motiv && c.t0 && c.t1);
const randuri = [], control = [], probe = { difKm: [], faraUrma: [], dimLipsa: [] };
const flota = { real: 0, propus: 0, taiat: 0, liber: 0, regula2509: 0, nopti: 0, noptiScoase: {}, zileScoase: {} };

for (const m of PLACI) {
  const atr = ATR.filter((a) => a.m === m);
  const ctl = { m, atribuiri: atr.length, rute: [...new Set(atr.map((a) => a.r))].sort((a, b) => a - b), pe: false, propunere: false, motiv: null };
  control.push(ctl);
  for (const c of C.curse) if (c.m === m && c.motiv && inSapt(c.z)) probe.faraUrma.push(`${m} ${c.z} ruta ${c.r} ${c.s}: ${c.motiv}`);
  const ids = byPlate.get(normPlate(m));
  if (!ids) { ctl.motiv = 'fără tracker (plăcuța nu e în devices)'; continue; }
  const { rows } = await tr.query(`SELECT x, y, w_date, speed FROM track WHERE id = ANY($1) AND w_date BETWEEN $2 AND $3 AND x < 9000 AND y < 9000 ORDER BY w_date`, [ids, utcText(T0), utcText(T1)]);
  const P = []; for (const r of rows) { const p = { lat: nmea(+r.x), lon: nmea(+r.y), t: r.w_date.getTime(), v: r.speed == null ? 0 : +r.speed }; if (inMd(p) && (!P.length || p.t > P.at(-1).t)) P.push(p); }
  let kmSapt = 0; for (let i = 1; i < P.length; i++) if (P[i].t >= D0[0] && P[i].t < D0[7]) kmSapt += kmPas(P[i - 1], P[i]);
  ctl.km = Math.round(kmSapt);
  const CM = cuUrma.filter((c) => normPlate(c.m) === normPlate(m)).sort((a, b) => a.t0 - b.t0);
  ctl.curse = CM.filter((c) => inSapt(ziLocala(c.t0))).length;
  if (P.length < 10) { ctl.motiv = `fără urmă GPS în săptămână (${atr.length} atribuiri în grafic)`; continue; }
  if (!CM.length) { ctl.motiv = `nicio cursă cu urmă: ${atr.length} atribuiri, 0 curse prinse pe GPS (are ${ctl.km} km în săptămână — graficul nu e mașina care a mers)`; }

  // ── munca: cursele lipite, apoi golurile dintre ele ──
  const W = []; for (const c of CM.filter((x) => x.t1 > T0 && x.t0 < T1)) { const l = W.at(-1); if (l && c.t0 <= l.t1) { l.t1 = Math.max(l.t1, c.t1); l.c.push(c); } else W.push({ t0: c.t0, t1: c.t1, c: [c] }); }
  const goluri = [];
  for (let i = 0; i + 1 < W.length; i++) {
    const a = W[i], b = W[i + 1], E = pozLa(P, a.t1), S = pozLa(P, b.t0);
    const Qg = P.filter((p) => p.t > a.t1 && p.t < b.t0);
    const st = statii(P.filter((p) => p.t >= a.t1 && p.t <= b.t0), b.t0).sort((x, y) => y.min - x.min)[0] ?? null;
    // poarta altei uzine: oprire ≥ 2 min în rază, SAU trecere când poarta e la > 20 km de E, S și de locul staționării (Trox e pe drumul prin Briceni)
    const porta = (q) => opresteLa(P, a.t1, b.t0, q, q.r) || (hav(q, E) > 20 && hav(q, S) > 20 && (!st || hav(q, st) > 20) && Qg.some((p) => hav(p, q) <= q.r));
    const poarta = PORTI.filter(porta).map((q) => q.n).join('+') || null;
    const f = felGol({ t1: a.t1, t0Urm: b.t0, poarta, balti: opresteLa(P, a.t1, b.t0, PARC_BALTI, R_BALTI), briceni: !!st && st.min >= 60 && eBriceni(st) });
    let real = 0; for (let k = 1; k < P.length; k++) if (P[k].t > a.t1 && P[k].t <= b.t0) real += kmPas(P[k - 1], P[k]);
    const ca = a.c.at(-1), cb = b.c[0];
    const departe = Qg.length ? Math.max(0, ...Qg.map((p) => Math.min(hav(p, E), hav(p, S)))) : 0;
    goluri.push({ i, a, b, E: { lat: E.lat, lon: E.lon, t: a.t1, n: numeLoc(E) }, S: { lat: S.lat, lon: S.lon, t: b.t0, n: numeLoc(S) }, ...f, real, departe, ca, cb,
      z: ziLucru(a.t1), capE: capDupa(ca), capS: capInainte(cb), sta: st && st.min >= 60 ? { lat: st.lat, lon: st.lon, n: numeLoc(st), min: Math.round(st.min) } : null,
      fel: f.motiv ? 'afara' : f.noapte ? 'noapte' : judecaPauza({ departe }) });
  }
  const sapt = goluri.filter((g) => inSapt(g.z));
  for (const g of sapt) if (g.motiv) (g.noapte ? flota.noptiScoase : flota.zileScoase)[g.motiv.replace(/ \(.*\)$/, '')] = ((g.noapte ? flota.noptiScoase : flota.zileScoase)[g.motiv.replace(/ \(.*\)$/, '')] ?? 0) + 1;

  // ── locul de noapte: doar nopțile săptămânii care intră (răspunsul 8) ──
  const L = sapt.filter((g) => g.fel === 'noapte');
  let locuri = [], economieSapt = 0, motivFara = ctl.motiv;
  if (L.length) {
    const cand = new Map();
    const add = (p, n, pref) => { const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`; if (!cand.has(k) || cand.get(k).pref < pref) cand.set(k, { n, lat: p.lat, lon: p.lon, pref, fel: pref === PREF.capat ? 'capat' : pref === PREF.acum ? 'acum' : pref === PREF.gara ? 'gara' : pref === PREF.oras ? 'town' : 'village' }); };
    for (const g of L) for (const x of [g.E, g.S]) {
      for (const s of LOC) if (hav(s, x) <= RAZA_CAND) add(s, s.n, s.oras ? PREF.oras : PREF.sat);
      for (const [n, s] of STATII) if (hav(s, x) <= RAZA_CAND) add(s, `gara ${NUME_GARA[n] ?? n}`, PREF.gara);
    }
    const acumN = new Map(); for (const g of L) if (g.sta) acumN.set(g.sta.n, (acumN.get(g.sta.n) || 0) + 1);
    for (const g of L) if (g.sta && (acumN.get(g.sta.n) || 0) >= 2) add(g.sta, numeAcum(g.sta, `${g.sta.n} (stă acum)`), PREF.acum);
    for (const g of L) for (const c of [g.capE, g.capS]) if (c) add(c, `${c.n} (capătul rutei)`, PREF.capat);
    const CC0 = [...cand.values()];
    const pts = L.flatMap((g) => [g.E, g.S]);
    await matrice(pts, CC0); await matrice(CC0, pts); await matrice(L.map((g) => g.E), L.map((g) => g.S));
    const CC = CC0.filter((c) => L.every((g) => areDrum(g.E, c) && areDrum(c, g.S)));
    for (const g of L) g.direct = r1(V(g.E, g.S));
    if (!CC.length) motivFara = 'niciun loc cu drum Valhalla';
    else {
      const legi = L.map((g) => ({ real: g.real, acum: g.sta }));
      const cost = L.map((g) => CC.map((c) => V(g.E, c) + V(c, g.S)));
      const r = alegeNoapte({ legi, cand: CC, cost });
      L.forEach((g, i) => { g.loc = r.loc[i]; g.propus = r.propus[i]; });
      economieSapt = r1(Math.max(0, r.real - r.totalPropus));
      if (economieSapt > 0) {
        locuri = r.idx.map((j, k) => ({ nr: k + 1, n: CC[j].n, fel: CC[j].fel, c: [r5(CC[j].lat), r5(CC[j].lon)], drumuri: L.filter((g) => g.loc === k + 1).length, pref: CC[j].pref }));
        flota.real += r.real; flota.propus += r.totalPropus; flota.taiat += economieSapt;
      } else {
        const acum = [...acumN].sort((x, y) => y[1] - x[1])[0];
        motivFara = `toate nopțile rămân cum sunt${acum ? `: doarme la ${numeAcum(L.find((g) => g.sta?.n === acum[0]).sta, acum[0])} ×${acum[1]}` : ''} (fiecare loc propus e la ≤ ${LA_FEL_KM} km de unde stă sau nu scade km)`;
      }
    }
  } else if (!motivFara) {
    const scoase = sapt.filter((g) => g.noapte && g.motiv).map((g) => g.motiv);
    motivFara = scoase.length ? `nicio noapte de judecat: ${[...new Set(scoase)].join(', ')}` : sapt.length ? 'nicio noapte de judecat (doar pauze de zi)' : `niciun gol între curse (${ctl.curse} curse în săptămână, înlocuitor)`;
  }
  flota.nopti += L.length;
  const liber = sapt.filter((g) => g.fel === 'liber');
  const kmLiber = r1(liber.reduce((s, g) => s + g.real, 0)); flota.liber += kmLiber;
  const r25 = regula2509(O2, m, ZILE); flota.regula2509 += r25.km;

  // ── bucățile pe toată fereastra: curse, golurile (drum / stă / timp liber / muncă știută), înainte și după ──
  const spans = [];
  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    if (i === 0) { if (w.t0 > T0) spans.push(...bucatiGol(P, T0, w.t0, 'gol')); }
    else {
      const g = goluri[i - 1];   // golul dintre W[i-1] și W[i], cu felul lui
      const tip = g.motiv?.startsWith('la poarta') ? 'munca' : g.fel === 'liber' ? 'liber' : 'gol';
      spans.push(...bucatiGol(P, g.a.t1, g.b.t0, tip, { gol: g }));
    }
    spans.push({ t0: Math.max(w.t0, T0), t1: Math.min(w.t1, T1), tip: 'cursa', curse: w.c });
  }
  const tFin = W.length ? Math.min(W.at(-1).t1, T1) : T0;
  if (tFin < T1) spans.push(...bucatiGol(P, tFin, T1, 'gol'));
  for (let i = 1; i < spans.length; i++) if (spans[i].t0 !== spans[i - 1].t1) throw new Error(`${m}: bucățile nu se lipesc la ${new Date(spans[i].t0).toISOString()}`);
  const pasi = []; for (let i = 1; i < P.length; i++) { const k = bucataLa(spans, P[i].t); if (k >= 0) pasi.push({ t: P[i].t, km: kmPas(P[i - 1], P[i]), k, i }); }

  const linii = ctl.rute.map(String);
  const zileScrise = [];
  for (let k = 0; k < 7; k++) {
    const z = ZILE[k], A = D0[k], B = D0[k + 1];
    const pz = pasi.filter((p) => p.t >= A && p.t < B);
    const curseZi = CM.filter((c) => ziLocala(c.t0) === z);
    if (pz.length < 2 && !curseZi.length) continue;
    const ivz = intervaleZi(spans, pz, A, B);
    const iv = ivz.map((x) => {
      const s = spans[x.k];
      const i0 = primulDupa(P, x.t0), i1 = primulDupa(P, x.t1 + 1);
      const Q = P.slice(i0, i1), prev = i0 > 0 ? P[i0 - 1] : null;
      const tr2 = (prev && x.t0 > A ? [prev, ...Q] : Q);
      const pozA = Q[0] ?? pozLa(P, x.t0), pozB = Q.at(-1) ?? pozLa(P, x.t1);
      let nota = null, de = numeLoc(pozA), pana = numeLoc(pozB), lin = null, sir, eticheta = null, kmS = null, neconf = false;
      if (s.tip === 'cursa') {
        nota = s.curse.map((c) => `ruta ${c.r} ${c.s}`).join(' + '); lin = String(s.curse[0].r);
        // ION-268: rolul din plan și km din schelet (porțiunea parcursă) — cursa a început în ziua ei, km schelet se pun pe intervalul care o conține
        const pl = s.curse.map((c) => ({ c, p: statutDe(c) }));
        eticheta = pl.map(({ c, p }) => `${c.s === 'tur' ? 'Tur' : 'Retur'} · ruta ${c.r}${p?.nume ? ` ${p.nume.split(' → ')[c.s === 'tur' ? 0 : 1] ?? ''}` : ''}${p?.statut === 'neconfirmata' ? ` — neconfirmată (${p.motiv})` : p?.capatScurtat ? ' — capăt scurtat' : ''}${p?.perecheCu != null && p.perecheCu !== c.r ? ` (pereche după oră cu ruta ${p.perecheCu})` : ''}`).join(' + ');
        const fac = pl.filter(({ p }) => p?.statut === 'facuta');
        kmS = fac.length ? r1(fac.reduce((q, { p }) => q + p.km, 0) * Math.min(1, Math.max(0, (x.t1 - x.t0) / Math.max(1, s.t1 - s.t0)))) : null;
        neconf = !fac.length;
        sir = dpPuncte(tr2);
      } else if (s.tip === 'parcare') {
        const g = s.gol, dur = Math.round((s.t1 - s.t0) / 6e4);
        de = pana = numeAcum(s.sta, numeLoc(s.sta));
        nota = !g ? 'stă' : g.noapte ? 'noaptea' : g.motiv ? `stă (${g.motiv})` : 'pauză la prânz — fără loc propus (doar pe hartă, Ion 01.10)';
        if (dur >= 60 * GOL_MAX_H) nota = 'zi liberă';
        sir = [[s.sta.lat, s.sta.lon, x.t0]];
      } else {
        const g = s.gol;
        nota = s.tip === 'munca' ? `${g.motiv} — nu e parcare (Ion, 01.10)` : s.tip === 'liber'
          ? `timp liber în pauza de prânz: până la ${Math.round(g.departe)} km de capete, ${r1(g.real)} km — separat, nu e parcare (Ion, 01.10)`
          : g?.noapte ? (g.motiv ? `gol (${g.motiv})` : 'gol de noapte (spre / de la locul nopții)') : g ? (g.motiv ? `gol (${g.motiv})` : 'gol în pauza de prânz') : 'gol';
        sir = dpPuncte(tr2);
      }
      const km = r1(x.km);
      // ION-268: cursa făcută arată km din schelet (porțiunea parcursă); km GPS ai bucății rămân în kmGps; cursa neconfirmată = muncă, nu «cu oameni»
      if (s.tip === 'cursa') return { ora: `${oraLoc(x.t0)}–${x.t1 >= B ? '24:00' : oraLoc(x.t1)}`, t0: Math.round((x.t0 - A) / 1000), t1: Math.round((x.t1 - A) / 1000), tip: 'cursa',
        cats: neconf ? { neconfirmat: km } : { cuOameni: kmS ?? km }, km: neconf ? km : (kmS ?? km), kmGps: km, eticheta,
        de, pana, ocol: false, lin, prelungit: null, s: sir.map((p) => [r5(p[0]), r5(p[1]), Math.round((p[2] - A) / 1000)]), nota, durataMin: null };
      return { ora: `${oraLoc(x.t0)}–${x.t1 >= B ? '24:00' : oraLoc(x.t1)}`, t0: Math.round((x.t0 - A) / 1000), t1: Math.round((x.t1 - A) / 1000), tip: s.tip, cats: { [s.tip]: km }, km,
        de, pana, ocol: false, lin, prelungit: null, s: sir.map((p) => [r5(p[0]), r5(p[1]), Math.round((p[2] - A) / 1000)]), nota, durataMin: s.tip === 'parcare' ? Math.round((s.t1 - s.t0) / 6e4) : null };
    });
    const kmZi = r1(pz.reduce((a, p) => a + p.km, 0)), sumIv = r1(iv.reduce((a, v) => a + (v.kmGps ?? v.km), 0));   // controlul pe km GPS
    if (Math.abs(sumIv - kmZi) > 0.5) throw new Error(`${m} ${z}: Σ intervale ${sumIv} ≠ km zi ${kmZi}`);
    let brut = 0; for (let j = 1; j < pz.length; j++) brut += hav(P[pz[j - 1].i], P[pz[j].i]);
    if (kmZi > 20 && Math.abs(brut - kmZi) > kmZi * 0.05) probe.difKm.push(`${m} ${z} GPS ${kmZi} / brut ${r1(brut)}`);
    // opririle ≥ 5 min ale zilei
    const stai = statii(P.filter((p) => p.t >= A && p.t < B), B).filter((s) => s.min >= 5)
      .map((s) => [r5(s.lat), r5(s.lon), Math.round((s.t0 - A) / 1000), Math.round((Math.min(s.t1, B) - A) / 1000), numeLoc(s)]);
    const noapte = (tt) => { const kk = bucataLa(spans, tt); const s = spans[kk]; return s?.tip === 'parcare' ? { c: [r5(s.sta.lat), r5(s.sta.lon)], n: numeAcum(s.sta, numeLoc(s.sta)), min: Math.round((s.t1 - s.t0) / 6e4) } : null; };
    // drumurile propuse ale nopților care ating ziua: seara (capătul → locul) în ziua în care se termină cursa, dimineața (locul → plecarea) în ziua plecării
    const legi = L.filter((g) => g.loc != null && (ziLocala(g.E.t) === z || ziLocala(g.S.t) === z)).map((g) => ({
      z: g.z, zUrm: ziLocala(g.S.t), parte: 'noapte', ora: `${oraLoc(g.E.t)}–${oraLoc(g.S.t)}`, oraDim: null,
      a: [r5(g.E.lat), r5(g.E.lon)], b: [r5(g.S.lat), r5(g.S.lon)], aN: g.E.n, bN: g.S.n, loc: locuri.length ? g.loc : 0, km: r1(g.propus), separat: false,
      seara: ziLocala(g.E.t) === z, dimineata: ziLocala(g.S.t) === z, real: r1(g.real), acum: g.sta ? numeAcum(g.sta, g.sta.n) : null,
    }));
    const Lz = L.filter((g) => g.z === z && g.propus != null);
    const zp = Lz.length ? { z, masurata: true, motiv: null, real: r1(Lz.reduce((s, g) => s + g.real, 0)), propus: r1(Lz.reduce((s, g) => s + g.propus, 0)),
      economie: r1(Math.max(0, Lz.reduce((s, g) => s + g.real - g.propus, 0))) } : null;
    const liberZi = iv.filter((v) => v.tip === 'liber');
    // ION-268: km cu oameni = km din schelet ai curselor FĂCUTE care pornesc în ziua asta (porțiunea parcursă); planul zilei din grafic
    const planZi = PLAN.plan.filter((p) => p.m === m && p.z === z).sort((a, b) => (a.plecareProg ?? 0) - (b.plecareProg ?? 0));
    const cuOameni = r1(planZi.filter((p) => p.statut === 'facuta').reduce((a, p) => a + p.km, 0));
    const SIMB = { facuta: '✓', neconfirmata: '?', lipsa: '✗' };
    const rezumat = planZi.map((p) => `${p.s} ${p.r} ${SIMB[p.statut]}`).join(' · ') || null;
    const lipsaZi = planZi.filter((p) => p.statut !== 'facuta').map((p) => `${p.s} ${p.r}${p.statut === 'neconfirmata' ? ' (neconfirmată)' : ''}`);
    const planDate = planZi.length ? { z, faraPoarta: false, plus: [], curse: planZi.map((p) => ({ sens: p.s, schimb: 0, ruta: String(p.r), capat: p.nume ? p.nume.split(' → ')[p.s === 'tur' ? 0 : 1] : null,
      statut: p.statut, t0: p.t0 ?? null, t1: p.t1 ?? null, km: p.km ?? null, kmSchelet: p.kmPlin ?? null, kmGps: p.kmGps ?? null, urcari: 0, motiv: p.motiv ?? (p.capatScurtat ? `capăt scurtat: ${p.km} din ${p.kmPlin} km ai scheletului` : null),
      acoperire: p.acoperire, perecheCu: p.perecheCu ?? null })) } : null;
    randuri.push({
      uzina: 'MEJGOROD', saptamina: SAPT, m, z,
      sumar: { dow: new Date(`${z}T12:00:00Z`).getUTCDay(), total: kmZi, cuOameni, gol: r1(kmZi - iv.filter((v) => v.tip === 'cursa').reduce((a, v) => a + (v.kmGps ?? v.km), 0)), economie: locuri.length ? (zp?.economie ?? 0) : null, ideal: null, linii,
        motivAfara: locuri.length ? null : motivFara, economieSapt: locuri.length ? economieSapt : 0, locuri: locuri.map((l) => l.n), sursaEconomie: 'parcare',
        liber: r1(liberZi.reduce((a, v) => a + v.km, 0)), liberSapt: kmLiber, regula2509: r1(r25.peZi[z] ?? 0), regula2509Sapt: r25.km,
        rezumat, lipsa: lipsaZi, plan: planZi.length ? { planificate: planZi.length, facute: planZi.filter((p) => p.statut === 'facuta').length, neconfirmate: planZi.filter((p) => p.statut === 'neconfirmata').length, lipsa: planZi.filter((p) => p.statut === 'lipsa').length, plus: 0 } : null },
      date: {
        t00: A, casa: null, noapteA: noapte(A), noapteB: noapte(B - 1000), linii, iv, stai, zi: null, ideal: null,
        parcare: { locuri, economieSapt: locuri.length ? economieSapt : 0, idealSapt: null, zi: zp, legi },
        mejgorod: { liberSapt: kmLiber, liber: liber.map((g) => ({ z: ziLocala(g.E.t), ora: `${oraLoc(g.E.t)}–${oraLoc(g.S.t)}`, de: g.E.n, km: r1(g.real), departe: r1(g.departe) })),
          regula2509: { sapt: r25.km, zi: r1(r25.peZi[z] ?? 0), zile: r25.zile, laCapat: r25.laCapat, cazB: r25.cazB },
          nopti: L.length, motivFara: locuri.length ? null : motivFara },
        plan: planDate,
      },
    });
    zileScrise.push(z);
  }
  Object.assign(ctl, { pe: zileScrise.length > 0, zile: zileScrise.length, propunere: locuri.length > 0, economieSapt: locuri.length ? economieSapt : 0, nopti: L.length,
    locuri: locuri.map((l) => `P${l.nr} ${l.n}`), liber: kmLiber, regula2509: r25.km, motiv: locuri.length ? null : (zileScrise.length ? motivFara : motivFara ?? 'nicio zi cu urmă în săptămână'),
    acum: (() => { const c = {}; for (const g of L) if (g.sta) c[numeAcum(g.sta, g.sta.n)] = (c[numeAcum(g.sta, g.sta.n)] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, k]) => `${n} ×${k}`).join(', '); })() });
  ctl.legi = L.map((g) => ({ z: g.z, de: g.E.n, spre: g.S.n, acum: g.sta?.n ?? null, real: r1(g.real), propus: g.propus != null ? r1(g.propus) : null, loc: g.loc ?? null }));
}
await tr.end();
fs.writeFileSync(CF, JSON.stringify(Object.fromEntries(cache)));

function dpPuncte(Q) {   // Douglas–Peucker 15 m, [lat, lon, t]
  if (Q.length < 3) return Q.map((p) => [p.lat, p.lon, p.t]);
  const k = 111320, c = Math.cos(Q[0].lat * Math.PI / 180), X = Q.map((p) => [p.lon * k * c, p.lat * k]);
  const keep = new Uint8Array(Q.length); keep[0] = keep[Q.length - 1] = 1; const st = [[0, Q.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let mm = -1, md = 0; const [x1, y1] = X[a], [x2, y2] = X[b], Ln = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - X[i][1]) - (x1 - X[i][0]) * (y2 - y1)) / Ln; if (d > md) { md = d; mm = i; } }
    if (md > 15) { keep[mm] = 1; st.push([a, mm], [mm, b]); } }
  return Q.filter((_, i) => keep[i]).map((p) => [p.lat, p.lon, p.t]);
}

// ── controlul și probele ──
const kb = Math.round(JSON.stringify(randuri).length / 1024);
const pe = control.filter((c) => c.pe), cuP = control.filter((c) => c.propunere);
console.log(`harta MEJGOROD ${SAPT}: ${randuri.length} rânduri · ${kb} KB · flota ${control.length} · pe hartă ${pe.length} · cu loc propus ${cuP.length} · fără Valhalla ${faraV}`);
console.log(`  de tăiat ${r1(flota.taiat)} km/săpt. (real ${r1(flota.real)} → propus ${r1(flota.propus)}) pe ${flota.nopti} nopți · timp liber la prânz ${r1(flota.liber)} km · regula din 25.09 ${r1(flota.regula2509)} km${O2 ? '' : ' (optim2 lipsă)'}`);
console.log('  nopți scoase:', JSON.stringify(flota.noptiScoase), '· pauze de zi scoase:', JSON.stringify(flota.zileScoase));
for (const c of [...control].sort((a, b) => (b.economieSapt ?? 0) - (a.economieSapt ?? 0)))
  console.log(`  ${c.propunere ? '✓' : c.pe ? '·' : '✗'} ${c.m.padEnd(8)} rute ${c.rute.join(',').padEnd(8)} ${String(c.km ?? '—').padStart(5)} km ${String(c.zile ?? 0)} zile · nopți ${c.nopti ?? 0} · ${c.propunere ? `${c.locuri.join(' + ')} · de tăiat ${c.economieSapt}` : c.motiv} · acum: ${c.acum || '—'} · liber ${c.liber ?? 0} · r25.09 ${c.regula2509 ?? 0}`);
if (probe.faraUrma.length) console.log(`  curse fără urmă (${probe.faraUrma.length}):`, probe.faraUrma.join(' | '));
if (probe.difKm.length) console.log(`  km GPS ≠ urma brută (> 5 %, ${probe.difKm.length}):`, probe.difKm.slice(0, 15).join(', '));
for (const [m, z] of [['688AKD', '2026-09-21'], ['735LYY', '2026-09-21'], ['652AKD', null], ['065LTL', null], ['654TWK', null], ['998TCP', null]]) {
  const c = control.find((x) => x.m === m); if (!c) continue;
  console.log(`  probă ${m}: ${c.propunere ? c.locuri.join(' + ') + ' · ' + c.economieSapt + ' km' : c.motiv} · ${(c.legi ?? []).filter((l) => !z || l.z === z).map((l) => `${l.z.slice(5)} ${l.de}→${l.spre} acum ${l.acum ?? '—'} ${l.real}→${l.propus ?? '—'} P${l.loc ?? '-'}`).join(' | ')}`);
}
const mare = randuri.filter((x) => JSON.stringify(x).length > 400 * 1024).map((x) => `${x.m} ${x.z}`);
if (mare.length) { console.error(`rânduri peste 400 KB: ${mare.join(', ')} — harta NU se scrie`); process.exit(3); }
fs.writeFileSync(path.join(DATE, `harta-${SAPT}.json`), JSON.stringify({ control, flota }));
if (process.env.HARTA_OUT) fs.writeFileSync(process.env.HARTA_OUT, JSON.stringify({ randuri, control, plan: PLAN.plan, perechi: PLAN.perechi.map((x) => ({ k: x.k, t: x.t && { r: x.t.r, statut: x.t.statut, km: x.t.km }, r: x.r && { r: x.r.r, statut: x.r.statut, km: x.r.km } })) }));
{ const st = (q) => PLAN.plan.filter((p) => p.statut === q).length;
  console.log(`  plan din grafic (schelet întâi): ${PLAN.plan.length} curse · făcute ${st('facuta')} · neconfirmate ${st('neconfirmata')} · lipsă ${st('lipsa')} · capăt scurtat ${PLAN.plan.filter((p) => p.capatScurtat).length} · km cu oameni (schelet, porțiunea parcursă) ${r1(PLAN.plan.filter((p) => p.statut === 'facuta').reduce((a, p) => a + p.km, 0))}`); }
// ION-268 K.9: controalele înainte de cifre (control.mjs mejgorod) pe rândurile hărții; picat → nimic scris (ce era publicat rămâne)
{ const f = process.env.HARTA_OUT || path.join(DATE, `harta-out-${SAPT}.json`);
  if (!process.env.HARTA_OUT) fs.writeFileSync(f, JSON.stringify({ randuri, control, plan: PLAN.plan, perechi: PLAN.perechi.map((x) => ({ k: x.k, t: x.t && { r: x.t.r, statut: x.t.statut, km: x.t.km }, r: x.r && { r: x.r.r, statut: x.r.statut, km: x.r.km } })) }));
  const { spawnSync } = await import('node:child_process');
  const c = spawnSync('node', ['/root/lde-worker/lear-parcare/control.mjs', 'mejgorod', f, '--out', path.join(DATE, `control-${SAPT}.json`)], { stdio: 'inherit' });
  if (c.status !== 0 && WRITE) { console.error('CONTROL PICAT (K.9) — harta mejgorod NU se scrie'); process.exit(3); } }
if (!WRITE) process.exit(0);

const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc (--env-file)'); process.exit(1); }
const HJ = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
if (!randuri.length) { console.error('niciun rând — harta NU se scrie (ce era rămâne)'); process.exit(3); }
const del = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.MEJGOROD&saptamina=eq.${SAPT}`, { method: 'DELETE', headers: HJ });
if (!del.ok) { console.error('DELETE', del.status, await del.text()); process.exit(1); }
for (let i = 0; i < randuri.length; i += 20) {
  const x = await fetch(`${SB}/rest/v1/lde_harta_zi`, { method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify(randuri.slice(i, i + 20)) });
  if (!x.ok) { console.error('POST', x.status, await x.text()); process.exit(1); }
}
const rap = { tip: 'harta_mejgorod', saptamina: SAPT, pana_la: ZILE[6], rulat: new Date().toISOString(),
  flota: { masini: control.length, peHarta: pe.length, cuPropunere: cuP.length, taiat: r1(flota.taiat), real: r1(flota.real), propus: r1(flota.propus), nopti: flota.nopti,
    liber: r1(flota.liber), regula2509: r1(flota.regula2509), noptiScoase: flota.noptiScoase, zileScoase: flota.zileScoase },
  parametri: { TOLERANTA, LA_FEL_KM, GOL_MAX_H, RAZA_CAND, VAL_F, CAPAT_KM },
  control: control.map(({ legi, ...c }) => c),
  regula: 'Ion, 01.10.2026: «adaugă toate direcțiile» — locul de noapte P1/P2 (ocolul pe acasă se socotește, capătul rutei la ≤ 20 km/săpt. mai mult, rămâne cum e la ≤ 4 km, nopțile până la 20 h); pauzele de prânz doar pe hartă, ocolul de la prânz = timp liber; 652AKD la SEBN = muncă știută; regula din 25.09 doar informativ.' };
const up = await fetch(`${SB}/rest/v1/lde_analiza_reguli?on_conflict=uzina,saptamina`, { method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{ uzina: 'MEJGOROD_HARTA', saptamina: SAPT, rulat_la: new Date().toISOString(), date: rap, note: `${cuP.length}/${control.length} mașini cu loc propus · ${r1(flota.taiat)} km/săpt.` }]) });
if (!up.ok) { console.error('lde_analiza_reguli', up.status, await up.text()); process.exit(1); }
console.log(`scris: ${randuri.length} rânduri în lde_harta_zi MEJGOROD ${SAPT} + controlul flotei în lde_analiza_reguli MEJGOROD_HARTA`);
