// ION-149 cercetare (DOAR CITIRE): Mejgorod — unde stă autobuzul între curse și noaptea, câți km face acolo, și cât ar face
// dacă ar sta într-un loc propus (1–2 locuri, alegerea LEAR ION-143). Săptămâna 21–27.09.2026 (golurile cu capătul E în ea).
//   cd /root/lde-worker/mejgorod-parcare/cercetare/cod && node --env-file=/root/lde-worker/.env masoara.mjs > ../masoara.txt
// Ieșire: ../date/masoara.json (goluri pe mașină) + text pe stdout. Nu scrie nimic în bază.
import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { hav, nmea, normPlate, inMd, localToUtc, utcText, STATII } from './geo.mjs';
import { alegeLocuri } from '/root/lde-worker/lear-parcare/lear-parcare-alege.mjs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));

const B = '/root/lde-worker/mejgorod-parcare/cercetare/date/';
const N = JSON.parse(readFileSync(B + 'nomenclator-c.json', 'utf8'));
const D = JSON.parse(readFileSync(B + 'curse-c.json', 'utf8'));
const I = JSON.parse(readFileSync(B + 'ideal.json', 'utf8'));
const LUNI = '2026-09-21', DUM = '2026-09-27';
const SALT_KM = 5, R_STAT = 0.3, GOL_MIN = 60, GOL_MAX_H = 20, RAZA_CAND = 15, VAL_F = 1.05, CAPAT_KM = 3;
const PARC_BALTI = { lat: 47.770, lon: 27.9235 }, R_BALTI = 4;
const PORTI = [[47.78513, 27.94307, 0.6, 'Drăxlmaier E'], [47.77408, 27.91593, 0.5, 'Drăxlmaier V'], [47.3864, 28.8014, 0.5, 'SEBN Orhei'],
  [47.38724, 28.81155, 0.4, 'SEBN Orhei E'], [47.15225, 28.62686, 0.5, 'SEBN Strășeni'], [47.223, 27.8016, 0.5, 'LEAR Ungheni'],
  [47.89645, 28.29982, 0.5, 'LEAR Florești'], [48.34648, 27.08318, 0.4, 'Trox Briceni']].map(([lat, lon, r, n]) => ({ lat, lon, r, n }));
const CHIS = { lat: 47.0245, lon: 28.8323 };
const tz = (ms) => new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' });
const hm = (ms) => tz(ms).slice(5, 16).replace('T', ' ');
const ziLucru = (ms) => tz(ms - 3 * 36e5).slice(0, 10);
const r1 = (v) => Math.round(v * 10) / 10;

// localitățile OSM (grilă 0,02°)
const LOC = [], GR = new Map(), gk = (a, b) => `${Math.floor(a / 0.02)}|${Math.floor(b / 0.02)}`;
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  const c = l.replace(/\x1e/g, '').trim(); if (!c) continue; let q; try { q = JSON.parse(c); } catch { continue; }
  const pr = q.properties || {}, nm = pr['name:ro'] || pr.name; if (!nm || !['city', 'town', 'village'].includes(pr.place)) continue;
  const p = { n: nm, lat: q.geometry.coordinates[1], lon: q.geometry.coordinates[0], oras: pr.place !== 'village' };
  if (!inMd(p)) continue; LOC.push(p); const k = gk(p.lat, p.lon); if (!GR.has(k)) GR.set(k, []); GR.get(k).push(p);
}
const numeLoc = (p) => { for (const [g, s] of STATII) if (hav(p, s) <= 0.4) return `gara ${g}`; if (hav(p, CHIS) <= 12) return 'Chișinău';
  let b = null, d = 1e9; for (const s of LOC) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 2 ? b : `${b} (${r1(d)} km)`; };

// Valhalla bus, cache pe disc (doar în dosarul cercetării)
const CF = B + 'drum-cache.json';
const cache = existsSync(CF) ? new Map(Object.entries(JSON.parse(readFileSync(CF, 'utf8')))) : new Map();
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

function kmIntre(P, t0, t1) { let s = 0; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; if (b.t <= t0 || a.t >= t1) continue;
  const d = hav(a, b); if (d < SALT_KM && !(a.v <= 1 && b.v <= 1)) s += d; } return s; }
const pozLa = (P, t) => { let b = P[0]; for (const p of P) { if (p.t > t) break; b = p; } return b; };
// staționările din gol: puncte la ≤ R_STAT de ancoră, tăcerea tracker-ului fără deplasare = tot staționare
function statii(P, t0, t1) { const Q = P.filter((p) => p.t >= t0 && p.t <= t1); const out = []; let i = 0;
  while (i < Q.length) { let j = i; while (j + 1 < Q.length && hav(Q[j + 1], Q[i]) <= R_STAT) j++;
    const fin = j + 1 < Q.length ? Q[j + 1].t : t1; out.push({ lat: Q[i].lat, lon: Q[i].lon, t0: Q[i].t, t1: fin, min: (fin - Q[i].t) / 6e4 }); i = j + 1; }
  return out; }
const opresteLa = (P, t0, t1, c, r, min = 2) => { let t = null; for (const p of P) { if (p.t < t0 || p.t > t1) continue;
  if (hav(p, c) <= r && p.v <= 1) { t ??= p.t; if (p.t - t >= min * 6e4) return true; } else t = null; } return false; };

// capetele rutelor: nord = primul stop din ideal, sud = Chișinău
const CAP = new Map(I.map((x) => [x.ruta, { nord: { lat: x.stops[0].lat, lon: x.stops[0].lon, n: x.stops[0].n }, sud: { lat: x.stops.at(-1).lat, lon: x.stops.at(-1).lon, n: 'Chișinău' }, km: x.km }]));

const t = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB });
await t.connect();
const { rows: devs } = await t.query(`SELECT id, "CarName", "RegNo" FROM devices`);
const byPlate = new Map();
for (const d of devs) for (const p of new Set([normPlate(d.CarName), normPlate(d.RegNo)])) { if (!p) continue; if (!byPlate.has(p)) byPlate.set(p, []); byPlate.get(p).push(d.id); }

const cuUrma = D.curse.filter((c) => !c.motiv && c.t0 && c.t1);
const plates = [...new Set(N.atribuiri.map((a) => a.m))].sort();
const OUT = [];
const T0 = localToUtc('2026-09-20', 0).getTime(), T1 = localToUtc('2026-09-29', 4 * 60).getTime();
for (const m of plates) {
  const rec = { m, atribuiri: N.atribuiri.filter((a) => a.m === m && a.z >= LUNI && a.z <= DUM).length, curse: 0, goluri: [], motiv: null };
  OUT.push(rec);
  const ids = byPlate.get(normPlate(m)); if (!ids) { rec.motiv = 'fără tracker'; continue; }
  const { rows } = await t.query(`SELECT x, y, w_date, speed FROM track WHERE id = ANY($1) AND w_date BETWEEN $2 AND $3 AND x < 9000 AND y < 9000 ORDER BY w_date`, [ids, utcText(T0), utcText(T1)]);
  const P = rows.map((r) => ({ lat: nmea(+r.x), lon: nmea(+r.y), t: r.w_date.getTime(), v: r.speed == null ? 0 : +r.speed })).filter(inMd);
  rec.puncte = P.length;
  const C = cuUrma.filter((c) => normPlate(c.m) === normPlate(m)).sort((a, b) => a.t0 - b.t0);
  rec.curse = C.filter((c) => ziLucru(c.t0) >= LUNI && ziLucru(c.t0) <= DUM).length;
  rec.kmCurse = r1(C.filter((c) => ziLucru(c.t0) >= LUNI && ziLucru(c.t0) <= DUM).reduce((s, c) => s + c.km, 0));
  rec.kmSapt = r1(kmIntre(P, localToUtc(LUNI, 180).getTime(), localToUtc('2026-09-28', 180).getTime()));
  if (!C.length) { rec.motiv = 'nicio cursă cu urmă'; continue; }
  // bucățile de muncă (suprapuse = lipite)
  const W = []; for (const c of C) { const l = W.at(-1); if (l && c.t0 <= l.t1) { l.t1 = Math.max(l.t1, c.t1); l.c.push(c); } else W.push({ t0: c.t0, t1: c.t1, c: [c] }); }
  for (let i = 0; i + 1 < W.length; i++) {
    const a = W[i], b = W[i + 1], E = pozLa(P, a.t1), S = pozLa(P, b.t0), dur = (b.t0 - a.t1) / 6e4;
    if (ziLucru(a.t1) < LUNI || ziLucru(a.t1) > DUM) continue;
    const ca = a.c.at(-1), cb = b.c[0];
    const noapte = ziLucru(a.t1) !== ziLucru(b.t0);
    const g = { de: hm(a.t1), pana: hm(b.t0), min: Math.round(dur), noapte, dupa: `${ca.r} ${ca.s}`, inainte: `${cb.r} ${cb.s}`,
      E: { lat: +E.lat.toFixed(5), lon: +E.lon.toFixed(5), n: numeLoc(E) }, S: { lat: +S.lat.toFixed(5), lon: +S.lon.toFixed(5), n: numeLoc(S) },
      real: r1(kmIntre(P, a.t1, b.t0)), direct: null, motiv: null,
      departe: r1(Math.max(0, ...P.filter((p) => p.t > a.t1 && p.t < b.t0).map((p) => Math.min(hav(p, E), hav(p, S))))) };
    const capE = ca.s === 'retur' ? CAP.get(ca.r)?.nord : CAP.get(ca.r)?.sud, capS = cb.s === 'tur' ? CAP.get(cb.r)?.nord : CAP.get(cb.r)?.sud;
    g.Ecapat = capE ? r1(hav(E, capE)) : null; g.Scapat = capS ? r1(hav(S, capS)) : null; g.capE = capE?.n; g.capS = capS?.n;
    const cn = cb.s === 'tur' ? CAP.get(cb.r)?.nord : ca.s === 'retur' ? CAP.get(ca.r)?.nord : null;   // capătul de nord al rutei (unde doarme «la capăt»)
    g.capN = cn ? { lat: cn.lat, lon: cn.lon, n: cn.n } : null;
    const st = statii(P, a.t1, b.t0).sort((x, y) => y.min - x.min);
    g.sta = st[0] ? { lat: +st[0].lat.toFixed(5), lon: +st[0].lon.toFixed(5), n: numeLoc(st[0]), min: Math.round(st[0].min) } : null;
    const porta = (q) => opresteLa(P, a.t1, b.t0, q, q.r) || (hav(q, E) > 20 && hav(q, S) > 20 && (!st[0] || hav(q, st[0]) > 20) && P.some((p) => p.t > a.t1 && p.t < b.t0 && hav(p, q) <= q.r));
    if (dur < GOL_MIN) g.motiv = 'sub 60 min';
    else if (dur > GOL_MAX_H * 60) g.motiv = 'peste 20 h (zi liberă)';
    // poarta altei uzine: oprire ≥ 2 min în rază, SAU trecere prin rază când poarta e la > 20 km de E, S și de locul unde stă
    // (poarta Trox e pe drumul prin Briceni: simpla trecere spre casă nu e muncă la Trox)
    else if (PORTI.some((q) => porta(q))) g.motiv = 'la poarta ' + PORTI.filter((q) => porta(q)).map((q) => q.n).join('+');
    else if (opresteLa(P, a.t1, b.t0, PARC_BALTI, R_BALTI)) g.motiv = 'Bălți (service)';
    rec.goluri.push(g);
  }
}
await t.end();

// candidații și Valhalla pe golurile care intră
for (const r of OUT) {
  const L = r.goluri.filter((g) => !g.motiv); if (!L.length) continue;
  const cand = new Map();
  const add = (p, n, pref) => { const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`; if (!cand.has(k) || cand.get(k).pref < pref) cand.set(k, { n, lat: p.lat, lon: p.lon, pref }); };
  for (const g of L) for (const x of [g.E, g.S]) {
    for (const s of LOC) if (hav(s, x) <= RAZA_CAND) add(s, s.n, s.oras ? 1 : 0);
    for (const [n, s] of STATII) if (hav(s, x) <= RAZA_CAND) add(s, `gara ${n}`, 1);
  }
  const acumN = new Map(); for (const g of L) if (g.sta && g.sta.min >= 60) acumN.set(g.sta.n, (acumN.get(g.sta.n) || 0) + 1);
  for (const g of L) if (g.sta && (acumN.get(g.sta.n) || 0) >= 2) add(g.sta, `${g.sta.n} (stă acum)`, 2);
  const C = [...cand.values()];
  const pts = [...L.flatMap((g) => [g.E, g.S])];
  await matrice(pts, C); await matrice(C, pts); await matrice(L.map((g) => g.E), L.map((g) => g.S));
  const CC = C.filter((c) => L.every((g) => areDrum(g.E, c) && areDrum(c, g.S)));
  const LC = L.filter((g) => g.capN); await matrice(LC.map((g) => g.E), LC.map((g) => g.capN)); await matrice(LC.map((g) => g.capN), LC.map((g) => g.S));
  for (const g of L) { g.direct = r1(V(g.E, g.S)); g.prinCapat = g.capN ? r1(V(g.E, g.capN) + V(g.capN, g.S)) : null; }
  if (!CC.length) { r.motivP = 'niciun loc cu drum Valhalla'; continue; }
  const legi = L.map((g) => ({ real: g.real, acum: g.sta && g.sta.min >= 60 ? g.sta : null }));
  const cost = L.map((g) => CC.map((c) => V(g.E, c) + V(c, g.S)));
  const { ales, alege } = alegeLocuri({ legi, cand: CC, cost, hav });
  r.P = ales.idx.map((j) => CC[j].n);
  L.forEach((g, i) => { const j = alege(ales.idx, i); g.loc = j < 0 ? 0 : ales.idx.indexOf(j) + 1; g.propus = r1(j < 0 ? g.real : cost[i][j]); });
  r.real = r1(L.reduce((s, g) => s + g.real, 0)); r.propus = r1(L.reduce((s, g) => s + g.propus, 0)); r.taiat = r1(Math.max(0, r.real - r.propus));
  r.directSum = r1(L.reduce((s, g) => s + Math.min(g.real, g.direct), 0));
  r.taiatCapat = r1(L.filter((g) => g.noapte && g.prinCapat != null).reduce((s, g) => s + Math.max(0, g.real - g.prinCapat), 0));
  r.taiatA = r1(L.filter((g) => g.noapte && g.Ecapat != null && g.Ecapat <= CAPAT_KM).reduce((s, g) => s + Math.max(0, g.real - g.propus), 0));
  r.taiatB = r1(L.filter((g) => g.noapte && !(g.Ecapat != null && g.Ecapat <= CAPAT_KM)).reduce((s, g) => s + Math.max(0, g.real - g.propus), 0));
  r.taiatZi = r1(L.filter((g) => !g.noapte).reduce((s, g) => s + Math.max(0, g.real - g.propus), 0));
  const acum = new Map(); for (const g of L) if (g.noapte && g.sta) acum.set(g.sta.n, (acum.get(g.sta.n) || 0) + 1);
  r.acum = [...acum].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([n, k]) => `${n} ×${k}`).join(', ');
}
writeFileSync(CF, JSON.stringify(Object.fromEntries(cache)));
writeFileSync(B + 'masoara.json', JSON.stringify(OUT, null, 1));

// raportul
let tot = { real: 0, propus: 0, taiat: 0 };
for (const r of OUT) {
  const L = r.goluri.filter((g) => !g.motiv);
  console.log(`\n${r.m.padEnd(8)} atribuiri ${r.atribuiri} · curse cu urmă ${r.curse} (${r.kmCurse ?? 0} km) · km săpt. ${r.kmSapt ?? '—'} · goluri ${r.goluri.length} (intră ${L.length})${r.motiv ? ' · ' + r.motiv : ''}${r.motivP ? ' · ' + r.motivP : ''}`);
  if (r.P) { console.log(`   P: ${r.P.join(' + ')} · real ${r.real} → propus ${r.propus} · de tăiat ${r.taiat} km/săpt. (nopți A ${r.taiatA} · B ${r.taiatB} · zi ${r.taiatZi}; doarme acum: ${r.acum}; varianta «la capăt» ${r.taiatCapat}; direct E→S ${r.directSum})`); tot.real += r.real; tot.propus += r.propus; tot.taiat += r.taiat; }
  for (const g of r.goluri) console.log(`   ${g.noapte ? 'N' : 'Z'} ${g.de} → ${g.pana} ${String(g.min).padStart(5)}′ după ${g.dupa.padEnd(9)} ${g.E.n} (cap ${g.capE} ${g.Ecapat} km) → ${g.S.n} (cap ${g.capS} ${g.Scapat} km) · stă ${g.sta ? g.sta.n + ' ' + g.sta.min + '′' : '—'} · real ${g.real} direct ${g.direct ?? '—'} capăt ${g.prinCapat ?? '—'} dep ${g.departe}${g.loc != null ? ` · ${g.loc ? 'P' + g.loc : 'rămâne'} ${g.propus}` : ''}${g.motiv ? ' · ' + g.motiv : ''}`);
}
console.log(`\nFLOTA: real ${r1(tot.real)} · propus ${r1(tot.propus)} · de tăiat ${r1(tot.taiat)} km/săpt. · fără Valhalla: ${faraV}`);
