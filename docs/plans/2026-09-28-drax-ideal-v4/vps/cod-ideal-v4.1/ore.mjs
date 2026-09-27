// Pasul 2a: poarta ferestrelor de ore FER. Din obs-ideal.json (TOATE cursele cu rută, și cele din afara FER), pe lună:
// histograma orei locale a sosirii turului / plecării returului în trepte de 15 min, modurile pe zone, `afara`.
// Reînvățăm FER dacă (a) afara% sept − mediana afara% mai–iulie > 10 pp, sau (b) modul din septembrie se abate cu >30 min
// de la modul aceleiași rulări pe mai–iulie (referința se MĂSOARĂ, nu se ia din comentariu: la ION-45 s1 sosea ~06:12).
import { readFileSync } from 'node:fs';
const O = JSON.parse(readFileSync('../../date/ideal-v4.1/obs-ideal.json', 'utf8'));
const LUNI = ['2026-05', '2026-06', '2026-07', '2026-09'];
const FER = { tur: { s1: [3.5, 7.0], s2: [13.5, 16.0] }, retur: { s1: [15.0, 17.75], s2: [23.0, 25.75] } };
const ZONE = { 'tur s1': ['tur', 3, 10], 'tur s2': ['tur', 12, 17.5], 'retur s1': ['retur', 14, 19.5], 'retur s2': ['retur', 21, 27] };
const med = a => { const q = [...a].sort((x, y) => x - y); const n = q.length; return n ? (n % 2 ? q[(n - 1) / 2] : (q[n / 2 - 1] + q[n / 2]) / 2) : 0; };
const hh = h => { const x = h >= 24 ? h - 24 : h; return `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`; };
const norm = h => h < 3 ? h + 24 : h;
const H = {}; // luna → zona → Map(bin → n)
for (const c of O.curse) { const l = c.zi.slice(0, 7); if (!LUNI.includes(l)) continue; const h = norm(c.ora);
  for (const [z, [sens, a, b]] of Object.entries(ZONE)) if (c.sens === sens && h >= a && h < b) { H[l] ??= {}; H[l][z] ??= new Map(); const bin = Math.floor(h * 4) / 4; H[l][z].set(bin, (H[l][z].get(bin) || 0) + 1); } }
const mod = m => m && m.size ? [...m].sort((a, b) => b[1] - a[1])[0][0] : null;
console.log('afara pe lună (cursele cu rută): ' + LUNI.map(l => O.afara[l] ? `${l} ${Math.round(100 * O.afara[l].afara / O.afara[l].cuRuta)}%` : `${l} —`).join(' · '));
const af = l => O.afara[l] ? 100 * O.afara[l].afara / O.afara[l].cuRuta : null;
const refA = med(['2026-05', '2026-06', '2026-07'].map(af).filter(x => x !== null)), sA = af('2026-09');
const declA = sA !== null && sA - refA > 10;
console.log(`(a) afara sept ${sA?.toFixed(1)}% − mediana mai–iul ${refA.toFixed(1)}% = ${(sA - refA).toFixed(1)} pp → ${declA ? 'DECLANȘAT' : 'ok'}`);
let declB = false; const abateri = [];
for (const [z, [sens, a, b]] of Object.entries(ZONE)) {
  const moduri = Object.fromEntries(LUNI.map(l => [l, mod(H[l]?.[z])]));
  const ref = med(['2026-05', '2026-06', '2026-07'].map(l => moduri[l]).filter(x => x !== null)), s = moduri['2026-09'];
  const d = s !== null ? Math.round((s - ref) * 60) : null;
  const fer = FER[sens][z.split(' ')[1]];
  const tot = LUNI.map(l => [...(H[l]?.[z] || [])].reduce((k, [, n]) => k + n, 0));
  const margine = LUNI.map((l, i) => { const m = H[l]?.[z]; if (!m || !tot[i]) return '—'; let n = 0; for (const [bin, k] of m) if (Math.abs(bin - fer[0]) <= 0.5 || Math.abs(bin - fer[1]) <= 0.5) n += k; return Math.round(100 * n / tot[i]) + '%'; });
  console.log(`\n${z}  FER [${hh(fer[0])}–${hh(fer[1])}]  moduri: ` + LUNI.map(l => `${l} ${moduri[l] !== null ? hh(moduri[l]) : '—'} (${tot[LUNI.indexOf(l)]})`).join(' · ') + `  · sept − ref(mai–iul ${hh(ref)}) = ${d ?? '—'} min · la <30 min de margini: ${margine.join(' ')}`);
  for (const l of LUNI) { const m = H[l]?.[z]; if (!m) continue; const t = tot[LUNI.indexOf(l)];
    console.log(`   ${l}: ` + [...m].sort((p, q) => p[0] - q[0]).filter(([, n]) => n >= 0.02 * t).map(([bin, n]) => `${hh(bin)} ${n}`).join('  ')); }
  if (d !== null && Math.abs(d) > 30) { declB = true; abateri.push(`${z}: ${d > 0 ? '+' : ''}${d} min (deplasare fereastră ${hh(fer[0] + d / 60)}–${hh(fer[1] + d / 60)})`); }
}
console.log(`\n(b) moduri sept față de mai–iul >30 min: ${declB ? 'DECLANȘAT — ' + abateri.join('; ') : 'ok'}`);
console.log(`\nDECIZIE: ${declA || declB ? 'FER DE REÎNVĂȚAT (deplasare, aceeași lățime) → editează FER în etalon.mjs și rulează din nou pasul 2' : 'FER rămâne'}`);
