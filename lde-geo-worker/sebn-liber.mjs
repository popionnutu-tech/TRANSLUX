// SEBN Orhei + Strășeni — timp liber și brambura, după regula LEAR §11 (ION-60).
//
// Ion, 25.09.2026, pe lista «Km neagreați (brambura)» a SEBN: «aplică ultima regulă km liberi de la
// Ungheni LEAR aici». Brambura de acolo era regula veche (ziua peste mediană + 15 km, din lde_route_run),
// care scotea pe listă chiar drumul zilnic de acasă — 552BRAO «Chiperceni–rută în plus» în fiecare zi.
//
// Nu e o analiză nouă: e EXACT modulul LEAR (lear-timp-liber.mjs — lanțul muncii, liber, brambura pe
// drum neobișnuit, reparație, altă uzină, navetă), cu ce diferă la SEBN pus aici:
//   - flota se ia din urmă: mașinile LDE (vehicles.is_lde) care au STAT la o poartă SEBN ≥ 2 min în
//     ≥ 4 zile ale săptămânii. Interurbanele Chișinău–nord trec zilnic pe lângă poarta Orhei, pe
//     șosea, fără să oprească — nu intră;
//   - două porți, aceeași firmă: fiecare mașină primește poarta la care a stat mai multe zile
//     (Orhei sau Strășeni), iar porțile SEBN nu sunt «altă uzină» una pentru cealaltă;
//   - la Orhei poarta e mijlocul dintre poarta principală și punctul Bucuria (0,8 km între ele),
//     cu raza 0,9 km — altfel cursele care opresc la Bucuria rămâneau fără ancoră;
//   - SEBN lucrează toată săptămâna (lde_uzine.works_saturday/sunday).
//
// Rulare:  node --env-file=.env sebn-liber.mjs [--saptamina 2026-09-14] [--write] [--de-ce 552BRAO]
import pg from 'pg';
// `track.w_date` e timestamp FĂRĂ fus și conține UTC (ca în lear-analiza.mjs și gps-worker.mjs)
pg.types.setTypeParser(1114, v => new Date(v.replace(' ', 'T') + 'Z'));
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadPlaces, buildPlacesIndex } from './places-index.mjs';
import { curseCuOpriri, eticheteaza, rezumaSaptamina, explica, PRAGURI as PRAG_LIBER } from './lear-timp-liber.mjs';
import { local, ziLucru } from './ora-locala.mjs';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const WRITE = process.argv.includes('--write');
const DE_CE = new Set((arg('--de-ce', '') || '').split(',').filter(Boolean));
const AICI = path.dirname(new URL(import.meta.url).pathname);
const UZINA_NUME = 'SEBN';
const UZINE_SEBN = ['SEBN_ORHEI', 'SEBN_STRASENI'];
// scheletul fix (apps/admin/public/lde/schelet-sebn.json, copiat lângă worker): doar capetele rutelor
const CALE_SCHELET = process.env.SEBN_SCHELET || path.join(AICI, 'sebn-schelet.json');

// porțile, cum le vede detectorul; `puncte` = porțile din bază, pentru «a stat la poartă»
const PORTI = {
  SEBN_ORHEI: { nume: 'Orhei', poarta: { lat: 47.3868, lon: 28.8065 }, rPoarta: 0.9,
    puncte: [{ lat: 47.3864, lon: 28.8014, r: 0.7 }, { lat: 47.38724, lon: 28.81155, r: 0.5 }] },
  SEBN_STRASENI: { nume: 'Strășeni', poarta: { lat: 47.15225, lon: 28.62686 }, rPoarta: 0.7,
    puncte: [{ lat: 47.15225, lon: 28.62686, r: 0.7 }] },
};
const PARC = { lat: 47.7700, lon: 27.9235 };
const ZILE_MIN = 4;             // zile cu oprire la poartă în săptămână, ca mașina să fie a SEBN
const OPRIRE_POARTA_S = 120;    // s încet (sub 4 noduri) în raza porții, într-o zi, ca să conteze «a stat»
const SALT_KM = 5;
const R_STAT = 0.3;
const TARA = { latMin: 45.3, latMax: 48.7, lonMin: 26.4, lonMax: 30.3 };
const inTara = p => p.lat >= TARA.latMin && p.lat <= TARA.latMax && p.lon >= TARA.lonMin && p.lon <= TARA.lonMax;
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
const n1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const laPuncte = (p, puncte) => puncte.some(g => hav(p, g) <= g.r);

// Săptămâna: luni → duminică. Fără argument, cea a lui «ieri» — rularea e luni 08:00 (ca la LEAR).
function saptamina(zi) {
  const d = zi ? new Date(zi + 'T12:00:00Z') : new Date(Date.now() - 86400000);
  const dow = (d.getUTCDay() + 6) % 7;
  const luni = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  const dum = new Date(luni.getTime() + 6 * 86400000);
  return { luni: luni.toISOString().slice(0, 10), duminica: dum.toISOString().slice(0, 10) };
}

const locuri = (() => { try { return loadPlaces(process.env.PLACES_FILE); } catch { return []; } })();
const placesIdx = buildPlacesIndex(locuri);
const numeLoc = p => placesIdx.nearestWithin(p, 3.8)?.name ?? null;

// Casa = locul unde stă cel mai mult pe loc, din staționările de peste 2 h, la orice oră; poarta și
// parcul se scot (ca `casaDinUrma` din lear-analiza.mjs). Se ține PUNCTUL, nu centrul satului:
// detectorul caută «acasă» la cel mult 3 km, iar satele sunt întinse.
function casaDinUrma(pts, puncte) {
  const peLoc = new Map();
  let ancora = null, deCand = null, ultim = null;
  const inchide = () => {
    if (!ancora || !deCand || !ultim) return;
    const min = (ultim - deCand) / 60000;
    if (min < 120) return;
    if (puncte.some(g => hav(ancora, g) <= 1.5) || hav(ancora, PARC) <= 0.8) return;
    const k = `${ancora.lat.toFixed(3)}|${ancora.lon.toFixed(3)}`;
    const x = peLoc.get(k) || { p: ancora, min: 0 };
    x.min += min; peLoc.set(k, x);
  };
  for (const p of pts) {
    if (ancora && hav(ancora, p) <= R_STAT) { ultim = p.t; continue; }
    inchide(); ancora = p; deCand = p.t; ultim = p.t;
  }
  inchide();
  const best = [...peLoc.values()].sort((a, b) => b.min - a.min)[0];
  return best ? { lat: best.p.lat, lon: best.p.lon, nume: numeLoc(best.p), ore: +(best.min / 60).toFixed(1) } : null;
}

// ─── programul ───────────────────────────────────────────────────────────────
const sapt = saptamina(arg('--saptamina'));
// o zi în plus de fiecare parte: lanțurile de la marginea săptămânii au nevoie de context
const de_la = new Date(new Date(sapt.luni + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
const pana_la = new Date(new Date(sapt.duminica + 'T00:00:00Z').getTime() + 2 * 86400000).toISOString().slice(0, 10);
const inSapt = z => z >= sapt.luni && z <= sapt.duminica;
const sfarsitDate = Math.min(Date.now(), +new Date(pana_la + 'T00:00:00Z'));
console.log(`${UZINA_NUME} · timp liber și brambura · săptămâna ${sapt.luni} → ${sapt.duminica}`);

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false }, realtime: { transport: ws } });
const [{ data: ferRows, error: eF }, { data: uz }, { data: porti }, { data: lde }] = await Promise.all([
  supa.from('lde_uzina_ferestre_ceas').select('uzina_id, sens, shift_number, de_la_min, pana_la_min').in('uzina_id', UZINE_SEBN),
  supa.from('lde_uzine').select('id, works_saturday, works_sunday').in('id', UZINE_SEBN),
  supa.from('lde_uzine_gates').select('uzina_id, label, lat, lon, radius_km').eq('active', true),
  supa.from('vehicles').select('id, plate_number').eq('is_lde', true),
]);
if (eF) { console.error('lde_uzina_ferestre_ceas:', eF.message); process.exit(1); }
const ferestre = id => (ferRows || []).filter(f => f.uzina_id === id);
if (!ferestre('SEBN_ORHEI').length) { console.error('fără ferestre de ceas SEBN_ORHEI în bază (migr. 400) — nimic de socotit'); process.exit(1); }
const zileLucru = id => { const r = (uz || []).find(x => x.id === id); return { sambata: r ? !!r.works_saturday : true, duminica: r ? !!r.works_sunday : true }; };
const alteUzine = (porti || []).filter(g => !UZINE_SEBN.includes(g.uzina_id))
  .map(g => ({ lat: +g.lat, lon: +g.lon, r: +g.radius_km || 0.5, nume: `${g.uzina_id.replace(/_/g, ' ')} (${g.label})` }));
const esteLde = new Set((lde || []).map(v => v.plate_number));
const idDupaNr = new Map((lde || []).map(v => [v.plate_number, v.id]));

const S = existsSync(CALE_SCHELET) ? JSON.parse(readFileSync(CALE_SCHELET, 'utf8')) : null;
if (!S) console.log(`(fără ${CALE_SCHELET}: capetele rutelor nu se folosesc la «neclar»)`);

// 1. cine a trecut prin zona porților (cutie de ±0,9′ NMEA ≈ 1,7 km), apoi doar mașinile LDE
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432),
  user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: devs } = await t.query(`SELECT id,"CarName" FROM devices WHERE active=true`);
const cand = new Set();
for (const u of Object.values(PORTI)) {
  const xC = Math.floor(u.poarta.lat) * 100 + (u.poarta.lat - Math.floor(u.poarta.lat)) * 60;
  const yC = Math.floor(u.poarta.lon) * 100 + (u.poarta.lon - Math.floor(u.poarta.lon)) * 60;
  const { rows } = await t.query(`SELECT DISTINCT id FROM track WHERE w_date>=$1 AND w_date<$2
    AND x BETWEEN $3 AND $4 AND y BETWEEN $5 AND $6`, [de_la, pana_la, xC - 0.9, xC + 0.9, yC - 0.9, yC + 0.9]);
  for (const r of rows) cand.add(String(r.id));
}
const flotaDev = devs.filter(d => cand.has(String(d.id)) && esteLde.has(d.CarName));
console.log(`în zona porților: ${cand.size} mașini · din ele LDE: ${flotaDev.length}`);

// kmZi din baza workerului de noapte, pentru controlul ecuației (ca la LEAR)
const masini = [], doarTrecute = [];
for (const d of flotaDev) {
  const { rows } = await t.query(`SELECT w_date,x,y,speed FROM track WHERE id=$1 AND w_date>=$2 AND w_date<$3 ORDER BY w_date`,
    [d.id, de_la, pana_la]);
  if (rows.length < 50) continue;
  const pts = [], kmZi = new Map();
  const lentPeZi = { SEBN_ORHEI: new Map(), SEBN_STRASENI: new Map() };
  let prev = null;
  for (const r of rows) {
    const p = { lat: nmea(Number(r.x)), lon: nmea(Number(r.y)), t: new Date(r.w_date), v: Number(r.speed) };
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !inTara(p)) continue;
    pts.push(p);
    const z = ziLucru(p.t);
    if (prev) { const dk = hav(prev, p); if (dk < SALT_KM && !(p.v <= 1 && prev.v <= 1)) kmZi.set(z, (kmZi.get(z) || 0) + dk); }
    for (const [id, u] of Object.entries(PORTI))
      if (prev && p.v <= 4 && laPuncte(p, u.puncte)) {
        const s = Math.min((p.t - prev.t) / 1000, 60);
        lentPeZi[id].set(z, (lentPeZi[id].get(z) || 0) + s);
      }
    prev = p;
  }
  // zilele săptămânii în care a STAT la fiecare poartă
  const zile = id => [...lentPeZi[id]].filter(([z, s]) => inSapt(z) && s >= OPRIRE_POARTA_S).map(([z]) => z);
  const zO = zile('SEBN_ORHEI'), zS = zile('SEBN_STRASENI');
  const uzina = zS.length > zO.length ? 'SEBN_STRASENI' : 'SEBN_ORHEI';
  const zilePoarta = new Set([...zO, ...zS]);
  if (zilePoarta.size < ZILE_MIN) {
    if (zilePoarta.size) doarTrecute.push({ masina: d.CarName, zile: zilePoarta.size });
    continue;
  }
  const P = PORTI[uzina];
  const casa = casaDinUrma(pts, [...PORTI.SEBN_ORHEI.puncte, ...PORTI.SEBN_STRASENI.puncte]);
  // capetele rutelor pe care le face mașina, din schelet (pentru «neclar»: atinge capătul, nu poarta)
  const capete = S ? S.rute.filter(r => r.c && r.schimburi.some(s => s.masina === d.CarName)).map(r => ({ lat: r.c[0], lon: r.c[1] })) : [];
  const { data: al } = await supa.from('lde_fuel_alimentari').select('alimentat_at')
    .eq('vehicle_id', idDupaNr.get(d.CarName)).gte('alimentat_at', de_la + 'T00:00:00Z').lte('alimentat_at', pana_la + 'T23:59:59Z');
  const zl = zileLucru(uzina);
  const ctx = { poarta: P.poarta, parc: PARC, casaC: casa ? { lat: casa.lat, lon: casa.lon } : null,
    ferestre: ferestre(uzina), lucreazaSambata: zl.sambata, lucreazaDuminica: zl.duminica,
    local, ziLucru, inSapt, sfarsitDate, alimentari: (al || []).map(r => ({ t: new Date(r.alimentat_at) })),
    numeLoc, alteUzine, capeteRute: capete, praguri: { R_POARTA: P.rPoarta } };
  const curse = curseCuOpriri(pts, ctx);
  const etich = eticheteaza(curse, ctx);
  const kmZiSapt = [...kmZi].filter(([z]) => inSapt(z)).reduce((s, [, k]) => s + k, 0);
  const liber = rezumaSaptamina(etich, ctx, kmZiSapt);
  masini.push({ masina: d.CarName, poarta: P.nume, zile_poarta: zilePoarta.size,
    casa: casa?.nume ?? null, casa_ore: casa?.ore ?? null, km_sapt: +kmZiSapt.toFixed(1), liber });
  if (DE_CE.has(d.CarName)) { console.error(`[${d.CarName}] ${curse.length} curse, casa ${casa?.nume}`);
    for (const l of explica(etich, ctx)) console.error(`[${d.CarName}]   ${l}`);
    for (const x of liber.iesiri) console.error(`[${d.CarName}] ieșire ${x.zi} ${x.de_la}–${x.pana_la} ${x.km} km ${x.eticheta}: ${x.de_unde} → ${x.cel_mai_departe} → ${x.pana_unde} · după ${x.dupa ?? "—"} · înainte ${x.inainte ?? "—"}`); }
}
await t.end();

masini.sort((a, b) => (b.liber.km + b.liber.km_brambura) - (a.liber.km + a.liber.km_brambura));
const S_ = f => masini.reduce((s, m) => s + Math.max(0, f(m) || 0), 0);
const timpLiber = {
  prag_km: PRAG_LIBER.PRAG_ALARMA_KM, km_total: +S_(m => m.liber.km).toFixed(1),
  masini_peste_prag: masini.filter(m => m.liber.peste_prag).map(m => m.masina),
  km_brambura_total: +S_(m => m.liber.km_brambura).toFixed(1), prag_brambura_km: PRAG_LIBER.PRAG_ALARMA_BRAMBURA_KM,
  masini_peste_prag_brambura: masini.filter(m => m.liber.peste_prag_brambura).map(m => m.masina),
  ferestre: ferestre('SEBN_ORHEI'), zile_lucru: zileLucru('SEBN_ORHEI'),
};

console.log('\nmașină     poarta    zile  casa                 km săpt   liber  brambura  neclar  control');
for (const m of masini) { const L = m.liber, c = L.control;
  console.log(`${m.masina.padEnd(10)} ${m.poarta.padEnd(9)} ${String(m.zile_poarta).padStart(4)}  ${(m.casa ?? '—').padEnd(20)} ${n1(m.km_sapt).padStart(7)} ${n1(L.km).padStart(7)} ${n1(L.km_brambura).padStart(9)} ${n1(L.km_neclar).padStart(7)}  ` +
    (c ? `${n1(c.km_curse)} vs ${n1(c.km_zi)}` : '—') + (L.peste_prag ? '  ⚑ liber' : '') + (L.peste_prag_brambura ? '  ⚑ brambura' : '')); }
if (doarTrecute.length) console.log(`\ndoar în trecere (sub ${ZILE_MIN} zile la poartă): ${doarTrecute.map(x => `${x.masina} ${x.zile}z`).join(', ')}`);
console.log(`\ntotal: ${n1(timpLiber.km_total)} km liber · ${n1(timpLiber.km_brambura_total)} km brambura · ${masini.length} mașini`);

const rezultat = { uzina: UZINA_NUME, saptamina: sapt.luni, pana_la: sapt.duminica, masini, doar_trecute: doarTrecute, timp_liber: timpLiber };
if (WRITE) {
  const { error } = await supa.from('lde_analiza_reguli').upsert({
    uzina: UZINA_NUME, saptamina: sapt.luni, rulat_la: new Date().toISOString(), date: rezultat,
    note: `${masini.length} mașini · ${n1(timpLiber.km_total)} km liber · ${n1(timpLiber.km_brambura_total)} km brambura`,
  }, { onConflict: 'uzina,saptamina' });
  if (error) { console.error('\nscrierea a picat:', error.message); process.exit(1); }
  console.log(`\nscris în lde_analiza_reguli · ${UZINA_NUME} · ${sapt.luni}`);
} else console.log('\n(fără --write, nimic nu s-a scris în bază)');
