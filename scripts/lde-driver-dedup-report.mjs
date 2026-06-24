import { readFileSync } from 'fs';

// --- load .env ---
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;

// --- fetch all drivers ---
const r = await fetch(`${URL_}/rest/v1/drivers?select=id,full_name,is_lde,active&limit=2000`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const drivers = await r.json();

// --- normalization ---
const stripDia = (s) => s
  .replace(/[ăâàáä]/gi, 'a').replace(/[îíì]/gi, 'i').replace(/[șşс]/gi, 's')
  .replace(/[țţ]/gi, 't').replace(/[éèêë]/gi, 'e').replace(/[óòôö]/gi, 'o')
  .replace(/[úùûü]/gi, 'u');
const norm = (s) => stripDia((s || '').toLowerCase()).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);
const tokenSorted = (s) => tokens(s).slice().sort().join(' ');

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n];
}
const ratio = (a, b) => { const L = Math.max(a.length, b.length); return L === 0 ? 1 : 1 - lev(a, b) / L; };

// token-set: surname-match + first-name/initial compatibility
function nameScore(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  // best: sorted-token Levenshtein ratio (order-insensitive)
  const sortedRatio = ratio(tokenSorted(a), tokenSorted(b));
  // surname heuristic: longest token of each (usual surname) similar + some other token initial match
  const longA = ta.slice().sort((x, y) => y.length - x.length)[0];
  const longB = tb.slice().sort((x, y) => y.length - x.length)[0];
  const surnameSim = ratio(longA, longB);
  // initial overlap: any token of a whose first letter starts a token of b
  const initials = (t) => new Set(t.map((w) => w[0]));
  const ia = initials(ta), ib = initials(tb);
  let initOverlap = 0; for (const c of ia) if (ib.has(c)) initOverlap++;
  const initScore = initOverlap / Math.max(ia.size, ib.size);
  // combined: weight sorted-ratio + surname + initials
  return Math.max(sortedRatio, 0.6 * surnameSim + 0.4 * initScore);
}

const lde = drivers.filter((d) => d.is_lde);
const existing = drivers.filter((d) => !d.is_lde);

const THRESHOLD = 0.72;
const pairs = [];
for (const a of lde) {
  for (const b of existing) {
    if (norm(a.full_name) === norm(b.full_name)) continue; // exact-after-norm = handled elsewhere, but flag separately
    const sc = nameScore(a.full_name, b.full_name);
    if (sc >= THRESHOLD) pairs.push({ score: +sc.toFixed(3), lde: a.full_name, lde_id: a.id, existing: b.full_name, existing_id: b.id });
  }
}
// also exact-after-normalization (different raw spelling, same normalized) — strong dup
const exactNorm = [];
for (const a of lde) for (const b of existing)
  if (norm(a.full_name) === norm(b.full_name))
    exactNorm.push({ lde: a.full_name, lde_id: a.id, existing: b.full_name, existing_id: b.id });

pairs.sort((x, y) => y.score - x.score);

console.log(`drivers total=${drivers.length}  LDE(new)=${lde.length}  existing(non-LDE)=${existing.length}`);
console.log(`\n=== EXACT after normalization (different raw spelling, same person — STRONG) : ${exactNorm.length} ===`);
for (const p of exactNorm) console.log(`  "${p.lde}"  ==  "${p.existing}"`);
console.log(`\n=== FUZZY candidates (score >= ${THRESHOLD}) : ${pairs.length} ===`);
for (const p of pairs) console.log(`  ${p.score}  LDE "${p.lde}"   ≈   existing "${p.existing}"`);
console.log('\n(ids pentru merge, doar pentru perechile confirmate:)');
for (const p of [...exactNorm.map(x=>({...x,score:'exact'})), ...pairs])
  console.log(`  ${String(p.score).padEnd(5)}  lde=${p.lde_id}  existing=${p.existing_id}  | "${p.lde}" -> "${p.existing}"`);
