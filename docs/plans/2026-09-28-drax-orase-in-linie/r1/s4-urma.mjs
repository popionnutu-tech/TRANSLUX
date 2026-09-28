// ION-124 r1 · s4: urma brută a unei mașini între două ore locale + opririle din urme (diagnostic).
// node s4-urma.mjs 830MUM 2026-09-14 05:25 06:10
import fs from 'fs';
const [m, z, a, b] = process.argv.slice(2);
const U = JSON.parse(fs.readFileSync(`/root/lde-worker/drax/date/saptamanal/2026-09-14/economie-urme/${m}/${z}.json`, 'utf8'));
const f = new Intl.DateTimeFormat('ro', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const hm = (t) => f.format(new Date(t));
const hav = (p, q) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((q.lat - p.lat) * r / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin((q.lon - p.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
let km = 0, prev = null;
for (const p of U.pts) { if (p.t == null || p.lat == null) continue; const h = hm(p.t).slice(0, 5); if (h < a || h > b) { prev = null; continue; } if (prev) km += hav(prev, p); prev = p;
  console.log(hm(p.t), p.lat.toFixed(5), p.lon.toFixed(5), String(Math.round(p.v)).padStart(3), km.toFixed(2)); }
console.log('--- opriri');
for (const o of U.opriri) { const h = hm(o.t0).slice(0, 5); if (h >= a && h <= b) console.log(hm(o.t0), hm(o.t1), o.lat, o.lon, o.sec, Math.round((o.t1 - o.t0) / 1000)); }
