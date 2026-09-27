// Drăxlmaier Bălți — cursele brute din GPS pentru SCHELETUL IDEAL (ION-71). Copie a cod/curse.mjs (ION-45) cu:
//  · fereastra FIXĂ 04.05–25.09.2026 fără 18.07–31.08 (Ion, 25.09: «100 zile fără august și fără ultimele 2 săptămâni din iulie»),
//    EXCLUS în SQL pe AMBELE interogări (porți: $3/$4; pe mașină: $4/$5), ca rândurile citite să rămână ~100 de zile;
//  · țintele cu ALIAS (Mihăileni, Fundurii Vechi…) de la extracție — la ION-45 le aducea apr-extra după;
//  · fiecare oprire are lat/lon (punctul cu viteza minimă), ca verif.mjs să potrivească satele pe coordonate;
//  · cursa se taie și la un gol de peste 2 h între puncte (nimic nu se lipește peste excludere);
//  · FLOTA se scrie o dată, de rularea completă; --doar=<mașini> citește FLOTA și înlocuiește doar mașinile date în OUT;
//    --flota-proba identifică flota în memorie fără să scrie FLOTA (proba pe o mașină înaintea rulării complete).
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import pg from 'pg';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
pg.types.setTypeParser(1114, v => new Date(v.replace(' ', 'T') + 'Z'));   // w_date e UTC fără fus (gps-worker.mjs:61)

const FROM = '2026-05-04', TO = '2026-09-26', EXCLUS = ['2026-07-18', '2026-09-01'];
const OUT = '../../date/ideal-v3/curse-ideal.json', FLOTA = '../../date/ideal-v3/flota-ideal.json', NOM = '../../date/ideal-v3/nomenclator.json';
const DOAR_ARG = process.argv.find(a => a.startsWith('--doar=')); const DOAR_M = DOAR_ARG ? new Set(DOAR_ARG.slice(7).split(',')) : null;
const FLOTA_PROBA = process.argv.includes('--flota-proba');
const PORTI = [{ n: 'EST', lat: 47.78513, lon: 27.94307, r: 0.6 }, { n: 'VEST', lat: 47.77408, lon: 27.91593, r: 0.5 }];
const R_SAT = 1.2, R_OPR = 0.8, V_OPRIRE = 8, V_LENT = 15, S_LENT = 20, MIN_ZILE = 15, MIN_VIZ_ZI = 2.3, GOL_H = 2;
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
const poarta = p => { for (const g of PORTI) if (hav(p, g) <= g.r) return g.n; return null; };
const cur = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ALIAS = { mihaileniivechi: 'mihaileni', dobrujaveche: 'dobrogeaveche', satmarculesti: 'marculesti', zorojeni: 'zarojeni',
  grigoreuca: 'grigorauca', ustea: 'ustia', iezarenivechi: 'iezareniivechi', garacatranic: 'catranic', funduriivechi: 'fundurivechi', fundurivechi: 'funduriivechi' };
const kk = s => { const k = cur(s); return [k, ALIAS[k]].filter(Boolean); };
const canon = s => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const ePlaca = p => /^\d{3}[A-Z]{2,4}$/.test(p) || /^[A-Z]{1,3}\d{3,4}$/.test(p);
const placaDev = d => { const a = canon(d.CarName), b = canon(d.RegNo); return ePlaca(a) ? a : (ePlaca(b) ? b : (a || b)); };
import { ziLocala, ziLucru, inceputZiLucru } from './timp.mjs';
// v3: limitele ferestrei = 03:00 locală a zilei (ziua de lucru), ca text UTC fără fus pentru w_date (vara = «z 00:00» UTC, ca în v2)
const Q = z => inceputZiLucru(z).toISOString().replace('T', ' ').replace('Z', '');
const ziL = t => ziLocala(t);   // v3: data locală prin Intl (v2: UTC + 3 fix); doar în jurnal

const N = JSON.parse(readFileSync(NOM, 'utf8'));
const places = loadPlaces('/root/lde-worker/places.geojsonseq');
const idx = buildPlacesIndex(places);
const nume = [...new Set(N.rute.flatMap(r => [...r.sate, ...r.sateDb, ...r.sateNume]))];
const vrem = new Set(nume.flatMap(kk));
const tinte = places.filter(p => vrem.has(cur(p.name)) && hav(p, PORTI[0]) < 120)
  .map(p => ({ n: p.name, k: cur(p.name), lat: p.lat, lon: p.lon, id: `${p.name}@${p.lat.toFixed(4)},${p.lon.toFixed(4)}` }));
const areLoc = new Set(tinte.map(t => t.k));
const lipsaNume = [...new Set(nume.filter(n => !kk(n).some(k => areLoc.has(k))))];
console.log(`ținte: ${tinte.length} locuri pentru ${nume.length} nume (${vrem.size} forme cu alias) · nume fără loc în index: ${lipsaNume.join(', ') || '—'}`);

const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: devs } = await t.query(`SELECT id,"CarName","RegNo" FROM devices WHERE active=true`);
for (const d of devs) d.placa = placaDev(d);
{ const vaz = new Map(); for (const d of devs) { if (vaz.has(d.placa)) { d.placa = `${d.placa}#${d.id}`; } else vaz.set(d.placa, d.id); } }
if (DOAR_M) for (const d of devs) if (DOAR_M.has(d.placa.split('#')[0])) console.log(`  doar: id ${d.id} CarName «${d.CarName}» RegNo «${d.RegNo}» → ${d.placa}`);

let flota;
if (DOAR_M && !FLOTA_PROBA) {
  if (!existsSync(FLOTA)) { console.error(`FLOTA lipsește (${FLOTA}): rulează întâi extragerea completă, sau proba cu --flota-proba`); process.exit(2); }
  const F = JSON.parse(readFileSync(FLOTA, 'utf8'));
  const lipsa = [...DOAR_M].filter(m => !F.some(d => d.placa.split('#')[0] === m));
  if (lipsa.length) { console.error(`mașini absente din FLOTA: ${lipsa.join(', ')} — oprire`); process.exit(2); }
  flota = F.filter(d => DOAR_M.has(d.placa.split('#')[0]));
  console.log(`${flota.length} mașini din FLOTA (${F.length} în total)`);
} else {
  // zilele și vizitele la porți, din punctele din dreptunghiul porților; EXCLUS în SQL ($3/$4)
  const { rows: gp } = await t.query(
    `SELECT id, w_date, x, y FROM track WHERE w_date>=$1 AND w_date<$2 AND NOT (w_date>=$3 AND w_date<$4) AND x BETWEEN 4745.5 AND 4748.0 AND y BETWEEN 2754.0 AND 2757.5 ORDER BY id, w_date`, [Q(FROM), Q(TO), Q(EXCLUS[0]), Q(EXCLUS[1])]);
  const stat = new Map();
  for (const r of gp) {
    const p = { lat: nmea(+r.x), lon: nmea(+r.y) }; if (!poarta(p)) continue;
    if (!stat.has(r.id)) stat.set(r.id, { zile: new Set(), viz: 0, ult: 0 });
    const s = stat.get(r.id), ms = r.w_date.getTime();
    s.zile.add(ziLucru(ms));   // v3: ziua de lucru 03:00 → 03:00 locală (v2: data UTC a lui t − 3 h = 06:00 → 06:00 EEST, eroare)
    if (ms - s.ult > 20 * 60000) s.viz++; s.ult = ms;
  }
  const LISTA = existsSync('/root/lde-worker/drax-placi.txt') ? new Set(readFileSync('/root/lde-worker/drax-placi.txt', 'utf8').split('\n').map(canon).filter(Boolean)) : new Set();
  const dinNom = new Set(N.rute.flatMap(r => Object.values(r.masini || {}).flat().map(canon)));
  flota = []; const respinse = [];
  for (const d of devs) {
    const s = stat.get(d.id); const zile = s ? s.zile.size : 0, vz = s ? s.viz / Math.max(1, zile) : 0;
    const motiv = dinNom.has(d.placa) ? 'grafic' : LISTA.has(d.placa) ? 'lista 22.09' : (zile >= MIN_ZILE && vz >= MIN_VIZ_ZI) ? 'semnătură' : null;
    if (motiv && zile >= 5) flota.push({ id: d.id, CarName: d.CarName, RegNo: d.RegNo, placa: d.placa, zile, vz: +vz.toFixed(2), motiv });
    else if (zile >= MIN_ZILE) respinse.push(`${d.placa} ${zile}z ${vz.toFixed(2)}viz/zi`);
  }
  const lipsa = [...dinNom].filter(m => !devs.some(d => d.placa === m));
  console.log(`${flota.length} mașini · ${FROM} → ${TO} fără ${EXCLUS[0]}–${EXCLUS[1]} · din grafic lipsesc în tracker: ${lipsa.join(', ') || '—'}`);
  console.log(`respinse (≥${MIN_ZILE} zile la poartă, dar tranzit): ${respinse.join('  ') || '—'}`);
  if (!DOAR_M) { scrieAtomic(FLOTA, JSON.stringify(flota, null, 1)); console.log(`FLOTA scrisă: ${FLOTA} (${flota.length} mașini)`); }
  else flota = flota.filter(d => DOAR_M.has(d.placa.split('#')[0]));
}

const curse = [], zilePoarta = {};
for (const d of flota) {
  const { rows } = await t.query(
    `SELECT w_date,x,y,speed FROM track WHERE id=$1 AND w_date>=$2 AND w_date<$3 AND NOT (w_date>=$4 AND w_date<$5) ORDER BY w_date`, [d.id, Q(FROM), Q(TO), Q(EXCLUS[0]), Q(EXCLUS[1])]);
  zilePoarta[d.placa] = { zile: d.zile, vizPeZi: d.vz, motiv: d.motiv };
  if (rows.length < 300) { console.log(`  ${d.placa}: ${rows.length} puncte, sar`); continue; }
  const P = rows.map(r => ({ lat: nmea(Number(r.x)), lon: nmea(Number(r.y)), v: Number(r.speed) * 1.852, t: r.w_date }))
    .filter(p => p.lat > 45 && p.lat < 49 && p.lon > 26 && p.lon < 31);
  let c = null, odihna = null; const gata = [];
  const inchide = (spre, g) => { if (c && c.pts.length > 5) { c.spreP = spre; c.pOut = g; gata.push(c); } c = null; };
  for (let i = 1; i < P.length; i++) {
    // gol de peste 2 h între puncte: cursa de dinainte se închide fără poartă, nimic nu se lipește peste gol (PRIMUL test)
    if (P[i].t - P[i - 1].t > GOL_H * 3600000) { inchide(false, null); odihna = null; }
    const g = poarta(P[i]);
    if (g) { inchide(true, g); c = { pts: [], dinP: true, pIn: g, tP: P[i].t }; odihna = null; continue; }
    if (P[i].v < 4) { if (odihna === null) odihna = i; }
    else { if (odihna !== null) { if ((P[i].t - P[odihna].t) / 60000 > 25) {
        inchide(false, null); c = { pts: [], dinP: false, pIn: null }; } odihna = null; } }
    if (!c) c = { pts: [], dinP: false, pIn: null };
    c.pts.push(P[i]);
  }
  inchide(false, null);
  let n = 0;
  for (const s of gata) {
    const pts = s.pts; let km = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { const dk = hav(pts[i - 1], pts[i]); if (dk < 5) km += dk; cum.push(km); }
    if (km < 1) continue;
    const apr = [];
    for (const g of tinte) {
      let run = null;
      for (let i = 0; i < pts.length; i++) {
        const dd = hav(pts[i], g);
        if (dd <= R_SAT) { if (!run || dd < run.d) run = { ...(run || { i0: i }), d: dd, i }; }
        else if (run) { apr.push({ id: g.id, k: g.k, km: +cum[run.i].toFixed(2), d: +run.d.toFixed(2), t: pts[run.i].t }); run = null; }
      }
      if (run) apr.push({ id: g.id, k: g.k, km: +cum[run.i].toFixed(2), d: +run.d.toFixed(2), t: pts[run.i].t });
    }
    apr.sort((a, b) => a.km - b.km);
    const opr = []; let v = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], nn = idx.nearestWithin(p, R_OPR);
      if (!nn) { if (v) { opr.push(v); v = null; } continue; }
      if (!v || v.n !== nn.name) { if (v) opr.push(v); v = { n: nn.name, vmin: p.v, sl: 0, tp: p.t, km: cum[i], lat: p.lat, lon: p.lon }; }
      else { if (p.v < v.vmin) { v.vmin = p.v; v.lat = p.lat; v.lon = p.lon; v.km = cum[i]; }
        const dt = Math.min((p.t - v.tp) / 1000, 120); if (p.v < V_LENT) v.sl += dt; v.tp = p.t; }
    }
    if (v) opr.push(v);
    const a = pts[0], b = pts[pts.length - 1];
    curse.push({ m: d.placa, dev: d.id, dispozitiv: d.id, t0: a.t, t1: b.t, dinP: s.dinP, spreP: s.spreP, pIn: s.pIn, pOut: s.pOut, km: +km.toFixed(2),
      a: [+a.lat.toFixed(5), +a.lon.toFixed(5)], b: [+b.lat.toFixed(5), +b.lon.toFixed(5)],
      apr, opr: opr.filter(x => x.vmin < V_OPRIRE && x.sl >= S_LENT).map(x => ({ n: x.n, km: +x.km.toFixed(1), lat: +x.lat.toFixed(5), lon: +x.lon.toFixed(5) })) });
    n++;
  }
  const zile = [...new Set(P.map(p => ziL(p.t)))].sort();
  const zMI = zile.filter(z => z < EXCLUS[0]).length, zS = zile.filter(z => z >= EXCLUS[1]).length, zEx = zile.filter(z => z >= EXCLUS[0] && z < EXCLUS[1]).length;
  console.log(`  ${d.placa.padEnd(18)} ${String(d.zile).padStart(3)} zile la poartă · ${d.vz} viz/zi · ${d.motiv.padEnd(11)} · ${n} curse · GPS ${zile[0]} → ${zile[zile.length - 1]} · zile mai–iul ${zMI} · sept ${zS}${zEx ? ' · ÎN EXCLUDERE ' + zEx : ''}`);
}
await t.end();
const peste = curse.filter(c => new Date(c.t0) < new Date(EXCLUS[0]) && new Date(c.t1) >= new Date(EXCLUS[1])).length;
console.log(`curse peste excludere: ${peste}`);
if (DOAR_M) {
  const V = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { curse: [], zilePoarta: {} };
  const scoase = new Set([...DOAR_M, ...flota.map(d => d.placa)]);
  const ramase = V.curse.filter(c => !scoase.has(c.m)); for (const m of scoase) delete V.zilePoarta[m];
  console.log(`înlocuite: ${V.curse.length - ramase.length} curse vechi ale ${[...scoase].join(', ')}`);
  scrieAtomic(OUT, JSON.stringify({ tinte, curse: [...ramase, ...curse], zilePoarta: { ...V.zilePoarta, ...zilePoarta }, FROM, TO, EXCLUS }));
} else scrieAtomic(OUT, JSON.stringify({ tinte, curse, zilePoarta, FROM, TO, EXCLUS }));
console.log(`curse: ${curse.length}`);
