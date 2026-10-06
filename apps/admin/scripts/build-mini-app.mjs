// Bundle-ul mini app-ului șoferului (ION-271, planul «Telegram ultrafast» P1): app.js + logica.js → UN fișier ESM minificat,
// cu hash de conținut în nume (cache nemuritor), + logo-ul ca WebP; `dist/manifest.json` îl citește route.ts. Rulează la
// `prebuild` și `predev` (apps/admin/package.json). Sursele rămân în public/mini-app/bilete/ (testele le importă de acolo).
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAD, 'public', 'mini-app', 'bilete');
const DIST = path.join(SRC, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const r = await build({
  entryPoints: [path.join(SRC, 'app.js')], bundle: true, minify: true, format: 'esm', target: 'es2020', write: false,
  legalComments: 'none', sourcemap: false,
});
const js = r.outputFiles[0].contents;
const h = createHash('sha256').update(js).digest('hex').slice(0, 10);
const jsNume = `app-${h}.js`;
fs.writeFileSync(path.join(DIST, jsNume), js);

// Logo: PNG 42 KB → WebP cu alfa (sharp e în node_modules prin panou/bot). Dacă sharp lipsește, rămâne PNG-ul.
let logoNume = null;
try {
  const sharp = (await import('sharp')).default;
  const webp = await sharp(path.join(SRC, 'logo-white.png')).resize({ width: 660 }).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
  logoNume = `logo-${createHash('sha256').update(webp).digest('hex').slice(0, 10)}.webp`;
  fs.writeFileSync(path.join(DIST, logoNume), webp);
} catch (e) {
  console.warn('[mini-app] logo WebP sărit:', e instanceof Error ? e.message : e);
}

const manifest = { app: jsNume, logo: logoNume ? logoNume : null, generat: new Date().toISOString() };
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest));
console.log(`[mini-app] ${jsNume} (${(js.length / 1024).toFixed(1)} KB)${logoNume ? `, ${logoNume}` : ''}`);
