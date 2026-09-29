// km pe zi din urmele Wialon (camioane/date/urme), iunie–10.09.2026; zi UTC (fișierul), fără salturi > 5 km între puncte apropiate în timp
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
const U = '/root/lde-worker/camioane/date/urme';
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b[1] - a[1]) * r, dLon = (b[2] - a[2]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const out = {};
for (const p of readdirSync(U)) { if (p.startsWith('_')) continue; out[p] = {};
  for (const f of readdirSync(`${U}/${p}`)) { const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json\.gz$/); if (!m || m[1] < '2026-06-01') { if (f.endsWith('.e7') && f >= '2026-06') out[p][f.slice(0, 10)] = 'e7'; continue; }
    const P = JSON.parse(zlib.gunzipSync(readFileSync(`${U}/${p}/${f}`))); let km = 0, salt = 0;
    for (let i = 1; i < P.length; i++) { const d = hav(P[i - 1], P[i]), dt = P[i][0] - P[i - 1][0]; if (d > 5 && d / Math.max(dt, 1) * 3600 > 130) { salt += d; continue; } km += d; }
    out[p][m[1]] = { km: Math.round(km * 10) / 10, pct: P.length, salt: Math.round(salt) }; } }
writeFileSync('/tmp/km-wialon.json', JSON.stringify(out)); console.log(Object.keys(out).length, 'camioane');
