// ION-112 r7 (Q1 v15) — Nihoreni: zona de urcare = Nihoreni + Rîșcani (≤ 4,5 km de capăt, satele R3 din act), altfel ca export-r3. Export unificat pe urma brută (viteza în NODURI × 1,852, ca gps-worker.mjs:31 / curse.mjs:101):
// pe fiecare picior din obs-ideal (ideal-v4.3) al liniilor Nihoreni, Zarojeni, Prajila: oprirea în satul-capăt (≤ 0,8 km de capătul liniei,
// < 8 km/h real, ≥ 20 s — §4.5), km de la oprire la poartă (tur: prima oprire → sosire; retur: plecare → ultima oprire), grupa după §2.3.
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const SK = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const PORTI = [{ lat: 47.78513, lon: 27.94307, r: 0.6 }, { lat: 47.77408, lon: 27.91593, r: 0.5 }];
const laPoarta = (p) => PORTI.some((g) => hav(p, g) <= g.r + 0.1);
const ANCORA = Date.parse('2026-09-21T00:00:00Z');   // §2.3: săptămâna 21.09 = faza A (D pe s1); alternanță săptămânală
const faza = (zi) => { const s = Math.floor((Date.parse(zi + 'T12:00:00Z') - ANCORA) / (7 * 864e5)); return (((s % 2) + 2) % 2) === 0 ? 'A' : 'B'; };
const grupa = (zi, schimb) => !schimb ? '?' : (faza(zi) === 'A') === (schimb === 's1') ? 'D' : 'EZ';
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const devDe = new Map(); for (const d of dv) for (const k of [canon(d.CarName), canon(d.RegNo)]) if (k) (devDe.get(k) ?? devDe.set(k, []).get(k)).push(d.id);
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const out = [];
for (const [ruta, linie] of [['R3', 'Nihoreni']]) {
  const L = SK.find((e) => e.ruta === ruta && e.linie === linie); const cap = { lat: L.capatC[0], lon: L.capatC[1] };
  const legs = obs.filter((o) => o.ruta === ruta && o.linie === linie && o.schimb && !o.exclusEtalon);
  for (const o of legs) {
    const ids = devDe.get(canon(o.m)) ?? []; if (!ids.length) continue;
    const a = Date.parse(o.t0) - 10 * 60e3, b = Date.parse(o.t1) + 10 * 60e3;
    const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, Q(a), Q(b)]);
    const P = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45 && p.lat < 49);
    // opririle în capăt
    const opr = []; let st = null;
    for (const p of P) { const inCap = hav(p, cap) <= 4.5; if (inCap && p.v < 8) { st ??= p; st.u = p; } else { if (st && st.u.t - st.t >= 20e3) opr.push(st); st = null; } }
    if (st && st.u.t - st.t >= 20e3) opr.push(st);
    const cum = []; let s = 0; P.forEach((p, i) => { if (i) { const d = hav(P[i - 1], p); if (d <= 5) s += d; } cum.push(s); });
    const iP = P.findIndex(laPoarta), jP = P.length - 1 - [...P].reverse().findIndex(laPoarta);
    let km = null, oprT = null;
    if (opr.length && iP >= 0) {
      if (o.sens === 'tur') { const x = opr[0]; const ix = P.indexOf(x); const ig = P.findIndex((p, i) => i > ix && laPoarta(p)); if (ig > ix) { km = cum[ig] - cum[ix]; oprT = x.t; } }
      else { const x = opr.at(-1); const ix = P.indexOf(x); let ig = -1; for (let i = ix - 1; i >= 0; i--) if (laPoarta(P[i])) { ig = i; break; } if (ig >= 0) { km = cum[ix] - cum[ig]; oprT = x.t; } }
    }
    out.push({ ruta, linie, m: o.m, zi: o.zi, sens: o.sens, schimb: o.schimb, grupa: grupa(o.zi, o.schimb), faza: faza(o.zi), sept: o.zi >= '2026-09-01', plinLant: o.plin, opriri: opr.length, kmDeLaOprire: km == null ? null : +km.toFixed(1) });
  }
}
await t.end();
writeFileSync('/tmp/p112-export-r5-nihoreni.json', JSON.stringify(out));
const med = (a) => { const q = a.filter((x) => x != null).sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : null; };
for (const [ruta, linie] of [['R3', 'Nihoreni']]) {
  console.log(`== ${ruta} ${linie}`);
  for (const per of ['sept', 'toată fereastra']) for (const g of ['D', 'EZ']) for (const sens of ['tur', 'retur']) {
    const q = out.filter((x) => x.linie === linie && x.grupa === g && x.sens === sens && (per === 'toată fereastra' || x.sept));
    if (!q.length) continue;
    const cu = q.filter((x) => x.opriri > 0);
    console.log(`   ${per.padEnd(15)} ${g.padEnd(2)} ${sens.padEnd(5)} picioare ${String(q.length).padStart(3)} · cu oprire la capăt ${String(cu.length).padStart(3)} · km de la oprire (mediana) ${med(cu.map((x) => x.kmDeLaOprire))} · plin lanț (mediana) ${med(q.map((x) => x.plinLant))} · mașini ${[...new Set(q.map((x) => x.m))].join(' ')}`);
  }
  // perechi pe zi (tur+retur același schimb, aceeași mașină) — septembrie, pe mașini
  const pe = {}; for (const x of out.filter((x) => x.linie === linie && x.sept)) { const k = `${x.zi}|${x.m}|${x.schimb}`; (pe[k] ??= new Set()).add(x.sens); }
  const zile = {}; for (const [k, v] of Object.entries(pe)) if (v.size === 2) { const [zi, m] = k.split('|'); (zile[zi] ??= []).push(m); }
  console.log('   perechi/zi sept:', Object.entries(zile).sort().map(([z, ms]) => `${z.slice(5)} ${ms.length} (${ms.join(',')})`).join(' · '));
}
