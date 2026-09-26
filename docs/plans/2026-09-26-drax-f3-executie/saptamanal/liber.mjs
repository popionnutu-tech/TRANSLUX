// Drăxlmaier F3 (v2) — timpul liber și brambura (§11) cu modulul comun extins, cu PRIORITATEA F2 (triaj r1, B1/B2/B3).
// Doar citire (tracker + Supabase); scrie doar --out.
//   node --env-file=/root/lde-worker/.env liber.mjs --saptamina 2026-09-14 --dir <ECON_D> [--zona 1] [--fara-f2] [--out f.json]
//
// Un km, un singur loc (B1; F3 r3): categoriile F2 (economie-zile.json) au prioritate. Un pas GPS al modulului poate intra în liber /
// brambura / neclar / navetă / reparație / altă uzină DOAR dacă mijlocul lui cade (în timp) într-o bucată F2 «deplasare» sau
// «necunoscut» (în bucățile amestecate, până la km-ii acestora și doar în afara zonei uzinei), sau într-o zi fără F2 a mașinii (zi fără
// curse și fără poartă). Nelămuritul din intervalul perechii NU e buget pentru §11 (F2 §8.3, B16). Tot restul (cu oameni, livrare —
// inclusiv drumul de la / spre locul nopții, regula Briceni 26.09 «seara spre casă nu e brambura» —, gol pe rută, gol între ture, parc,
// service, legătură) = «explicat de F2». Brambura se recalculează pe pașii rămași (celula ~500 m trecută în ≥ 2 zile = obișnuit;
// ≥ 5 km pe cursă) și se repartizează pe zile după pașii ei, și în rezumatul modulului (ctx.bramburaPePasi, C2).
// Flota = mașinile rândului (economie.json → masini, B3); casa = casa săptămânii din același economie.json (întrebarea 6);
// casa null → fără alarmă, steag pe rând.
import pg from 'pg';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';
import { local, ziLucru } from '/root/lde-worker/ora-locala.mjs';
import { placaDev, nmea, hav } from '../economie/comun.mjs';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const t0 = Date.now();
const LUNI = arg('--saptamina'); if (!/^\d{4}-\d{2}-\d{2}$/.test(LUNI || '')) { console.error('--saptamina YYYY-MM-DD (lunea)'); process.exit(2); }
const DIR = arg('--dir'); if (!DIR) { console.error('--dir <ECON_D>'); process.exit(2); }
const ZONA = +(arg('--zona', '1')), FARA_F2 = process.argv.includes('--fara-f2');
// Modulul LIVRAT (triaj r2, S-N2): același fișier pe care îl folosesc LEAR și SEBN, copiat din repo lde-geo-worker/ pe VPS.
// Import FIX (execuție ION-94): fără variabilă de mediu care să-l înlocuiască.
const MODUL = '/root/lde-worker/lear-timp-liber.mjs';
const J = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const VIZ = J('economie-vizite.json'), ECON = J('economie.json'), ZILE = J('economie-zile.json');
const M = await import(MODUL);
if (!M.portiDin) { console.error(`${MODUL}: modulul nu e cel extins (lipsește portiDin) — livrează lear-timp-liber.mjs din repo`); process.exit(1); }
const { curseCuOpriri, eticheteaza, rezumaSaptamina, kmPas, PRAGURI } = M;

const zi = (z, k) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const DUM = zi(LUNI, 6), de_la = zi(LUNI, -1), pana_la = zi(LUNI, 8);
const inSapt = (z) => z >= LUNI && z <= DUM;
const sfarsitDate = Math.min(Date.now(), +new Date(pana_la + 'T00:00:00Z'));
const ALIAS_M = { '0357544371228442': '880RNK', '350KAJ#2284': '350KAJ' };
const numeM = (m) => ALIAS_M[m] ?? m;

const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY, H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rest = async (p) => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
// Instantaneul săptămânii (triaj F3 r3, risc 3): prima rulare citește baza și scrie instantaneu-liber.json în dosarul săptămânii;
// orice rerulare îl recitește, ca aceeași săptămână să dea același rezultat și după ce porțile / ferestrele se schimbă.
const INST = `${DIR}/instantaneu-liber.json`;
const inst = existsSync(INST) ? JSON.parse(readFileSync(INST, 'utf8')) : null;
const [fer, uz, gates, veh] = inst ? [inst.fer, inst.uz, inst.gates, inst.veh] : await Promise.all([
  rest('lde_uzina_ferestre_ceas?select=sens,shift_number,de_la_min,pana_la_min&uzina_id=eq.DRAXELMAIER_BALTI'),
  rest('lde_uzine?select=works_saturday,works_sunday&id=eq.DRAXELMAIER_BALTI'),
  rest('lde_uzine_gates?select=uzina_id,label,lat,lon,radius_km&active=eq.true'),
  rest('vehicles?select=id,plate_number&limit=5000')]);
if (fer.length !== 4) { console.error(`ferestre DRAXELMAIER_BALTI: ${fer.length} ≠ 4`); process.exit(1); }
const PORTI = gates.filter((g) => g.uzina_id === 'DRAXELMAIER_BALTI').map((g) => ({ lat: +g.lat, lon: +g.lon, n: g.label }));
if (PORTI.length !== 2) { console.error(`porți DRAXELMAIER_BALTI: ${PORTI.length} ≠ 2 (EST + VEST)`); process.exit(1); }
const alteUzine = gates.filter((g) => g.uzina_id !== 'DRAXELMAIER_BALTI').map((g) => ({ lat: +g.lat, lon: +g.lon, r: +g.radius_km || 0.5, nume: `${g.uzina_id.replace(/_/g, ' ')} (${g.label})` }));
const PARC = { lat: 47.770, lon: 27.9235 };
const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const idVeh = new Map(veh.map((v) => [norm(v.plate_number), v.id]));
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const numeLoc = (p) => idx.nearestWithin(p, 3.8)?.name ?? null;
const DL = existsSync(new URL('./de-lamurit.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('./de-lamurit.json', import.meta.url), 'utf8')) : [];
const dowZi = (z) => { const d = new Date(z + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
const deLamurit = (m, z) => DL.some((x) => x.m === m && ((x.alarma?.zile ?? []).includes(z) || (x.alarma?.dow ?? []).includes(dowZi(z))));
const inZona = (p) => hav(p, PARC) <= 3 || PORTI.some((g) => hav(p, g) <= 3);   // zona uzinei F2 (§5.4)

// ---- flota = rândul (B3)
const RAND = new Map(ECON.masini.map((m) => [m.m, m]));
const capete = new Map();
for (const d of ZILE.zile) if (inSapt(d.z)) for (const l of d.linii) { const c = ZILE.linii[l]?.capatC; if (c) (capete.get(d.m) ?? capete.set(d.m, new Map()).get(d.m)).set(l, c); }

// ---- bucățile F2 pe mașină, grupate pe interval de timp: { t0, t1, buget } (buget = km pe care §11 îi poate folosi)
const LIBERE = new Set(['deplasare', 'necunoscut']);
const bucF2 = new Map();
for (const d of ZILE.zile) {
  const g = new Map();
  for (const s of d.seg) { const k = `${s.t0}|${s.t1}`; const x = g.get(k) ?? g.set(k, { t0: s.t0, t1: s.t1, buget: 0, toateLibere: true, cat: [] }).get(k);
    x.cat.push(s.cat); if (LIBERE.has(s.cat)) x.buget += s.km; else x.toateLibere = false; }
  // triaj F3 r3 (Codex, risc 1): nelămuritul din intervalul perechii NU e buget pentru §11 (F2 §8.3 «se arată separat», B16 «nu alarmă»)
  const L = bucF2.get(d.m) ?? bucF2.set(d.m, []).get(d.m);
  for (const x of g.values()) L.push({ ...x, buget: x.toateLibere ? Infinity : x.buget });
}
for (const L of bucF2.values()) L.sort((a, b) => a.t0 - b.t0);
const cauta = (L, t) => { let lo = 0, hi = L.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].t1 < t) lo = m + 1; else if (L[m].t0 > t) hi = m - 1; else return L[m]; } return null; };

// ---- urmele
// Codex C3 (F3 r4): urmele §11 și asocierea mașină → dispozitiv se iau din tracker DOAR la prima rulare a săptămânii și se păstrează în
// urme-liber.json.gz (dosarul săptămânii); orice rerulare le recitește de acolo, fără tracker (dispozitiv dezactivat, tracker căzut).
const URME = `${DIR}/urme-liber.json.gz`;
const puncte = new Map();
if (existsSync(URME)) {
  const u = JSON.parse(gunzipSync(readFileSync(URME)).toString('utf8'));
  for (const [m, x] of Object.entries(u.masini)) puncte.set(m, { dev: x.dev, pts: x.pts.map(([tt, lat, lon, v]) => ({ lat, lon, t: new Date(tt), v })) });
} else {
  const t = new pg.Client({ host: process.env.TRACKER_HOST, port: +(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER,
    password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
  await t.connect();
  const { rows: devs } = await t.query(`SELECT id,"CarName","RegNo" FROM devices WHERE active=true`);
  for (const d of devs) d.placa = placaDev(d);
  { const vaz = new Map(); for (const d of devs) { if (vaz.has(d.placa)) d.placa = `${d.placa}#${d.id}`; else vaz.set(d.placa, d.id); } }
  const W = Object.keys(VIZ.flota).find((w) => VIZ.flota[w]?.length) ?? null;
  const devDe = new Map(); for (const pl of VIZ.flota[W] ?? []) (devDe.get(numeM(pl)) ?? devDe.set(numeM(pl), []).get(numeM(pl))).push(pl);
  for (const m of RAND.keys()) {
    for (const pl of devDe.get(m) ?? [m]) {
      const ids = devs.filter((d) => d.placa === pl).map((d) => d.id); if (!ids.length) continue;
      const { rows } = await t.query(`SELECT w_date,x,y,speed FROM track WHERE id = ANY($1) AND w_date>=$2 AND w_date<$3 AND x < 9000 AND y < 9000 ORDER BY w_date`, [ids, de_la, pana_la]);
      const pts = rows.map((r) => ({ lat: nmea(+r.x), lon: nmea(+r.y), t: new Date(r.w_date), v: Number(r.speed) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat > 45.3 && p.lat < 48.7 && p.lon > 26.4 && p.lon < 30.3);
      const cur = puncte.get(m); if (!cur || pts.length > cur.pts.length) puncte.set(m, { dev: pl, pts });
    }
  }
  await t.end();
  writeFileSync(URME + '.tmp', gzipSync(JSON.stringify({ scris: new Date().toISOString(), de_la, pana_la,
    masini: Object.fromEntries([...puncte].map(([m, x]) => [m, { dev: x.dev, pts: x.pts.map((p) => [+p.t, p.lat, p.lon, p.v]) }])) })));
  renameSync(URME + '.tmp', URME);
}
const tTracker = (Date.now() - t0) / 1000;

const alim = new Map();
const alimRows = inst?.alim ?? [];
if (!inst) { const ids = [...RAND.keys()].map((m) => idVeh.get(norm(m))).filter(Boolean);
  if (ids.length) alimRows.push(...await rest(`lde_fuel_alimentari?select=vehicle_id,alimentat_at&vehicle_id=in.(${ids.join(',')})&alimentat_at=gte.${de_la}T00:00:00Z&alimentat_at=lte.${pana_la}T23:59:59Z&limit=5000`));
  writeFileSync(INST + '.tmp', JSON.stringify({ scris: new Date().toISOString(), fer, uz, gates, veh, alim: alimRows })); renameSync(INST + '.tmp', INST); }
for (const r of alimRows) (alim.get(r.vehicle_id) ?? alim.set(r.vehicle_id, []).get(r.vehicle_id)).push({ t: new Date(r.alimentat_at) });

const P = { ...PRAGURI };
const cheie = (p) => `${Math.floor(p.lat / 0.005)}|${Math.floor(p.lon / 0.005)}`;   // = lear-timp-liber.mjs (brambura)
const masini = [], faraUrma = [];
const P10 = { masini: 0, pica: [], picaC: [], pasi: {}, suprapusInainte: { liber: 0, brambura: 0 } };
for (const [m, R] of RAND) {
  const u = puncte.get(m);
  if (!u || u.pts.length < 50) { faraUrma.push(m); masini.push({ masina: m, liber: null, steag: 'fără urmă în tracker' }); continue; }
  const { pts } = u, c = R.casa;
  const ctx = { porti: PORTI, parc: PARC,
    casaC: c ? { lat: c.lat, lon: c.lon } : null, ferestre: fer, lucreazaSambata: !!uz[0]?.works_saturday, lucreazaDuminica: !!uz[0]?.works_sunday,
    local, ziLucru, inSapt, sfarsitDate, alimentari: alim.get(idVeh.get(norm(m))) ?? [], numeLoc, alteUzine,
    capeteRute: [...(capete.get(m)?.values() ?? [])].map((q) => (Array.isArray(q) ? { lat: q[0], lon: q[1] } : { lat: q.lat, lon: q.lon })),
    praguri: { R_PARC: 0.5, R_PARC_ZONA: ZONA }, ancoraBateParcul: true, schimb3: false, reparatieDoarFaraCurse: true, bramburaPePasi: true };
  let kmZi = 0; for (let i = 1; i < pts.length; i++) if (inSapt(ziLucru(pts[i].t))) kmZi += kmPas(pts[i - 1], pts[i], P.SALT_KM);
  const curse = curseCuOpriri(pts, ctx), et = eticheteaza(curse, ctx);
  const brut = rezumaSaptamina(et, ctx, kmZi);
  // obișnuința săptămânii (aceeași regulă ca modulul, pe etichetele finale «muncă»)
  const zileCel = new Map();
  for (const e of et) if (e.eticheta === 'muncă' && !e.cursa.gol) for (const p of e.cursa.pts) { const k = cheie(p); if (!zileCel.has(k)) zileCel.set(k, new Set()); zileCel.get(k).add(ziLucru(p.t)); }
  const obisnuit = (p) => (zileCel.get(cheie(p))?.size ?? 0) >= P.BRAMBURA_ZILE;
  // prioritatea F2: pas cu pas
  const L = bucF2.get(m) ?? []; const folosit = new Map();
  const zileF2m = new Set(ZILE.zile.filter((d) => d.m === m).map((d) => d.z));
  // --fara-f2 (diagnostic, «înainte»): pasul se clasifică la fel, dar rămâne mereu în §11 — P10c arată atunci suprapunerile
  const clasa = (a, b) => { const r = clasa0(a, b); return FARA_F2 ? { ok: true, cheie: r.cheie } : r; };
  const clasa0 = (a, b) => {  // { ok: pasul poate intra în §11, cheie: unde cade în F2 } — pentru P10c
    const tm = (+a.t + +b.t) / 2, g = cauta(L, tm);
    if (deLamurit(m, ziLucru(new Date(tm)))) return { ok: false, cheie: 'de lămurit' };
    if (!g) return { ok: true, cheie: zileF2m.has(ziLucru(new Date(tm))) ? 'gol în zi F2' : 'zi fără F2' };
    const cat = [...new Set(g.cat)].sort().join('+');
    if (g.buget === Infinity) return { ok: true, cheie: cat };
    if (g.buget <= 0) return { ok: false, cheie: cat };
    if (inZona({ lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 })) return { ok: false, cheie: cat };
    const u2 = folosit.get(g) ?? 0, d = kmPas(a, b, P.SALT_KM); if (u2 + d > g.buget + 1e-9) return { ok: false, cheie: cat };
    folosit.set(g, u2 + d); return { ok: true, cheie: `buget(${cat})` }; };
  const nou = [];
  let explicat = 0, kmDeLamurit = 0; const p10c = new Map();
  const PERMIS = (k) => k === 'de lămurit' || k === 'zi fără F2' || k === 'gol în zi F2' || k.startsWith('buget(') || /^(deplasare|necunoscut)(\+(deplasare|necunoscut))*$/.test(k);
  for (const e of et) {
    const cu = e.cursa;
    // triaj r2 (B-N1, B-N3): și «reparație» și «altă uzină» trec prin prioritatea F2
    // golul de semnal cu deplasare («neclar», km nevăzuți): trece și el prin prioritatea F2, după mijlocul lui în timp (763LYY 10.09:
    // un gol fără poartă mutat de modul la «altă uzină» făcea P10 pe sume să pice, deși P10c pe pași trecea)
    if (cu.gol) { const { ok, cheie } = clasa({ ...cu.p0, t: cu.de_la }, { ...cu.p1, t: cu.pana_la }); const z = ziLucru(cu.de_la);
      if (ok) { if (inSapt(z)) p10c.set(`neclar (gol) ← ${cheie}`, (p10c.get(`neclar (gol) ← ${cheie}`) ?? 0) + cu.km); nou.push({ ...e, i: nou.length }); }
      else { if (inSapt(z)) explicat += cu.km; nou.push({ ...e, i: nou.length, eticheta: 'muncă', motiv: `gol de semnal explicat de F2 (${cu.km.toFixed(1)} km)` }); }
      continue; }
    if (!['liber', 'neclar', 'navetă', 'muncă', 'reparație', 'altă uzină'].includes(e.eticheta)) { nou.push({ ...e, i: nou.length }); continue; }
    const kmTin = new Map(), kmExp = new Map(); let br = 0; const brPasi = new Map(); const okInt = [];
    for (let i = 1; i < cu.pts.length; i++) {
      const a = cu.pts[i - 1], b = cu.pts[i], d = kmPas(a, b, P.SALT_KM); if (!d) continue;
      const z = ziLucru(b.t), { ok, cheie } = clasa(a, b), neobisnuit = !obisnuit(a) && !obisnuit(b);
      (ok ? kmTin : kmExp).set(z, ((ok ? kmTin : kmExp).get(z) ?? 0) + d);
      if (ok) okInt.push([+a.t, +b.t]);
      if (ok && e.eticheta === 'muncă' && neobisnuit) { br += d; brPasi.set(z, (brPasi.get(z) ?? 0) + d); }
      // P10c: pașii care rămân în §11 (orice etichetă ≠ muncă, plus pașii de brambura) — unde cad în F2
      if (ok && inSapt(z) && (e.eticheta !== 'muncă' || neobisnuit)) { const k = `${e.eticheta === 'muncă' ? 'brambura?' : e.eticheta} ← ${cheie}`; p10c.set(k, (p10c.get(k) ?? 0) + d); }
    }
    // brambura: niciodată pe cursele care ating poarta în orele schimbului (LEAR 11.2), ≥ 5 km pe cursă pe pașii rămași
    const brFinal = e.eticheta === 'muncă' && !(e.ancora || cu.atingeriPoarta.length) && br >= P.BRAMBURA_MIN_KM ? +br.toFixed(1) : 0;
    const sumTin = [...kmTin.values()].reduce((a, x) => a + x, 0), sumExp = [...kmExp.values()].reduce((a, x) => a + x, 0);
    const sapt = (mp) => [...mp].filter(([z]) => inSapt(z)).reduce((a, [, x]) => a + x, 0);
    if (e.eticheta !== 'muncă') explicat += sapt(kmExp);
    for (let i = 1; i < cu.pts.length; i++) { const a = cu.pts[i - 1], b = cu.pts[i], z = ziLucru(b.t); if (inSapt(z) && deLamurit(m, z)) kmDeLamurit += kmPas(a, b, P.SALT_KM); }
    if (sumExp > 0) nou.push({ ...e, i: nou.length, eticheta: 'muncă', km_brambura: 0, bramburaPeZi: null, km_alimentare: 0, motiv: `explicat de F2 (${(sumExp).toFixed(1)} km)`, ancora: null,
      cursa: { ...cu, kmPeZi: kmExp, km: sumExp } });
    // B-N5: alimentarea rămâne doar dacă ora ei cade într-un pas păstrat
    const alimOk = !e.km_alimentare || (ctx.alimentari || []).some((al) => +al.t >= +cu.de_la - 20 * 60e3 && +al.t <= +cu.pana_la + 20 * 60e3 && okInt.some(([x, y]) => +al.t >= x - 20 * 60e3 && +al.t <= y + 20 * 60e3));
    if (sumTin > 0) nou.push({ ...e, i: nou.length, km_brambura: e.eticheta === 'muncă' ? brFinal : e.km_brambura, bramburaPeZi: e.eticheta === 'muncă' && brFinal ? brPasi : null, km_alimentare: alimOk ? e.km_alimentare : 0, cursa: { ...cu, kmPeZi: kmTin, km: sumTin } });
    else if (e.ancora && sumExp > 0) nou[nou.length - 1].ancora = e.ancora;   // ancora rămâne pe bucata «explicat» (vecinii din ieșiri)
  }
  const liberF2 = rezumaSaptamina(nou, ctx, kmZi);
  // casa necunoscută → fără alarmă (B3)
  const steaguri = [];
  if (!ctx.casaC) { liberF2.peste_prag = false; liberF2.peste_prag_brambura = false; steaguri.push('casa necunoscută — fără alarmă'); }
  // independent: suma §11 ≤ km-ii F2 permiși + km-ii din afara zilelor F2 (pe mașină, săptămâna)
  const kmPermisF2 = ZILE.zile.filter((d) => d.m === m && inSapt(d.z)).reduce((a, d) => a + (d.km.deplasare ?? 0) + (d.km.necunoscut ?? 0), 0);
  const zileF2 = new Set(ZILE.zile.filter((d) => d.m === m).map((d) => d.z));
  let kmAfaraF2 = 0; for (let i = 1; i < pts.length; i++) { const z = ziLucru(pts[i].t); if (inSapt(z) && !zileF2.has(z)) kmAfaraF2 += kmPas(pts[i - 1], pts[i], P.SALT_KM); }
  // km nevăzuți (golurile de semnal, salt ≥ 5 km) nu sunt nici în urmă, nici în F2 (bucata aruncă saltul): ies din suma P10
  // P10 pe TOATE categoriile modulului din afara muncii (triaj F3 r3, risc 2): liber (+ alimentarea scăzută din el), brambura, neclar,
  // navetă, reparație, altă uzină; km-ii nevăzuți ai golurilor de semnal (salt ≥ 5 km) nu sunt nici în urmă, nici în F2 → se scad o dată
  const s11 = liberF2.km + liberF2.km_alimentare + liberF2.km_brambura + liberF2.km_neclar + liberF2.km_naveta + liberF2.km_reparatie + liberF2.km_alta_uzina - (liberF2.km_nevazut ?? 0);
  const f2Rest = ZILE.zile.filter((d) => d.m === m && inSapt(d.z)).reduce((a, d) => a + d.total - (d.km.deplasare ?? 0) - (d.km.necunoscut ?? 0), 0);
  const okA = s11 <= kmPermisF2 + kmAfaraF2 + 1;           // ce e în §11 încape în ce F2 a lăsat liber
  const okB = f2Rest + s11 <= kmZi * 1.03 + 1;             // un km, un loc: F2 fără km-ii lăsați + §11 ≤ urma săptămânii
  P10.suprapusInainte.liber += brut.km - liberF2.km; P10.suprapusInainte.brambura += brut.km_brambura - liberF2.km_brambura;
  // P10c (B-N3): pe pași — orice km rămas în §11 cade doar în {zi fără F2, deplasare, necunoscut, bugetul nelămurit}; «gol în zi F2» < 2 km/săpt.
  const c10 = Object.fromEntries([...p10c].map(([k, v]) => [k, +v.toFixed(1)]));
  const rau = [...p10c].filter(([k]) => !PERMIS(k.split(' ← ')[1])), gol = [...p10c].filter(([k]) => k.endsWith('← gol în zi F2')).reduce((a, [, v]) => a + v, 0);
  const okC = !rau.length && gol < 2;
  for (const [k, v] of p10c) P10.pasi[k] = +((P10.pasi[k] ?? 0) + v).toFixed(1);
  if (!okC) P10.picaC.push({ m, rau: Object.fromEntries(rau.map(([k, v]) => [k, +v.toFixed(1)])), golZiF2: +gol.toFixed(1) });
  P10.masini++; if (!okA || !okB) P10.pica.push({ m, s11: +s11.toFixed(1), permis: +(kmPermisF2 + kmAfaraF2).toFixed(1), f2Rest: +f2Rest.toFixed(1), urma: +kmZi.toFixed(1) });
  masini.push({ masina: m, dev: u.dev, puncte: pts.length, casa_km_poarta: c?.kmPoarta ?? null, liber: liberF2,
    brut: { km: brut.km, km_brambura: brut.km_brambura, km_neclar: brut.km_neclar, km_reparatie: brut.km_reparatie },
    km_explicat_f2: +explicat.toFixed(1), steaguri, bramburaPeZi: liberF2.brambura_pe_zi ?? {}, km_de_lamurit: +kmDeLamurit.toFixed(1), p10c: c10, p10: { s11: +s11.toFixed(1), permis: +(kmPermisF2 + kmAfaraF2).toFixed(1), f2Rest: +f2Rest.toFixed(1), urma: +kmZi.toFixed(1) } });
}
const cu = masini.filter((m) => m.liber);
const S_ = (f) => +cu.reduce((s, m) => s + Math.max(0, f(m) || 0), 0).toFixed(1);
const timp_liber = { prag_km: P.PRAG_ALARMA_KM, km_total: S_((m) => m.liber.km), masini_peste_prag: cu.filter((m) => m.liber.peste_prag).map((m) => m.masina),
  km_brambura_total: S_((m) => m.liber.km_brambura), prag_brambura_km: P.PRAG_ALARMA_BRAMBURA_KM,
  masini_peste_prag_brambura: cu.filter((m) => m.liber.peste_prag_brambura).map((m) => m.masina),
  km_neclar_total: S_((m) => m.liber.km_neclar), km_reparatie_total: S_((m) => m.liber.km_reparatie), km_explicat_f2: S_((m) => m.km_explicat_f2),
  brut: { km: S_((m) => m.brut.km), km_brambura: S_((m) => m.brut.km_brambura), km_neclar: S_((m) => m.brut.km_neclar) },
  km_alta_uzina_total: S_((m) => m.liber.km_alta_uzina), R_PARC_ZONA: ZONA, modul: MODUL, prioritateF2: !FARA_F2, faraUrma,
  ferestre: fer, zile_lucru: { sambata: !!uz[0]?.works_saturday, duminica: !!uz[0]?.works_sunday } };
// invariantul B3: totalul = Σ rândurilor
const sumaBr = +cu.reduce((s, m) => s + m.liber.km_brambura, 0).toFixed(1);
if (Math.abs(sumaBr - timp_liber.km_brambura_total) > 0.2) { console.error(`invariant: Σ brambura ${sumaBr} ≠ total ${timp_liber.km_brambura_total}`); process.exit(1); }
const out = { uzina: 'DRAXELMAIER', saptamina: LUNI, pana_la: DUM, timp_liber, masini, p10: P10, durata: { tracker_s: +tTracker.toFixed(1), total_s: +((Date.now() - t0) / 1000).toFixed(1) } };
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(out));
console.log(`${LUNI} · zona ${ZONA} · ${MODUL}${FARA_F2 ? ' · FĂRĂ prioritate F2' : ''} · ${cu.length} mașini · liber ${timp_liber.km_total} (brut ${timp_liber.brut.km}) · brambura ${timp_liber.km_brambura_total} (brut ${timp_liber.brut.km_brambura}) · neclar ${timp_liber.km_neclar_total} · reparație ${timp_liber.km_reparatie_total} · explicat F2 ${timp_liber.km_explicat_f2} · peste 50: ${timp_liber.masini_peste_prag.join(' ') || '—'} · brambura peste 50: ${timp_liber.masini_peste_prag_brambura.join(' ') || '—'} · altă uzină ${timp_liber.km_alta_uzina_total} · P10 ${P10.masini - P10.pica.length}/${P10.masini} · P10c ${P10.masini - P10.picaC.length}/${P10.masini} (scos de prioritatea F2: liber ${P10.suprapusInainte.liber.toFixed(1)}, brambura ${P10.suprapusInainte.brambura.toFixed(1)}) · ${out.durata.total_s} s`);
for (const x of P10.pica) console.log(`  P10 pică: ${JSON.stringify(x)}`);
for (const x of P10.picaC) console.log(`  P10c pică: ${JSON.stringify(x)}`);
console.log(`  P10c pe pași (km rămași în §11 ← unde cad în F2): ${JSON.stringify(P10.pasi)}`);
