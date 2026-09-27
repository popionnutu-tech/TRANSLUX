// Care rute în care schimb (Ion, 25.09): din regimul identificat (schimburi-ideal.json), pe fazele A / B ale alternanței săptămânale
// (v3, ION-97: de la ancora 21.09.2026, nu paritatea ISO; pe 2026 A ≡ săptămânile ISO impare, B ≡ pare).
// Regimul din GPS e cel folosit; unde GPS-ul contrazice actul, linia e marcată «≠ act». Scrie date/care-schimb-ideal.json.
import { writeFileSync as __wfs, renameSync as __rn } from 'node:fs';
const scrieAtomic = (f, x) => { __wfs(f + '.tmp', x); __rn(f + '.tmp', f); };   // F3 v5 (R3-1): fără rescriere pe loc
import { readFileSync, writeFileSync } from 'node:fs';
import { ANCORA } from './timp.mjs';
const SH = JSON.parse(readFileSync('../../date/ideal-v3.1/schimburi-ideal.json', 'utf8'));
const S = JSON.parse(readFileSync('../../date/ideal-v3.1/schelet-ideal.json', 'utf8'));
const out = { ancora: ANCORA, A: { s1: [], s2: [] }, B: { s1: [], s2: [] }, neclar: [] };
for (const l of S) { if (l.gps || !l.km) continue; const q = SH[l.ruta + '|' + l.linie]; if (!q) continue;
  const it = { ruta: l.ruta, nr: l.nr, linie: l.linie, capat: l.capat, km: l.km, locuri: l.locuri, grupa: q.grupa, dupaAct: q.dupaAct, regim: q.gps.tip, masini: l.masini.slice(0, 2).map(m => m.m) };
  if (q.gps.tip === 'ambele') { for (const w of ['A', 'B']) for (const s of ['s1', 's2']) out[w][s].push(it); }
  else if (q.gps.tip === 'rotatie') { out.A[q.gps.A].push(it); out.B[q.gps.B].push(it); }
  else if (q.gps.tip === 'doar s1' || q.gps.tip === 'doar s2') { const s = q.gps.tip.slice(-2); out.A[s].push({ ...it, doar: true }); out.B[s].push({ ...it, doar: true }); }
  else out.neclar.push(it); }
for (const w of ['A', 'B']) for (const s of ['s1', 's2']) out[w][s].sort((a, b) => (a.nr || 99) - (b.nr || 99));
scrieAtomic('../../date/ideal-v3.1/care-schimb-ideal.json', JSON.stringify(out));
const f = it => `${it.nr} ${it.linie}${it.regim === 'ambele' ? '' : ''}${it.dupaAct ? '' : ' ≠act'}${it.doar ? ' (doar acest schimb)' : ''}`;
for (const w of ['A', 'B']) for (const s of ['s1', 's2']) console.log(`FAZA ${w} · ${s === 's1' ? 'SCHIMBUL 1 (07:00–15:30)' : 'SCHIMBUL 2 (15:30–00:00)'} — ${out[w][s].length} linii:\n  ` + out[w][s].map(f).join(' · ') + '\n');
console.log('NECLARE: ' + out.neclar.map(f).join(' · '));
