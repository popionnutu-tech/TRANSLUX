// ION-99: de ce 34 de curse nu se refac exact (doar citire): timestamp-uri duble în urmă, puncte în poartă în interval
import { readFileSync } from 'node:fs';
const DIR = '/root/lde-worker/drax/date/ideal-v3.1';
const U = JSON.parse(readFileSync(`${DIR}/urme-gol.json`, 'utf8')).urme;
const R = JSON.parse(readFileSync(`${DIR}/carpire-raport.json`, 'utf8'));
const nmea = v => { const d = Math.floor(v / 100); return d + (v - d * 100) / 60; };
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const PORTI = [{ n: 'EST', lat: 47.78513, lon: 27.94307, r: 0.6 }, { n: 'VEST', lat: 47.77408, lon: 27.91593, r: 0.5 }];
for (const s of R.statistica.nepotrivite.slice(0, 34)) { const k = s.split(':').slice(0, 3).join(':'); const u = U[k]; if (!u) { console.log('lipsă', k); continue; }
  const ts = u.map(r => r[0]); const dup = ts.length - new Set(ts).size;
  const P = u.map(r => ({ lat: nmea(+r[1]), lon: nmea(+r[2]), t: r[0] }));
  const inP = P.filter(p => PORTI.some(g => hav(p, g) <= g.r)).length;
  const inv = P.filter(p => !(p.lat > 45 && p.lat < 49 && p.lon > 26 && p.lon < 31)).length;
  console.log(k, 'puncte', u.length, 'dubluri timp', dup, 'în poartă', inP, 'invalide', inv, '|', s.split(': ').slice(1).join(': ').slice(0, 60)); }
