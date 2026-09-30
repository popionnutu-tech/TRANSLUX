// ION-150 — numele localităților pentru harta cisternelor (MD + RO + UA + BG, OSM), compactate: [nume, lat, lon].
// Sursa: ~/dev/camioane-schelet/date/loc-*.geojsonseq (ION-69). Rulare pe mini: node loc-compact.mjs → date/loc-4tari.json, apoi scp pe VPS.
import fs from 'node:fs';
const CS = process.env.CAMIOANE_SCHELET || '/Users/ionpop/dev/camioane-schelet';
const out = [];
for (const t of ['moldova', 'romania', 'ukraine', 'bulgaria']) {
  for (const l of fs.readFileSync(`${CS}/date/loc-${t}.geojsonseq`, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const f = JSON.parse(l.replace(/^\x1e/, '')); const p = f.properties ?? {};
    if (!/^(city|town|village)$/.test(p.place ?? '')) continue;
    const n = p['name:ro'] ?? p['name:en'] ?? p.name; if (!n) continue;
    const [lon, lat] = f.geometry.coordinates;
    out.push([n, +lat.toFixed(4), +lon.toFixed(4)]);
  }
}
fs.mkdirSync(new URL('./date/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./date/loc-4tari.json', import.meta.url), JSON.stringify(out));
console.log(out.length, 'localități');
