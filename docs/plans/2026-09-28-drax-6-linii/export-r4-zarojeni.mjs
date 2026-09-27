// ION-112 r4 (Codex r3 C2): reconcilierea Zarojeni pe ambele faze și pe toate mașinile. Toate picioarele din septembrie (obs-ideal v4.3,
// orice etichetă de rută) ale mașinilor care au lucrat R18 sau au oprit în Zarojeni, cu oprire validă la capăt (≤ 0,8 km, < 8 km/h real
// = noduri × 1,852, ≥ 20 s — §4.5). Pe fiecare: poarta atinsă (EST / VEST), km de la oprire la poartă (tur) / de la poartă la oprire (retur),
// faza §2.3 (ancora 21.09 = A), grupa, eticheta de rută și ce a făcut mașina între oprire și poartă (alt sat de capăt atins).
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));
const D = '/root/lde-worker/drax/date/ideal-v4.3';
const O = JSON.parse(readFileSync(`${D}/obs-ideal.json`, 'utf8')); const obs = O.curse ?? O;
const SK = JSON.parse(readFileSync(`${D}/schelet-ideal.json`, 'utf8'));
const nmea = (v) => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const PORTI = { EST: { lat: 47.78513, lon: 27.94307, r: 0.6 }, VEST: { lat: 47.77408, lon: 27.91593, r: 0.5 } };
const poartaDe = (p) => Object.entries(PORTI).find(([, g]) => hav(p, g) <= g.r + 0.1)?.[0] ?? null;
const ANCORA = Date.parse('2026-09-21T00:00:00Z');
const faza = (zi) => { const s = Math.floor((Date.parse(zi + 'T12:00:00Z') - ANCORA) / (7 * 864e5)); return (((s % 2) + 2) % 2) === 0 ? 'A' : 'B'; };
const grupa = (zi, schimb) => !schimb ? '?' : (faza(zi) === 'A') === (schimb === 's1') ? 'D' : 'EZ';
const Z = SK.find((e) => e.ruta === 'R18' && e.linie === 'Zarojeni'); const cap = { lat: Z.capatC[0], lon: Z.capatC[1] };
const capete = SK.filter((e) => e.capatC && e.linie !== 'Zarojeni').map((e) => ({ n: `${e.ruta} ${e.linie}`, lat: e.capatC[0], lon: e.capatC[1] }));
const MAS = new Set(['348KAJ', '763LYY', ...obs.filter((o) => o.ruta === 'R18').map((o) => o.m)]);
const t = new pg.Client({ host: process.env.TRACKER_HOST, port: Number(process.env.TRACKER_PORT || 5432), user: process.env.TRACKER_USER, password: process.env.TRACKER_PASS, database: process.env.TRACKER_DB, ssl: false });
await t.connect();
const { rows: dv } = await t.query(`SELECT id,"CarName","RegNo" FROM devices`);
const canon = (s) => { const p = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const m = p.match(/^([A-Z]{3})(\d{3})$/); return m ? m[2] + m[1] : p; };
const devDe = new Map(); for (const d of dv) for (const k of [canon(d.CarName), canon(d.RegNo)]) if (k) (devDe.get(k) ?? devDe.set(k, []).get(k)).push(d.id);
const Q = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
const out = [];
for (const o of obs.filter((o) => MAS.has(o.m) && o.zi >= '2026-09-01' && o.schimb)) {
  const ids = devDe.get(canon(o.m)) ?? []; if (!ids.length) continue;
  const a = Date.parse(o.t0) - 10 * 60e3, b = Date.parse(o.t1) + 10 * 60e3;
  const { rows } = await t.query('SELECT w_date, x, y, speed FROM track WHERE id = ANY($1) AND w_date >= $2 AND w_date < $3 ORDER BY w_date', [ids, Q(a), Q(b)]);
  const P = rows.map((r) => ({ t: r.w_date.getTime(), lat: nmea(+r.x), lon: nmea(+r.y), v: +r.speed * 1.852 })).filter((p) => p.lat > 45 && p.lat < 49);
  const opr = []; let st = null;
  for (const p of P) { if (hav(p, cap) <= 0.8 && p.v < 8) { st ??= p; st.u = p; } else { if (st && st.u.t - st.t >= 20e3) opr.push(st); st = null; } }
  if (st && st.u.t - st.t >= 20e3) opr.push(st);
  if (!opr.length) continue;
  const cum = []; let s = 0; P.forEach((p, i) => { if (i) { const d = hav(P[i - 1], p); if (d <= 5) s += d; } cum.push(s); });
  let km = null, poarta = null, prin = [];
  if (o.sens === 'tur') { const ix = P.indexOf(opr[0]); const ig = P.findIndex((p, i) => i > ix && poartaDe(p));
    if (ig > ix) { km = cum[ig] - cum[ix]; poarta = poartaDe(P[ig]); prin = P.slice(ix, ig); } }
  else { const ix = P.indexOf(opr.at(-1)); let ig = -1; for (let i = ix - 1; i >= 0; i--) if (poartaDe(P[i])) { ig = i; break; }
    if (ig >= 0) { km = cum[ix] - cum[ig]; poarta = poartaDe(P[ig]); prin = P.slice(ig, ix); } }
  // alte capete de linie atinse (≤ 0,8 km, oprit < 8 km/h) pe drumul oprire ↔ poartă
  const alte = [...new Set(capete.filter((c) => prin.some((p) => hav(p, c) <= 0.8 && p.v < 8)).map((c) => c.n))];
  out.push({ m: o.m, zi: o.zi, sens: o.sens, schimb: o.schimb, faza: faza(o.zi), grupa: grupa(o.zi, o.schimb), eticheta: `${o.ruta} ${o.linie}`,
    opriri: opr.length, poarta, km: km == null ? null : +km.toFixed(1), kmCuRaza: km == null ? null : +(km + PORTI[poarta].r).toFixed(1), alteCapete: alte });
}
await t.end();
writeFileSync('/tmp/p112-export-r4-zarojeni.json', JSON.stringify(out));
const med = (a) => { const q = a.filter((x) => x != null).sort((x, y) => x - y); if (!q.length) return null; const n = q.length; return n % 2 ? q[(n - 1) / 2] : +((q[n / 2 - 1] + q[n / 2]) / 2).toFixed(2); };
console.log('m | zi | sens | schimb | faza | grupa | eticheta | poarta | km oprire→poartă | +rază | alte capete pe drum');
for (const x of out.sort((p, q) => (p.zi + p.m + p.sens).localeCompare(q.zi + q.m + q.sens))) console.log([x.m, x.zi, x.sens, x.schimb, x.faza, x.grupa, x.eticheta, x.poarta, x.km, x.kmCuRaza, x.alteCapete.join(',')].join(' | '));
for (const g of ['EZ', 'D']) for (const sens of ['tur', 'retur']) for (const f of ['A', 'B', '*']) {
  const q = out.filter((x) => x.grupa === g && x.sens === sens && (f === '*' || x.faza === f) && x.km != null);
  if (q.length) console.log(`${g} ${sens} faza ${f}: n ${q.length} · mediana km ${med(q.map((x) => x.km))} · cu rază ${med(q.map((x) => x.kmCuRaza))} · porți ${JSON.stringify(q.reduce((a, x) => (a[x.poarta] = (a[x.poarta] || 0) + 1, a), {}))} · fără alte capete: ${med(q.filter((x) => !x.alteCapete.length).map((x) => x.kmCuRaza))} (n ${q.filter((x) => !x.alteCapete.length).length})`);
}
