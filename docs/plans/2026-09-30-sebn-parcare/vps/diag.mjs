// cercetare ION-147: km pe zi (weekend), golurile poartă→poartă (unde merge), mașinile fără propunere
import { readFileSync } from 'node:fs';
import { local, ziLucru } from '/root/lde-worker/ora-locala.mjs';
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')), PK = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const LOC = []; for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) { if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  if (!/^(village|town|city|hamlet|suburb|neighbourhood)$/.test(g.properties?.place ?? '')) continue; const [lon, lat] = g.geometry.coordinates; if (lat > 46.6 && lat < 48.2 && lon > 27.6 && lon < 29.6) LOC.push({ n: g.properties.name, lat, lon }); }
const nume = (p) => { let b = null, d = 1e9; for (const s of LOC) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 1.5 ? b : `${b}(${d.toFixed(1)})`; };
const ora = (t) => local(t).toISOString().slice(11, 16);
console.log('== km pe zi (luni..duminică) și zile în dump');
const zile = ['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'];
let tot = zile.map(() => 0);
for (const M of D.masini) { const k = zile.map((z) => M.kmZi[z] ?? 0); k.forEach((x, i) => tot[i] += x); console.log(`${M.m.padEnd(8)} ${M.uzina.padEnd(13)} ${k.map((x) => String(Math.round(x)).padStart(5)).join('')} · casa ${M.casa} · rute ${M.lista.map((r) => r.id + ' ' + r.capat).join(', ') || '— (nu e în schelet)'}`); }
console.log(`TOTAL                  ${tot.map((x) => String(Math.round(x)).padStart(5)).join('')}`);
console.log('\n== golurile poartă → poartă (≥ 60 min): cel mai depărtat punct și staționarea cea mai lungă');
let n = 0, km = 0; const unde = new Map();
for (const X of PK.masini) { const M = D.masini.find((m) => m.m === X.m); const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v }));
  for (const l of X.legi ?? []) { if (!(l.aN?.startsWith('poarta') && l.bN?.startsWith('poarta'))) continue;
    const Q = P.filter((p) => p.t >= l.t0 && p.t <= l.t1); let far = Q[0], df = 0; for (const p of Q) { const d = hav(p, M.poarta); if (d > df) { df = d; far = p; } }
    // staționarea cea mai lungă (≤ 0,3 km)
    let best = null, a0 = 0; for (let i = 1; i <= Q.length; i++) { if (i === Q.length || hav(Q[a0], Q[i]) > 0.3) { const d = Q[i - 1].t - Q[a0].t; if (!best || d > best.d) best = { d, p: Q[a0] }; a0 = i; } }
    n++; km += l.real; const k = nume(far); unde.set(k, (unde.get(k) ?? 0) + 1);
    console.log(`  ${X.m} ${l.z} ${l.ora} real ${l.real} · cel mai departe ${nume(far)} ${df.toFixed(1)} km de poartă · stă ${Math.round((best?.d ?? 0) / 60e3)} min la ${best ? nume(best.p) : '—'} (${best ? hav(best.p, M.poarta).toFixed(1) : '—'} km de poartă) · loc ${l.loc} → ${l.km}`); } }
console.log(`  total ${n} goluri, ${km.toFixed(1)} km real; cel mai departe: ${[...unde].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log('\n== mașinile fără propunere: excursiile (ieșire din poartă → întoarcere), cel mai depărtat sat, pe zile');
for (const X of PK.masini.filter((x) => !x.locuri.length)) { const M = D.masini.find((m) => m.m === X.m); const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v }));
  console.log(`-- ${X.m}: ${X.motivFara}`);
  // opririle ≥ 2 h (unde doarme / stă) și cel mai depărtat punct între două atingeri de poartă
  let lastG = null, far = null, df = 0; const ex = [];
  for (const p of P) { const d = hav(p, M.poarta); if (d <= (M.rPoarta ?? 0.7)) { if (lastG && far && df > 3) ex.push(`${ziLucru(lastG.t).slice(5)} ${ora(lastG.t)}–${ora(p.t)} ${nume(far)} ${df.toFixed(0)}km`); lastG = p; far = null; df = 0; } else if (d > df) { df = d; far = p; } }
  console.log('   ' + ex.slice(0, 14).join(' | '));
}
