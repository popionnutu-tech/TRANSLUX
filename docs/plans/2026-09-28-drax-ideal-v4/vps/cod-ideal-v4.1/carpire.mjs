// Ideal-v3.1 (ION-99) pasul 1e — CÂRPIREA GOLURILOR DE SEMNAL (Ion, 27.09.2026: «fă cârpiri dacă sare GPS-ul»).
// Regula: km reali din GPS; cârpirea completează DOAR golul (două puncte consecutive în aceeași cursă, peste pragul din goluri-prag.json)
// cu drumul pe șosea dintre ultimul punct dinainte și primul de după gol (Valhalla `route`, localhost:8002, costing bus), marcat
// `carpit: true`, cu km cârpiți separat (`kmCarpit`); restul km rămân cei reali. Cursa cu > 30 % km cârpiți primește `steagCarpit`.
// Cum: pentru fiecare cursă din goluri-curse.json, urma brută (urme-gol.json, citită o dată din tracker) se trece prin EXACT calculul din
// curse.mjs (km = Σ haversine cu segmentele ≥ 5 km sărite; apropieri ≤ 1,2 km de ținte; opriri < 8 km/h, ≥ 20 s lent) — întâi FĂRĂ
// cârpire, ca probă (km și apropierile trebuie să iasă identice cu curse-ideal.json, altfel cursa nu se atinge și se raportează), apoi cu
// punctele drumului Valhalla intercalate în gol: km (segmentul golului = drumul pe șosea în loc de dreapta / 0), apropierile (cele găsite pe
// drumul cârpit au `carpit: true`), opririle (doar din punctele reale, cu km-ul noii urme). Gardă: drum pe șosea > 2 × dreapta + 2 km =
// ocol suspect → golul rămâne necârpit și se raportează.
// Idempotent: cursele deja cârpite (kmCarpit ≠ undefined) se sar. Valhalla se cheamă doar pentru golurile care lipsesc din cache.
//   cd /root/lde-worker/drax/cod/ideal-v4 && node carpire.mjs
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';
const DIR = '../../date/ideal-v4.1';
const scrie = (f, x) => { writeFileSync(f + '.tmp', x); renameSync(f + '.tmp', f); };
const J = f => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const D = J('curse-ideal.json'), PR = J('goluri-prag.json'), GC = J('goluri-curse.json'), U = J('urme-gol.json').urme;
const CACHE = `${DIR}/carpire-valhalla.json`; const VC = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const T_DT = PR.T_DT, T_D = PR.T_D, V_MAX = PR.V_MAX, STEAG = 0.30;
// constantele din curse.mjs:20 (copiate, neschimbate)
const R_SAT = 1.2, R_OPR = 0.8, V_OPRIRE = 8, V_LENT = 15, S_LENT = 20;
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const places = loadPlaces('/root/lde-worker/places.geojsonseq'); const idx = buildPlacesIndex(places);
const tinte = D.tinte;
const dec6 = s => { let i = 0, lat = 0, lon = 0; const o = []; while (i < s.length) { for (const k of [0, 1]) { let r = 0, sh = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
  const d = r & 1 ? ~(r >> 1) : r >> 1; if (k === 0) lat += d; else lon += d; } o.push({ lat: lat / 1e6, lon: lon / 1e6 }); } return o; };
async function drum(a, b) {
  const k = `${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}`; if (VC[k]) return VC[k];
  const body = { locations: [{ lat: a.lat, lon: a.lon, type: 'break' }, { lat: b.lat, lon: b.lon, type: 'break' }], costing: 'bus', units: 'kilometers', directions_type: 'none' };
  const r = await fetch('http://localhost:8002/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.trip) { VC[k] = { eroare: j.error || String(r.status) }; return VC[k]; }
  VC[k] = { km: +j.trip.summary.length.toFixed(3), shape: j.trip.legs[0].shape }; return VC[k];
}
// calculul din curse.mjs:124-146 pe o urmă (puncte reale + sintetice), opririle doar pe cele reale
function calcul(M) {
  let km = 0; const cum = [0];
  for (let i = 1; i < M.length; i++) { const dk = hav(M[i - 1], M[i]); if (dk < 5 || M[i].syn || M[i - 1].syn || M[i].dupaGol) km += dk; cum.push(km); }
  const apr = [];
  for (const g of tinte) { let run = null;
    for (let i = 0; i < M.length; i++) { const dd = hav(M[i], g);
      if (dd <= R_SAT) { if (!run || dd < run.d) run = { ...(run || { i0: i }), d: dd, i }; }
      else if (run) { apr.push({ id: g.id, k: g.k, km: +cum[run.i].toFixed(2), d: +run.d.toFixed(2), t: M[run.i].t, ...(M[run.i].syn ? { carpit: true } : {}) }); run = null; } }
    if (run) apr.push({ id: g.id, k: g.k, km: +cum[run.i].toFixed(2), d: +run.d.toFixed(2), t: M[run.i].t, ...(M[run.i].syn ? { carpit: true } : {}) }); }
  apr.sort((a, b) => a.km - b.km);
  const opr = []; let v = null;
  for (let i = 0; i < M.length; i++) { const p = M[i]; if (p.syn) continue;
    const nn = idx.nearestWithin(p, R_OPR);
    if (!nn) { if (v) { opr.push(v); v = null; } continue; }
    if (!v || v.n !== nn.name) { if (v) opr.push(v); v = { n: nn.name, vmin: p.v, sl: 0, tp: p.t, km: cum[i], lat: p.lat, lon: p.lon }; }
    else { if (p.v < v.vmin) { v.vmin = p.v; v.lat = p.lat; v.lon = p.lon; v.km = cum[i]; }
      const dt = Math.min((p.t - v.tp) / 1000, 120); if (p.v < V_LENT) v.sl += dt; v.tp = p.t; } }
  if (v) opr.push(v);
  return { km: +km.toFixed(2), cum, apr, opr: opr.filter(x => x.vmin < V_OPRIRE && x.sl >= S_LENT).map(x => ({ n: x.n, km: +x.km.toFixed(1), lat: +x.lat.toFixed(5), lon: +x.lon.toFixed(5) })) };
}
const iso = t => new Date(t).toISOString();
const byKey = new Map(D.curse.map(c => [`${c.m}|${c.dev}|${iso(c.t0)}`, c]));
const st = { ordineTimpEgal: 0, curse: 0, carpite: 0, sarite: 0, dejaCarpite: 0, nepotrivite: [], goluri: 0, goluriCarpite: 0, ocol: 0, eroareValhalla: 0, kmCarpit: 0, kmDreptVechi: 0, steag: 0, aprCarpite: 0 };
const peMasina = {};
for (const g of GC) {
  st.curse++; const k = `${g.m}|${g.dev}|${g.t0}`, c = byKey.get(k), u = U[k];
  if (!c || !u) { st.nepotrivite.push(`${k}: ${!c ? 'cursa lipsește' : 'urma lipsește'}`); continue; }
  if (c.kmCarpit !== undefined) { st.dejaCarpite++; continue; }
  const P = u.map(r => ({ lat: nmea(Number(r[1])), lon: nmea(Number(r[2])), v: Number(r[3]) * 1.852, t: new Date(r[0]) })).filter(p => p.lat > 45 && p.lat < 49 && p.lon > 26 && p.lon < 31);
  // proba: aceeași urmă, fără cârpire → km și apropierile din curse-ideal.json
  const P0 = calcul(P);
  // proba: exact (±0,01 km) — sau, când trackerul are puncte cu ACELAȘI w_date (ordinea lor în SQL nu e fixă: extracția și această citire
  // le pot lua în altă ordine; măsurat pe 34 de curse: 0,01–0,23 km, ordonarea după ctid dă și ea alt km), aceleași apropieri în aceeași
  // ordine și |Δkm| ≤ 0,5 % din cursă. Km reali rămân cei din curse-ideal.json: km final = km v3 + Σ (drum cârpit − dreapta numărată în v3).
  const dupTimp = u.length - new Set(u.map(r => r[0])).size, dKm = +(c.km - P0.km).toFixed(2);
  const ids = P0.apr.length === c.apr.length && P0.apr.every((a, i) => a.id === c.apr[i].id);
  const exact = ids && Math.abs(dKm) <= 0.011 && P0.apr.every((a, i) => Math.abs(a.km - c.apr[i].km) < 0.011);
  const ordine = !exact && dupTimp > 0 && ids && Math.abs(dKm) <= 0.005 * c.km && P0.apr.every((a, i) => Math.abs(a.km - c.apr[i].km) <= Math.abs(dKm) + 0.011);
  if (!(exact || ordine) || iso(P[0].t) !== iso(c.t0) || iso(P[P.length - 1].t) !== iso(c.t1)) {
    st.nepotrivite.push(`${k}: proba fără cârpire km ${P0.km} ≠ ${c.km} (timp dublu ${dupTimp}) sau apropieri ${ids ? 'aceleași' : 'diferite'} sau capete diferite`); st.sarite++; continue; }
  if (ordine) st.ordineTimpEgal++;
  const M = [P[0]], goluri = []; let kmDrept = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], dt = (b.t - a.t) / 1000, d = hav(a, b);
    if (dt > T_DT && d > T_D && d / (dt / 3600) <= V_MAX) {
      st.goluri++; const r = await drum(a, b);
      if (r.eroare) { st.eroareValhalla++; goluri.push({ t0: iso(a.t), t1: iso(b.t), dt, dDrept: +d.toFixed(3), carpit: false, motiv: 'valhalla: ' + r.eroare }); M.push(b); continue; }
      if (r.km > 2 * d + 2) { st.ocol++; goluri.push({ t0: iso(a.t), t1: iso(b.t), dt, dDrept: +d.toFixed(3), kmDrum: r.km, carpit: false, motiv: 'ocol suspect (drum > 2 × dreapta + 2 km)' }); M.push(b); continue; }
      const sh = dec6(r.shape); const L = [a, ...sh, b]; let tot = 0; const part = [0]; for (let j = 1; j < L.length; j++) { tot += hav(L[j - 1], L[j]); part.push(tot); }
      for (let j = 0; j < sh.length; j++) M.push({ lat: sh[j].lat, lon: sh[j].lon, v: null, syn: true, t: new Date(a.t.getTime() + (b.t - a.t) * (tot ? part[j + 1] / tot : 0)) });
      M.push({ ...b, dupaGol: true });
      kmDrept += d < 5 ? d : 0; st.goluriCarpite++;
      goluri.push({ t0: iso(a.t), t1: iso(b.t), dt, dDrept: +d.toFixed(3), kmDrum: r.km, kmUrma: +tot.toFixed(3), carpit: true, iA: M.length - sh.length - 2 });
    } else M.push(b);
  }
  if (!goluri.some(x => x.carpit)) { c.kmCarpit = 0; c.goluri = goluri; continue; }
  const R = calcul(M);
  for (const x of goluri) if (x.carpit) { x.kmA = +R.cum[x.iA].toFixed(3); x.kmB = +(R.cum[x.iA] + x.kmUrma).toFixed(3); delete x.iA; }
  const kmCarpit = +goluri.filter(x => x.carpit).reduce((s, x) => s + x.kmUrma, 0).toFixed(2);
  c.kmVechi = c.km; c.km = +(c.km + kmCarpit - kmDrept).toFixed(2); if (ordine) c.ordineTimpEgal = dKm; c.apr = R.apr; c.opr = R.opr; c.kmCarpit = kmCarpit; c.carpit = true; c.goluri = goluri;
  c.steagCarpit = kmCarpit / c.km > STEAG;
  st.carpite++; st.kmCarpit += kmCarpit; st.kmDreptVechi += kmDrept; if (c.steagCarpit) st.steag++; st.aprCarpite += R.apr.filter(a => a.carpit).length;
  const pm = peMasina[c.m] ??= { curse: 0, goluri: 0, kmCarpit: 0, kmInainte: 0, kmDupa: 0, steag: 0 };
  pm.curse++; pm.goluri += goluri.filter(x => x.carpit).length; pm.kmCarpit += kmCarpit; pm.kmInainte += c.kmVechi; pm.kmDupa += c.km; if (c.steagCarpit) pm.steag++;
}
scrie(CACHE, JSON.stringify(VC));
for (const x of Object.values(peMasina)) for (const f of ['kmCarpit', 'kmInainte', 'kmDupa']) x[f] = +x[f].toFixed(1);
st.kmCarpit = +st.kmCarpit.toFixed(1); st.kmDreptVechi = +st.kmDreptVechi.toFixed(1);
D.carpire = { versiune: 'carpire v1 (ION-99)', prag: { T_DT, T_D, V_MAX }, steag: STEAG, statistica: { ...st, nepotrivite: st.nepotrivite.length } };
scrie(`${DIR}/curse-ideal.json`, JSON.stringify(D));
scrie(`${DIR}/carpire-raport.json`, JSON.stringify({ prag: { T_DT, T_D, V_MAX }, statistica: st, peMasina }, null, 1));
console.log(`cârpire: ${st.curse} curse cu gol · cârpite ${st.carpite} (deja ${st.dejaCarpite}, sărite la probă ${st.sarite}; refăcute cu ordinea timpului egal ${st.ordineTimpEgal}) · goluri ${st.goluri}, cârpite ${st.goluriCarpite}, ocol suspect ${st.ocol}, eroare Valhalla ${st.eroareValhalla}`);
console.log(`km cârpiți ${st.kmCarpit} (în locul a ${st.kmDreptVechi} km pe dreaptă numărați înainte) · curse cu > 30 % cârpit: ${st.steag} · apropieri de sat pe drum cârpit: ${st.aprCarpite}`);
if (st.nepotrivite.length) console.log('nepotrivite: ' + st.nepotrivite.slice(0, 10).join(' | '));
