// cercetare ION-147: pe ce capete din schelet trece fiecare mașină (zile cu trecere ≤ 1,5 km), față de rutele ei din schelet
import { readFileSync } from 'node:fs';
import { ziLucru } from '/root/lde-worker/ora-locala.mjs';
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), PK = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const S = JSON.parse(readFileSync('/root/lde-worker/sebn-schelet.json', 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const cap = S.rute.filter((r) => r.c).map((r) => ({ id: r.id, n: r.capat, lat: r.c[0], lon: r.c[1] }));
for (const M of D.masini) { const zi = new Map(); const zile = new Set(M.zile);
  for (const [t, lat, lon] of M.pts) { const z = ziLucru(t); if (!zile.has(z)) continue; for (const c of cap) if (hav({ lat, lon }, c) <= 1.5) (zi.get(c.id) ?? zi.set(c.id, new Set()).get(c.id)).add(z); }
  const X = PK.masini.find((x) => x.m === M.m); const ale = new Set(M.lista.map((r) => r.id));
  console.log(`${M.m.padEnd(8)} zile ${M.zile.length} · în schelet: ${[...ale].join(',') || '—'} · trece pe la: ${[...zi].sort((a, b) => b[1].size - a[1].size).map(([id, s]) => `${id}${ale.has(id) ? '*' : ''} ${cap.find((c) => c.id === id).n} ${s.size}z`).join(' | ')} · ${X?.locuri?.length ? 'P1 ' + X.locuri[0].n + ' ' + X.economieSapt : X?.motivFara}`); }
for (const X of PK.masini) { const s = X.stat ?? {}; if (s.buclaPoarta) console.log(`bucla ${X.m} ${s.buclaPoarta} goluri ${s.kmBuclaPoarta} km`); }
console.log('bucla total', PK.masini.reduce((a, x) => a + (x.stat?.buclaPoarta ?? 0), 0), 'goluri', PK.masini.reduce((a, x) => a + (x.stat?.kmBuclaPoarta ?? 0), 0).toFixed(1), 'km');
