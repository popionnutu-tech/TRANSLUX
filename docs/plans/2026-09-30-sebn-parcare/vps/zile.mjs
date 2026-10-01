import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync(process.argv[2], 'utf8')); const t = new Map(), n = new Map();
for (const M of D.masini) for (const [z, k] of Object.entries(M.kmZi)) { t.set(z, (t.get(z) ?? 0) + k); if (k > 20) n.set(z, (n.get(z) ?? 0) + 1); }
console.log(D.saptamina, [...t].sort().map(([z, k]) => `${z.slice(5)} ${Math.round(k)} km/${n.get(z) ?? 0} maș.`).join(' · '));
