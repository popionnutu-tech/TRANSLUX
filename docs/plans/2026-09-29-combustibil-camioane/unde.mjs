// unde era camionul la ora alimentării (urmele Wialon din camioane/date/urme)
import { readFileSync, existsSync } from 'node:fs';
import zlib from 'node:zlib';
const [placa, zi, ...ore] = process.argv.slice(2);
const f = `/root/lde-worker/camioane/date/urme/${placa}/${zi}.json.gz`;
if (!existsSync(f)) { const alt = `/root/lde-worker/camioane/date/urme/${placa}`; console.log(placa, zi, 'fără fișier', existsSync(alt) ? '(dosar există)' : '(fără dosar)'); process.exit(0); }
const P = JSON.parse(zlib.gunzipSync(readFileSync(f)));
console.log(placa, zi, P.length, 'puncte');
for (const o of ore) { const [h, m] = o.split(':').map(Number); const t = Date.UTC(+zi.slice(0, 4), +zi.slice(5, 7) - 1, +zi.slice(8, 10), h - 3, m) / 1000;
  const near = P.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b), P[0]);
  const win = P.filter((p) => Math.abs(p[0] - t) <= 1800);
  console.log(`  ${o} (local): cel mai apropiat punct ${new Date((near[0] + 3 * 3600) * 1000).toISOString().slice(11, 16)} ${near[1].toFixed(5)},${near[2].toFixed(5)} v=${near[3]} · ±30 min: ${win.length} pct, viteza max ${Math.max(0, ...win.map((p) => p[3]))}`); }
