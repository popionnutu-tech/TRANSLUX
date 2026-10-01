// Mejgorod — optimizări simple, regula lui Ion (25.09): «km optimizați se numără dacă șoferul a făcut drumul și seara pe
// tot traseul și dimineața navetă; dacă doar dimineața navetă, iar seara nu a făcut — e aceeași situație ca să rămână auto la
// capăt de rută». Deci, pe fiecare zi: unde a dormit mașina (tracker, ora 03), de unde a pornit turul, unde s-a terminat returul.
//   optimizabil (zi) = returul a ajuns la capătul rutei ? gol seara (capăt → parcare) + navetă dimineața (parcare → start) : 0
//   node optim2.mjs → ../date/optim2.json + raport
import { readFileSync, writeFileSync } from 'node:fs';
import { hav, med } from './geo.mjs';
const I = JSON.parse(readFileSync('../date/ideal.json', 'utf8')).filter((x) => !x.slab);
const SUFIX = process.env.SUFIX || '';   // '-sapt' = săptămâna curentă; scheletul (ideal.json) rămâne cel fix pe 100 de zile
const D = JSON.parse(readFileSync(`../date/curse${SUFIX}.json`, 'utf8'));
const N = JSON.parse(readFileSync(`../date/nomenclator${SUFIX}.json`, 'utf8'));
const P = JSON.parse(readFileSync(`../date/parcare${SUFIX}.json`, 'utf8'));
const CAPAT_KM = 3, PE_RUTA_KM = 6;   // garajul e la câțiva km de punctul satului (Ocnița, Trinca)
// Ion, 25.09: «nu poate fi capăt ruta și unde doarme egal și loc optimizarea». Până acum «doarme la» era cea mai apropiată
// OPRIRE a rutei (până la 6 km, sau oricât «în afara rutei») — 235DQO/240RQR dormeau la Briceni, 10 km de Caracușenii Vechi,
// și posterul scria «Caracușenii Vechi». Acum: localitatea reală din OSM (sat/oraș, fără cartiere); dacă e aceeași cu
// localitatea capătului, nu e navetă (Chișinău: 12 km de centru e tot Chișinău — Buiucani, Ciocana, Durlești).
const PL = [];
for (const l of readFileSync(process.env.PLACES_FILE || '/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  const c = l.replace(/\x1e/g, '').trim(); if (!c) continue; let q; try { q = JSON.parse(c); } catch { continue; }
  const pr = q.properties || {}, nm = pr['name:ro'] || pr.name; if (!nm || !['city', 'town', 'village'].includes(pr.place)) continue;
  PL.push({ n: nm, lat: q.geometry.coordinates[1], lon: q.geometry.coordinates[0] });
}
const CHIS = { lat: 47.0245, lon: 28.8323 }, OFF_KM = 2;
const loc = (lat, lon) => { const p = { lat, lon }; if (hav(p, CHIS) <= 12) return 'Chișinău'; let b = null, bd = Infinity; for (const q of PL) { const d = hav(p, q); if (d < bd) { bd = d; b = q; } } return b?.n ?? null; };
const ziUrm = (z) => new Date(Date.parse(z) + 864e5).toISOString().slice(0, 10);

const OUT = [];
for (const x of I) {
  const r = N.rute.find((q) => q.id === x.ruta);
  const kmO = new Map(); for (const s of x.stops) { kmO.set(s.o, s.km); for (const a of s.alias || []) { const g = r.opriri.find((q) => q.n === a); if (g) kmO.set(g.o, s.km); } }
  // parcarea pe schelet: cea mai apropiată oprire (≤3 km) → km-ul ei; altfel în afara rutei
  const peSchelet = (c) => { if (!c) return null; let b = null, bd = Infinity; for (const s of x.stops) { const d = hav({ lat: c[0], lon: c[1] }, { lat: s.lat, lon: s.lon }); if (d < bd) { bd = d; b = s; } } return { km: b?.km ?? null, off: bd > OFF_KM ? +(bd * 1.3).toFixed(1) : 0, n: loc(c[0], c[1]), d: bd, afara: bd > PE_RUTA_KM }; };   // în afara rutei: km-ul opririi + drumul până la ea, aproximat
  const tur = new Map(D.curse.filter((c) => c.r === x.ruta && c.s === 'tur' && !c.motiv && c.oA != null).map((c) => [c.z, c]));
  const retur = new Map(D.curse.filter((c) => c.r === x.ruta && c.s === 'retur' && !c.motiv && c.oB != null).map((c) => [c.z, c]));
  const zile = []; let douaMasini = 0;
  const locKm = (km) => { const s = x.stops.find((q) => Math.abs(q.km - km) < 0.05); return s ? loc(s.lat, s.lon) : null; };
  // Ziua în ordinea reală: unele rute fac returul dimineața și turul după-amiaza (10, 11, 12, 14, 15, 58 dorm la Chișinău).
  // Primul drum al zilei pornește de la «start», ultimul se termină la «capătul lui» (tur → Chișinău, retur → capătul de nord).
  for (const [z, ct] of tur) {
    const cr = retur.get(z); if (!cr) continue;
    // turul și returul cu mașini diferite (ruta 16: 784MJW tur, 828MLN retur) nu fac o zi: golul de seară e al altei mașini
    if (ct.m !== cr.m) { douaMasini++; continue; }
    const primul = ct.t0 <= cr.t0 ? ct : cr, ultimul = primul === ct ? cr : ct;
    const startKm = kmO.get(primul.oA), endKm = kmO.get(ultimul.oB); if (startKm == null || endKm == null) continue;
    const capatKm = ultimul.s === 'tur' ? x.km : 0;                       // unde trebuie să se termine ultimul drum
    const pIn = peSchelet(P[primul.m]?.[z]), pOut = peSchelet(P[ultimul.m]?.[ziUrm(z)]);
    const laCapat = Math.abs(endKm - capatKm) <= CAPAT_KM;
    // sub 3 km (garajul din același oraș) nu e navetă, e parcat la capăt — același prag ca la «la capăt»
    const prag = (v) => v == null ? null : v <= CAPAT_KM ? 0 : v;
    const startLoc = locKm(startKm), endLoc = locKm(endKm);
    const naveta = pIn?.km == null ? null : pIn.n && pIn.n === startLoc ? 0 : prag(+(Math.abs(pIn.km - startKm) + pIn.off).toFixed(1));
    const golSeara = pOut?.km == null ? null : pOut.n && pOut.n === endLoc ? 0 : prag(+(Math.abs(endKm - pOut.km) + pOut.off).toFixed(1));
    const optim = laCapat ? +((naveta ?? 0) + (golSeara ?? 0)).toFixed(1) : 0;
    zile.push({ z, m: ct.m, startLoc, endLoc, ordine: primul.s === 'tur' ? 'tur→retur' : 'retur→tur', start: startKm, end: endKm, laCapat, pIn: pIn?.n ?? null, pInKm: pIn?.km ?? null, pInD: pIn ? +pIn.d.toFixed(1) : null, pInAfara: !!pIn?.afara, pOut: pOut?.n ?? null, pOutKm: pOut?.km ?? null, pOutAfara: !!pOut?.afara, naveta, golSeara, optim, cazB: !laCapat && (naveta ?? 0) > CAPAT_KM });
  }
  const modul = (a) => { const c = new Map(); for (const v of a) if (v) c.set(v, (c.get(v) || 0) + 1); return [...c].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null; };
  const cuP = zile.filter((d) => d.pInKm != null);
  OUT.push({ ruta: x.ruta, nume: x.nume, capNord: x.capNord, km: x.km, zile: zile.length, cuParcare: cuP.length, inAfara: zile.filter((d) => d.pInAfara).length, ordine: modul(zile.map((d) => d.ordine)),
    doarme: modul(zile.map((d) => d.pIn)), doarmeNopti: zile.filter((d) => d.pIn && d.pIn === modul(zile.map((q) => q.pIn))).length, douaMasini, doarmeSeara: modul(zile.map((d) => d.pOut)),
    searaLaCapat: zile.filter((d) => d.laCapat).length, cazB: zile.filter((d) => d.cazB).length,
    navetaMed: cuP.length ? med(cuP.map((d) => d.naveta)) : null, golSearaMed: zile.filter((d) => d.golSeara != null).length ? med(zile.filter((d) => d.golSeara != null).map((d) => d.golSeara)) : null,
    optimMed: zile.length ? med(zile.map((d) => d.optim)) : null, optimZi: zile.length ? +(zile.reduce((s, d) => s + d.optim, 0) / zile.length).toFixed(1) : null,
    optimTotal: +zile.reduce((s, d) => s + d.optim, 0).toFixed(0), detalii: zile });
}
writeFileSync(`../date/optim2${SUFIX}.json`, JSON.stringify(OUT));
const n1 = (v) => v == null ? '   —' : (+v).toFixed(1).padStart(6);
console.log('rută  schelet             zile  ordine     doarme (03)         seara la capăt  navetă dim  gol seara  optim/zi  caz B  în afara rutei');
for (const o of OUT) console.log(`${String(o.ruta).padStart(3)}   ${o.capNord.padEnd(18)} ${String(o.zile).padStart(4)}  ${String(o.ordine ?? '').padEnd(10)} ${String(o.doarme ?? '?').padEnd(19)} ${String(o.searaLaCapat).padStart(3)}/${String(o.zile).padEnd(3)}      ${n1(o.navetaMed)}     ${n1(o.golSearaMed)}    ${n1(o.optimZi)}   ${String(o.cazB).padStart(3)}    ${o.inAfara}`);
const tot = OUT.reduce((s, o) => s + (o.optimZi || 0), 0);
console.log(`\noptimizabil pe zi (media zilelor): ${tot.toFixed(0)} km · pe 100 de zile: ${OUT.reduce((s, o) => s + o.optimTotal, 0)} km · zile «caz B» (navetă dimineața, seara nu până la capăt): ${OUT.reduce((s, o) => s + o.cazB, 0)}`);
