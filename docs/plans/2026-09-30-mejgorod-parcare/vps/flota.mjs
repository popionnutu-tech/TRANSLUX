// ION-149 cercetare: controlul flotei — cursele fără urmă (motivul) și capetele reale (modul E/S) pe rută, săptămâna 21–27.09
import { readFileSync } from 'node:fs';
const B = '/root/lde-worker/mejgorod-parcare/cercetare/date/';
const D = JSON.parse(readFileSync(B + 'curse-c.json', 'utf8'));
const O = JSON.parse(readFileSync(B + 'masoara.json', 'utf8'));
for (const c of D.curse) if (c.motiv && c.z >= '2026-09-21' && c.z <= '2026-09-27') console.log(`fără urmă: ${c.m} ${c.z} ruta ${c.r} ${c.s} — ${c.motiv}`);
console.log('fără tracker:', D.faraTracker.join(', ') || '—');
// capătul real al returului (E după retur) și startul real al turului (S înainte de tur), pe rută
const E = {}, S = {};
for (const r of O) for (const g of r.goluri) {
  const [ra, sa] = g.dupa.split(' '), [rb, sb] = g.inainte.split(' ');
  if (sa === 'retur') (E[ra] ??= []).push(g.E.n); if (sb === 'tur') (S[rb] ??= []).push(g.S.n);
}
const top = (a) => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; return Object.entries(c).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([n, k]) => `${n} ${k}`).join(', '); };
const I = JSON.parse(readFileSync(B + 'ideal.json', 'utf8'));
for (const x of I) console.log(`ruta ${String(x.ruta).padStart(2)} capăt grafic ${x.capNord.padEnd(18)} · returul se termină: ${top(E[x.ruta] ?? [])} · turul pornește: ${top(S[x.ruta] ?? [])}`);
