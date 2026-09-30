// ION-150 cercetare: cât costă locul unde stă cisterna (≥ 8 h) față de drumul direct, și locul optim P1/P2.
// Drumuri pe șosea: Valhalla 4 țări pe mini (127.0.0.1:8003), truck 40 t hazmat, fără bac. Doar citire.
import fs from 'node:fs';
const S = new URL('.', import.meta.url).pathname;
const CS = '/Users/ionpop/dev/camioane-schelet';
const O = JSON.parse(fs.readFileSync(S + 'opriri.json', 'utf8'));
const SK = JSON.parse(fs.readFileSync(CS + '/verif-vps/date/verificare-schelet.json', 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const PROFIL = { hazmat: true, use_ferry: 0, weight: 40, axle_load: 10, height: 4.0, width: 2.55, length: 16.5 };
const CIST = new Set(['ANT344', 'ANT347', 'HMK135', 'HMK139', 'IIC263', 'KWX620', 'KYK742', 'LJN076', 'LJN080', 'MOW214', 'RWN169', 'RWN193', 'DKE248', 'LML973']);
const L0 = '2026-08-31T21', L1 = '2026-09-29T21';
const PARCARE_MIN = 480, SAPT_MIN = 1440;
const LOC = [];
for (const t of ['moldova', 'romania', 'ukraine', 'bulgaria']) for (const l of fs.readFileSync(`${CS}/date/loc-${t}.geojsonseq`, 'utf8').split('\n')) {
  if (!l.trim()) continue; const f = JSON.parse(l.replace(/^\x1e/, '')); const p = f.properties; const n = p['name:ro'] ?? p.name; if (!n || !p.place) continue;
  LOC.push({ n, place: p.place, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
}
const numeLoc = (s) => { let b = null, d = 1e9; for (const l of LOC) { const x = hav(s, l); if (x < d) { d = x; b = l; } } return b ? b.n : '?'; };
const pct = (n) => SK.puncte.find((p) => p.name === n);

// ── cache Valhalla (matrice) ──
const CF = S + 'valhalla-cache.json';
const cache = fs.existsSync(CF) ? JSON.parse(fs.readFileSync(CF, 'utf8')) : {};
const k4 = (p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
async function perechi(lista) {
  const lipsa = [...new Map(lista.filter(([x, y]) => hav(x, y) >= 0.3 && !(`${k4(x)}|${k4(y)}` in cache)).map((p) => [`${k4(p[0])}|${k4(p[1])}`, p])).values()];
  let i = 0;
  const lucreaza = async () => { while (i < lipsa.length) { const [x, y] = lipsa[i++];
    let d = null; try { const r = await fetch('http://127.0.0.1:8003/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: [{ lat: x.lat, lon: x.lon }, { lat: y.lat, lon: y.lon }], costing: 'truck', costing_options: { truck: PROFIL }, units: 'kilometers' }), signal: AbortSignal.timeout(120000) }); const j = await r.json(); if (r.ok) d = j.trip.summary.length; } catch {}
    cache[`${k4(x)}|${k4(y)}`] = d; } };
  await Promise.all(Array.from({ length: 6 }, lucreaza));
  fs.writeFileSync(CF, JSON.stringify(cache)); console.log('rute noi', lipsa.length);
}
const V = (a, b) => (hav(a, b) < 0.3 ? 0 : cache[`${k4(a)}|${k4(b)}`] ?? null);

// ── picioarele: gol (ultima descărcare → încărcarea următoare) și plin (încărcare → prima descărcare); tăiate la opririle
//    de lucru (punct din dispecerat ≥ 15 min, nu vamă/tranzit). Pe fiecare picior: parcările ≥ 8 h în afara punctelor. ──
const picioare = [];
for (const m of O.masini) {
  if (!CIST.has(m.placa)) continue;
  const seg = [];
  for (const g of m.goluri) if (g.pana >= L0 && g.pana < L1) seg.push({ tip: 'gol', i0: g.iStart, i1: g.iEnd, a: g.a, b: g.b, spre: g.spre, km: g.kmBrut });
  for (const c of m.curse) {
    const d0 = c.descarcari[0]; if (!d0 || d0.sosire < L0 || d0.sosire >= L1) continue;
    const opD = m.opriri.find((o) => o.punct === d0.nume && Math.abs(Date.parse(o.sosire) - Date.parse(d0.sosire)) < 3600000);
    seg.push({ tip: 'plin', i0: c.iStart, i1: opD ? opD.i0 : null, a: pct(c.inc), b: pct(d0.nume), spre: d0.nume, tSf: d0.sosire, marfa: c.marfa });
  }
  for (const s of seg) {
    const inS = m.opriri.filter((o) => o.i0 > s.i0 && (s.i1 == null ? o.sosire < s.tSf : o.i1 < s.i1));
    const ancore = [{ lat: s.a.lat, lon: s.a.lon, lucru: true }];
    for (const o of inS) {
      const lucru = o.kind && !/^(vama|tranzit)/.test(o.kind);
      if (lucru) ancore.push({ lat: o.lat, lon: o.lon, lucru: true, n: o.punct });
      else if (o.min >= PARCARE_MIN) ancore.push({ lat: o.lat, lon: o.lon, lucru: false, min: o.min, n: o.punct ?? numeLoc(o), vama: !!o.kind });
    }
    ancore.push({ lat: s.b.lat, lon: s.b.lon, lucru: true });
    // sub-picioare între două ancore de lucru consecutive, cu parcările dintre ele
    let st = 0;
    for (let j = 1; j < ancore.length; j++) {
      if (!ancore[j].lucru) continue;
      const parc = ancore.slice(st + 1, j);
      if (parc.length) picioare.push({ placa: m.placa, tip: s.tip, spre: s.spre, a: ancore[st], b: ancore[j], parc });
      st = j;
    }
  }
}

// ── candidații: punctele fixe, locurile unde flota deja stă ≥ 8 h (cluster 3 km, ≥ 2 opriri), orașele OSM ≤ 15 km de capete ──
const cand = [];
const adauga = (c) => { if (!cand.some((x) => hav(x, c) < 2)) cand.push(c); };
for (const n of ['Bază Briceni', 'Bază Bălți', 'Bază Chișinău — stație Bacioi', 'Bază Chișinău — stație Meșterul Manole', 'Vama Albița–Leușeni', 'Vama Giurgiulești', 'Port Constanța — încărcare diesel', 'Rafinăria Petromidia — Năvodari', 'Bază Berdichev — încărcare biodiesel']) { const p = pct(n); adauga({ lat: p.lat, lon: p.lon, n, fel: 'punct' }); }
const toate = picioare.flatMap((p) => p.parc.filter((x) => !x.vama));
for (const x of toate) { const vec = toate.filter((y) => hav(x, y) <= 3); if (vec.length >= 2) adauga({ lat: x.lat, lon: x.lon, n: x.n, fel: 'stă deja' }); }
for (const l of LOC) if ((l.place === 'town' || l.place === 'city') && picioare.some((p) => hav(p.a, l) <= 15 || hav(p.b, l) <= 15)) adauga({ lat: l.lat, lon: l.lon, n: l.n, fel: l.place });

const capete = [...new Map(picioare.flatMap((p) => [p.a, p.b]).map((x) => [k4(x), x])).values()];
const parcari = [...new Map(picioare.flatMap((p) => p.parc).map((x) => [k4(x), x])).values()];
const cere = [];
const util = (p, c) => hav(p.a, c) + hav(c, p.b) <= hav(p.a, p.b) * 1.25 + 40;
for (const p of picioare) { const lant = [p.a, ...p.parc, p.b]; for (let j = 1; j < lant.length; j++) cere.push([lant[j - 1], lant[j]]); cere.push([p.a, p.b]);
  for (const c of cand) if (util(p, c)) { cere.push([p.a, c]); cere.push([c, p.b]); } }
await perechi(cere);

// ── pe picior: real = V(a, p1) + V(p1, p2) … + V(pn, b); direct = V(a, b); prin loc P = V(a,P) + V(P,b) ──
for (const p of picioare) {
  const lant = [p.a, ...p.parc, p.b]; let real = 0; for (let j = 1; j < lant.length; j++) { const d = V(lant[j - 1], lant[j]); if (d == null) { real = null; break; } real += d; }
  p.real = real == null ? null : +real.toFixed(1); p.direct = V(p.a, p.b); p.ocol = p.real != null && p.direct != null ? +(p.real - p.direct).toFixed(1) : null;
  p.sapt = p.parc.some((x) => x.min >= SAPT_MIN);
  p.prin = cand.map((c) => { if (!util(p, c)) return null; const x = V(p.a, c), y = V(c, p.b); return x == null || y == null ? null : +(x + y).toFixed(1); });
}
// ── alegerea pe mașină: P1 = locul unic cu Σ min; P2 doar dacă scade ≥ 20 km/lună și e folosit la ≥ 2 picioare; loc 0 = rămâne cum e ──
const alege = (lista) => {
  const cost = (ids) => lista.reduce((s, p) => { const best = Math.min(...ids.map((i) => p.prin[i] ?? Infinity)); return s + Math.min(p.real, best < p.real - Math.max(2, p.real * 0.05) ? best : p.real); }, 0);
  const real = lista.reduce((s, p) => s + p.real, 0);
  let b1 = null; for (let i = 0; i < cand.length; i++) { const c = cost([i]); if (!b1 || c < b1.c) b1 = { ids: [i], c }; }
  let b2 = b1; for (let i = 0; i < cand.length; i++) if (i !== b1.ids[0]) { const c = cost([b1.ids[0], i]); if (c < b2.c) b2 = { ids: [b1.ids[0], i], c }; }
  const ales = b1.c - b2.c >= 20 && lista.filter((p) => p.prin[b2.ids[1]] != null && p.prin[b2.ids[1]] < Math.min(p.real, p.prin[b2.ids[0]] ?? Infinity)).length >= 2 ? b2 : b1;
  return { real: +real.toFixed(1), propus: +ales.c.toFixed(1), economie: +(real - ales.c).toFixed(1), locuri: ales.ids.map((i) => `${cand[i].n} (${cand[i].fel})`) };
};
const rez = [];
for (const placa of [...new Set(picioare.map((p) => p.placa))].sort()) {
  const L = picioare.filter((p) => p.placa === placa && p.real != null);
  const A = alege(L), B = L.some((p) => !p.sapt) ? alege(L.filter((p) => !p.sapt)) : null;
  rez.push({ placa, picioare: L.length, ore: Math.round(L.reduce((s, p) => s + p.parc.reduce((a, x) => a + x.min, 0), 0) / 60), ocol: +L.reduce((s, p) => s + (p.ocol ?? 0), 0).toFixed(1), A, B });
}
fs.writeFileSync(S + 'parcare.json', JSON.stringify({ cand, picioare, rez }, null, 1));
console.log('candidați', cand.length, '| picioare cu parcare ≥ 8 h', picioare.length);
for (const p of picioare) console.log(p.placa, p.tip, `→ ${p.spre.replace(/ — .*/, '')}`, '| parcări:', p.parc.map((x) => `${x.n} ${Math.round(x.min / 60)}h`).join(', '), '| direct', p.direct?.toFixed(0), 'prin parcări', p.real?.toFixed(0), 'ocol', p.ocol, p.sapt ? '(≥24h)' : '');
console.log('\nplaca | picioare | ore parcate | ocol real | A: toate parcările (economie, locuri) | B: doar sub 24 h');
for (const r of rez) console.log(r.placa, r.picioare, r.ore + 'h', 'ocol', r.ocol, '| A', r.A.economie, r.A.locuri.join(' + '), '| B', r.B ? `${r.B.economie} ${r.B.locuri.join(' + ')}` : '—');
const sum = (f) => rez.reduce((s, r) => s + (f(r) ?? 0), 0).toFixed(0);
console.log('TOTAL ocol', sum((r) => r.ocol), 'economie A', sum((r) => r.A.economie), 'economie B', sum((r) => r.B?.economie));
