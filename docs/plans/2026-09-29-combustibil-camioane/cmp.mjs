import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync('date.json', 'utf8')), W = JSON.parse(readFileSync('km-wialon.json', 'utf8'));
const pl = new Map(D.veh.map((v) => [v.id, v.plate_number]));
const aug = (z) => z >= '2026-08-01' && z <= '2026-08-31';
const P = {}; for (const g of D.gps) { if (!aug(g.date)) continue; const m = pl.get(g.vehicle_id); (P[m] ??= {})[g.date] = { tot: +g.km_total, pat: +g.km_patched || 0 }; }
const rows = [];
for (const m of new Set([...Object.keys(P), ...Object.keys(W)])) {
  const w = W[m] ?? {}; let kw = 0, kp = 0, kpr = 0, zw = 0, e7 = 0, dif = [];
  for (let d = 1; d <= 31; d++) { const z = `2026-08-${String(d).padStart(2, '0')}`; const a = w[z], b = P[m]?.[z];
    if (a === 'e7') e7++; else if (a) { kw += a.km; if (a.km > 20) zw++; }
    if (b) { kp += b.tot; kpr += Math.max(0, b.tot - b.pat); }
    const aw = a && a !== 'e7' ? a.km : 0, bp = b ? b.tot - b.pat : 0; if (Math.abs(aw - bp) > 80) dif.push(`${d}:${Math.round(aw)}/${Math.round(bp)}`); }
  rows.push({ m, kw: Math.round(kw), kp: Math.round(kp), kpr: Math.round(kpr), zw, e7, dif });
}
rows.sort((a, b) => b.kw - a.kw);
for (const r of rows) console.log(`${r.m.padEnd(7)} Wialon ${String(r.kw).padStart(5)} · tabel ${String(r.kp).padStart(5)} (fără cârpit ${String(r.kpr).padStart(5)}) · zile Wialon cu drum ${r.zw}${r.e7 ? ` · fără drept Wialon ${r.e7} zile` : ''} · zile diferite >80 km: ${r.dif.join(' ')}`);
