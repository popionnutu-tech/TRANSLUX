// Proba pct. 1 (ora locală): (a) pe TOATE observațiile reale din v2 (vară), ora și ziua recalculate prin timp.mjs = cele scrise de v2;
// (b) zile sintetice după 25.10.2026 (EET, UTC+2): Intl dă ora reală, UTC+3 fix dădea +1 h; (c) noaptea schimbării orei.
import { readFileSync } from 'node:fs';
import { oraLoc, ziLucru, ziLocala, inceputZiLucru } from '/root/lde-worker/drax/cod/ideal-v3/timp.mjs';
const V2 = '/root/lde-worker/drax/date/ideal-v3/proba/v2/';
const O = JSON.parse(readFileSync(V2 + 'obs-ideal.json', 'utf8'));
const vechiOra = d => { const t = new Date(new Date(d).getTime() + 3 * 3600e3); return t.getUTCHours() + t.getUTCMinutes() / 60; };
const vechiZi = d => new Date(new Date(d).getTime()).toISOString().slice(0, 10);
let n = 0, difOra = 0, difZi = 0, min = null, max = null; const ex = [];
for (const c of O.curse) { const t = c.sens === 'tur' ? c.t1 : c.t0; n++;
  const h = +oraLoc(t).toFixed(2); if (h !== c.ora) { difOra++; if (ex.length < 5) ex.push(['ora', c.m, t, c.ora, h]); }
  if (ziLucru(t) !== c.zi) { difZi++; if (ex.length < 5) ex.push(['zi', c.m, t, c.zi, ziLucru(t)]); }
  if (!min || t < min) min = t; if (!max || t > max) max = t; }
console.log(`(a) observații reale v2: ${n} (${min} … ${max}) · ora diferită ${difOra} · ziua diferită ${difZi}${ex.length ? ' · ex ' + JSON.stringify(ex) : ''}`);
const D = JSON.parse(readFileSync(V2 + 'curse-ideal.json', 'utf8'));
let dz = 0; for (const c of D.curse) if (ziLocala(c.t0) !== new Date(new Date(c.t0).getTime() + 3 * 3600e3).toISOString().slice(0, 10)) dz++;
console.log(`(a') deplasări reale v2: ${D.curse.length} · data locală (fix-dubluri/dubluri-placa/card-gps) diferită: ${dz}`);
console.log(`(a'') limitele SQL vara: 2026-05-04 → ${inceputZiLucru('2026-05-04').toISOString()} · 2026-09-26 → ${inceputZiLucru('2026-09-26').toISOString()} (v2: «2026-05-04» = 00:00 UTC)`);
const T = [
  ['2026-09-14T03:13:00Z', 'vară: sosire tur s1 06:13 EEST'],
  ['2026-09-14T21:15:00Z', 'vară: plecare retur s2 00:15 EEST (ziua de lucru 14.09)'],
  ['2026-10-26T04:13:00Z', 'iarnă: sosire tur s1 06:13 EET'],
  ['2026-10-26T12:45:00Z', 'iarnă: sosire tur s2 14:45 EET'],
  ['2026-10-26T22:15:00Z', 'iarnă: plecare retur s2 00:15 EET (ziua de lucru 26.10)'],
  ['2026-10-27T00:50:00Z', 'iarnă: 02:50 EET → încă ziua de lucru 26.10'],
  ['2026-10-27T01:10:00Z', 'iarnă: 03:10 EET → ziua de lucru 27.10'],
  ['2026-10-24T23:30:00Z', 'noaptea schimbării (Moldova: 03:00 EEST → 02:00 EET, la 00:00 UTC): 02:30 EEST, prima trecere → ziua de lucru 24.10'],
  ['2026-10-25T00:30:00Z', 'noaptea schimbării: 02:30 EET, a doua trecere → tot ziua de lucru 24.10'],
  ['2026-10-25T01:30:00Z', 'noaptea schimbării: 03:30 EET → ziua de lucru 25.10'],
  ['2026-03-29T01:30:00Z', 'primăvara 2027-like (29.03.2026, 03:00 EET → 04:00 EEST): 04:30 EEST'],
  ['2026-12-28T04:15:00Z', 'săpt. ISO 53: 06:15 EET'],
];
const FER = { tur: { s1: [3.5, 7.0], s2: [13.5, 16.0] }, retur: { s1: [15.0, 17.75], s2: [23.0, 25.75] } };
const inF = (h, [a, b]) => { const x = h < 3 ? h + 24 : h; return x >= a && x <= b; };
const sch = (h, sens) => Object.entries(FER[sens]).filter(([, f]) => inF(h, f)).map(([s]) => s)[0] || '—';
const hh = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
console.log('(b)(c) sintetice: moment UTC · caz · Intl ora/zi lucru/schimb · UTC+3 fix ora/zi/schimb');
for (const [t, cz] of T) { const sens = /retur|plecare/.test(cz) ? 'retur' : 'tur';
  console.log(`  ${t} · ${cz} · ${hh(oraLoc(t))} ${ziLucru(t)} ${sch(oraLoc(t), sens)} · ${hh(vechiOra(t))} ${vechiZi(t)} ${sch(vechiOra(t), sens)}`); }
