// ION-268 — CONTROALE ÎNAINTE DE CIFRE (lde_uzine.reguli_livrare, K.1–K.9; Ion, 07.10.2026: «cum să facem pe viitor să nu repeți greșelile»).
// Modulul comun, lângă schelet-intai.mjs: rulează pe IEȘIREA lanțului (nu recalculează lanțul, verifică independent din urmă și din Valhalla)
// și spune ok / lista cazurilor. K.9: orice control picat = raportul și posterul nu pleacă; cazurile merg la ADMIN ca «de verificat».
//   node control.mjs lear <dump.json> <parcare.json> <harta.json> [--out control.json]
//   node control.mjs briceni <curse-sub.json> [--out control.json]
//   node control.mjs mejgorod <harta-out.json> [--out control.json]
// Ieșire: cod 0 = ok, 3 = control picat (fișierul --out are { ok, uzina, saptamina, cazuri[], avertismente[] }).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PARAM_SI, acoperire, hav, r1, oraL, fereastraAbs } from './schelet-intai.mjs';

const [FEL, ...rest] = process.argv.slice(2);
const OUT = (() => { const i = rest.indexOf('--out'); return i >= 0 ? rest[i + 1] : null; })();
const ARG = rest.filter((x, i) => x !== '--out' && rest[i - 1] !== '--out');
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const cazuri = [], avert = [], deVerificat = [];
const caz = (k, text, extra = {}) => cazuri.push({ k, text, ...extra });
// K.3 / K.10: nu opresc raportul; mașina și ziua se dau ADMIN-ului «de verificat», iar recomandarea sprijinită pe ele se marchează
const verif = (k, text, extra = {}) => deVerificat.push({ k, text, ...extra });
const dupaFel = { lear, briceni, mejgorod };
if (!dupaFel[FEL]) { console.error('control.mjs lear|briceni|mejgorod …'); process.exit(2); }
const meta = await dupaFel[FEL](...ARG);
const rez = { ok: cazuri.length === 0, fel: FEL, ...meta, rulat: new Date().toISOString(), cazuri, deVerificat, avertismente: avert };
if (OUT) writeFileSync(OUT, JSON.stringify(rez, null, 1));
console.log(`control ${FEL} ${meta.uzina ?? ''} ${meta.saptamina ?? ''}: ${rez.ok ? 'OK' : `PICAT — ${cazuri.length} cazuri`} · de verificat ${deVerificat.length} · avertismente ${avert.length}`);
for (const c of cazuri.slice(0, 30)) console.log(`  ✗ ${c.k} ${c.text}`);
for (const c of deVerificat.slice(0, 30)) console.log(`  ? ${c.k} ${c.text}`);
for (const a of avert.slice(0, 15)) console.log(`  ⚠ ${a}`);
process.exit(rez.ok ? 0 : 3);

// ───────────────────────── LEAR (Ungheni / Florești) ─────────────────────────
async function lear(fDump, fPark, fHarta) {
  const D = J(fDump), PK = J(fPark), H = J(fHarta);
  const G = { lat: D.poarta.lat, lon: D.poarta.lon }, RP = PARAM_SI.R_POARTA + 0.3;
  const dm = new Map(D.masini.filter((M) => M.m).map((M) => [M.m, M]));
  // K.6 unitatea fără plăcuță: avertisment (lanțul o scoate la citire)
  const faraPl = D.masini.filter((M) => !String(M.m ?? '').trim()).length; if (faraPl) avert.push(`K.6 ${faraPl} unitate(i) fără plăcuță în dump — scoase`);
  const puncte = (M) => M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v })).sort((a, b) => a.t - b.t);
  // Valhalla din cache-ul lanțului (fără cereri noi): km pe șosea între două puncte, × 1,05 ca parcarea; null dacă nu e în cache
  const CF = process.env.LEAR_PARCARE_CACHE || '/root/lde-worker/lear-parcare/drum-cache.json';
  const C = existsSync(CF) ? J(CF) : {}, kc = (a, b) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
  const V = (a, b) => (hav(a, b) < 0.3 ? hav(a, b) : C[kc(a, b)] != null ? C[kc(a, b)] * 1.05 : null);
  const SCH = J(process.env.LEAR_SCHELET_F || (D.uzina === 'LEAR_FLORESTI' ? '/root/lde-worker/floresti-schelet.json' : '/root/lde-worker/lear-schelet.json'));
  const RUTE = new Map(SCH.rute.map((r) => [r.id, { id: r.id, km: r.etalon, tur: r.g?.tur?.plin ?? [], retur: r.g?.retur?.plin ?? [] }]));
  const ferestre = D.ferestre ?? [], NOPTI = [];
  for (const x of PK.masini) {
    const M = dm.get(x.m); if (!M) continue; const P = puncte(M), casa = M.casaC ? { lat: M.casaC[0], lon: M.casaC[1] } : null;
    const minLa = (t0, t1, c, r) => { let s = 0; for (let i = 1; i < P.length; i++) { if (P[i].t <= t0 || P[i - 1].t >= t1) continue; if (hav(P[i], c) <= r) s += Math.min(60, (P[i].t - P[i - 1].t) / 60e3); } return s; };
    // K.1 pauza «acasă» doar dacă a stat mai mult acasă decât la poartă
    for (const p of x.pauze?.lista ?? []) { const l = (x.legi ?? []).find((q) => q.z === p.z && q.ora === p.ora); if (!l || !casa) continue;
      const mC = minLa(l.t0, l.t1, casa, 2), mP = Math.max(minLa(l.t0, l.t1, G, RP), l.acum && hav(l.acum, G) <= RP ? l.acum.min ?? 0 : 0);
      if (mP >= mC) caz('K.1', `${x.m} ${p.z} ${p.ora}: pauza socotită acasă, dar a stat ${Math.round(mP)} min la poartă față de ${Math.round(mC)} min acasă`, { m: x.m, z: p.z }); }
    // K.2 locul propus comparat pe șosea cu poarta și cu locul de acum; ocolul separat
    if (x.locuri?.length && !x.laUzina && !x.locuri.every((q) => q.fel === 'uzina' || /poarta/.test(q.n))) { let sumAles = 0, sumPoarta = 0, complet = true;
      for (const l of x.legi ?? []) { if (!(l.loc > 0)) continue; const E = { lat: l.a[0], lon: l.a[1] }, S = { lat: l.b[0], lon: l.b[1] }, vp = V(E, G) != null && V(G, S) != null ? V(E, G) + V(G, S) : null;
        if (vp == null) { complet = false; continue; } sumAles += l.km; sumPoarta += vp; }
      if (complet && sumAles > 0 && sumPoarta <= sumAles * 1.05) caz('K.2', `${x.m}: locul propus ${x.locuri.map((q) => q.n).join(' + ')} (${r1(sumAles)} km pe șosea) nu bate poarta (${r1(sumPoarta)} km) — trebuia «rămâne la uzină»`, { m: x.m }); }
    for (const l of x.legi ?? []) {
      if (l.realGps != null && l.real > l.realGps + 0.15) caz('K.2', `${x.m} ${l.z} ${l.ora}: baza parcării (${l.real}) peste km GPS (${l.realGps})`, { m: x.m });
      if (l.loc > 0 && l.km > l.real + 0.15) caz('K.2', `${x.m} ${l.z} ${l.ora}: propus ${l.km} km peste drumul de acum ${l.real}`, { m: x.m });
      if (l.realGps == null) caz('K.2', `${x.m} ${l.z} ${l.ora}: drumul n-are baza pe șosea (realGps lipsă) — ocolul nu e despărțit`, { m: x.m }); }
    // K.5 tur = retur pe planul zilei; K.3 cursele lipsă / neconfirmate cu mașina la poartă în fereastră → re-verificare pe urmă
    for (const z of x.plan?.zile ?? []) {
      for (const sc of [1, 2]) { const T = z.curse.find((c) => c.schimb === sc && c.sens === 'tur'), R = z.curse.find((c) => c.schimb === sc && c.sens === 'retur');
        if (T?.statut === 'facuta' && R?.statut === 'facuta' && !T.schimbCu && !R.schimbCu && (T.ruta !== R.ruta || Math.abs((T.km ?? 0) - (R.km ?? 0)) > 0.05))
          caz('K.5', `${x.m} ${z.z} s${sc}: tur ${T.ruta} ${T.km} km / retur ${R.ruta} ${R.km} km`, { m: x.m, z: z.z }); }
      for (const c of z.curse) { if (c.statut === 'facuta') continue;
        const f = ferestre.find((q) => q.sens === c.sens && q.shift_number === c.schimb); if (!f) continue;
        const [w0, w1] = fereastraAbs(z.z, f);
        // sosirea (tur) / plecarea (retur) reală la poartă în fereastră: punctul la poartă al cărui vecin (înainte la tur, după la retur) e departe
        const ev = []; for (let i = 1; i < P.length - 1; i++) { const p = P[i]; if (p.t < w0 || p.t > w1 || hav(p, G) > RP) continue;
          if (c.sens === 'tur' ? hav(P[i - 1], G) > 2 : hav(P[i + 1], G) > 2) ev.push(p.t); }
        if (!ev.length) continue;
        const tP = c.sens === 'tur' ? ev[0] : ev.at(-1), [a, b] = c.sens === 'tur' ? [tP - 150 * 60e3, tP] : [tP, tP + 150 * 60e3];
        // sensul: trecerea pe la primul punct al drumului (capătul, la tur) înaintea trecerii pe la ultimul (poarta), în bucată
        const trece = (q) => { let t = null, d = 1; for (const p of P) { if (p.t < a || p.t > b) continue; const x0 = hav(p, q); if (x0 < d) { d = x0; t = p.t; } } return t; };
        let best = null; for (const R2 of RUTE.values()) { const L = c.sens === 'tur' ? R2.tur : R2.retur; if (L.length < 2) continue;
          const tA = trece({ lat: L[0][0], lon: L[0][1] }), tB = trece({ lat: L.at(-1)[0], lon: L.at(-1)[1] }); if (tA == null || tB == null || tA >= tB) continue;
          const ac = acoperire(P, L, tA, tB); if (ac >= PARAM_SI.ACOPERIRE && (!best || R2.km > best.km)) best = { id: R2.id, ac, km: R2.km }; }
        if (best) verif('K.3', `${x.m} ${z.z} ${c.sens} s${c.schimb}: «${c.statut}», dar mașina a fost la poartă la ${oraL(tP)} și urma acoperă ${r1(best.ac * 100)} % din drumul rutei ${best.id} — de verificat`, { m: x.m, z: z.z }); } }
    // K.10 unde doarme: locul de noapte măsurat (staționarea cea mai lungă dintre ultima cursă a zilei și prima de a doua zi, cel mai des în săptămână)
    const noapte = loculDeNoapte(P, x.bucati ?? [], G);
    if (noapte) { const nume = numeLocalitate(noapte), casaN = M.casa ?? null;
      const egal = casaN && (norm(casaN) === norm(nume) || (casa && hav(casa, noapte) <= 2.5) || (/poart|uzin/.test(casaN) && hav(noapte, G) <= RP + 1));
      NOPTI.push({ m: x.m, casaRaport: casaN, noapteMasurata: nume, nopti: noapte.nopti, din: noapte.din, laPoarta: hav(noapte, G) <= RP + 1 });
      x._noapte = { nume, c: [r1(noapte.lat * 1e4) / 1e4, r1(noapte.lon * 1e4) / 1e4], nopti: noapte.nopti, din: noapte.din };
      if (!egal) verif('K.10', `${x.m}: casa din raport «${casaN ?? '—'}», dar noaptea stă la ${nume} (${noapte.nopti} din ${noapte.din} nopți)`, { m: x.m, casa: casaN, noapte: nume }); }
  }
  // K.5 km cu oameni = Σ km schelet ai curselor făcute (rândurile hărții)
  for (const r of H.randuri ?? []) { const s = r1((r.date?.iv ?? []).filter((v) => v.tip === 'cursa' && v.cats?.cuOameni != null).reduce((a, v) => a + v.km, 0));
    if (r.sumar?.cuOameni != null && Math.abs(s - r.sumar.cuOameni) > 0.6) caz('K.5', `${r.m} ${r.z}: km cu oameni ${r.sumar.cuOameni} ≠ Σ schelet pe hartă ${s}`, { m: r.m, z: r.z }); }
  // K.6 tarif: lei fără tip → steag (nu oprește)
  const fara = PK.masini.filter((x) => (x.economieSapt ?? 0) > 0 && !(dm.get(x.m)?.tip) && !TIP_CUNOSCUT(x.m)).map((x) => x.m);
  if (fara.length) avert.push(`K.6 fără tip / tarif (lei nesocotiți): ${fara.join(', ')}`);
  return { uzina: D.uzina, saptamina: D.saptamina, nopti: NOPTI };
}
// ── K.10: locul de noapte și numele localității (orașul dacă punctul e la ≤ 3 km de centrul lui, altfel satul cel mai apropiat) ──
var LOCALITATI = null;   // var: modulul rulează cu await la început, înaintea declarațiilor de jos
function localitati() { if (LOCALITATI) return LOCALITATI; LOCALITATI = [];
  for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) { if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
    const f = g.properties?.place; if (!/^(village|town|city|suburb|quarter|neighbourhood|hamlet)$/.test(f ?? '')) continue; const [lon, lat] = g.geometry.coordinates;
    if (lat > 45.3 && lat < 48.7 && lon > 26.4 && lon < 30.3) LOCALITATI.push({ n: g.properties['name:ro'] || g.properties.name, lat, lon, oras: f === 'town' || f === 'city', cartier: /suburb|quarter|neighbourhood/.test(f) }); }
  return LOCALITATI; }
// aceeași regulă ca lear-analiza.mjs (numeCasa): cartierul → orașul lui (≤ 6 km); punctul la > 1 km de orice loc → orașul la ≤ 3 km; altfel locul cel mai apropiat
export function numeLocalitate(p) { const L = localitati(), cel = L.reduce((b, q) => (!b || hav(p, q) < hav(p, b) ? q : b), null);
  const oras = (r) => L.filter((q) => q.oras && hav(p, q) <= r).sort((a, b) => hav(p, a) - hav(p, b))[0];
  if (cel?.cartier) { const o = oras(6); if (o) return o.n; }
  if (cel && hav(p, cel) > 1) { const o = oras(3); if (o) return o.n; }
  return cel?.n ?? '?'; }
function norm(x) { return String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*\)/g, '').replace(/^gara /, '').trim(); }
export function loculDeNoapte(P, bucati, G) {
  const B = [...bucati].sort((a, b) => a.t0 - b.t0), locuri = [];
  for (let i = 0; i + 1 < B.length; i++) { const a = B[i].t1, b = B[i + 1].t0; if (b - a < 4 * 3600e3 || b - a > 20 * 3600e3) continue;
    // golul de noapte: trece prin 02:00 ora Moldovei
    const h = (t) => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t));
    let areNoapte = false; for (let t = a; t <= b; t += 3600e3) if (h(t) >= 1 && h(t) <= 3) { areNoapte = true; break; } if (!areNoapte) continue;
    const Q = P.filter((p) => p.t >= a && p.t <= b); if (!Q.length) continue;
    let best = null, i0 = 0; for (let j = 1; j <= Q.length; j++) { if (j === Q.length || hav(Q[j], Q[i0]) > 0.3) { const d = (j < Q.length ? Q[j].t : b) - Q[i0].t; if (!best || d > best.d) best = { lat: Q[i0].lat, lon: Q[i0].lon, d }; i0 = j; } }
    if (best) locuri.push(best); }
  if (!locuri.length) return null;
  // locul cel mai des (grupat la 1 km)
  const gr = []; for (const l of locuri) { const g = gr.find((x) => hav(x, l) <= 1); if (g) g.n++; else gr.push({ ...l, n: 1 }); }
  const g = gr.sort((a, b) => b.n - a.n)[0]; return { lat: g.lat, lon: g.lon, nopti: g.n, din: locuri.length };
}
function TIP_CUNOSCUT(m) { try { const t = readFileSync('/root/lde-worker/lear-analiza.mjs', 'utf8'); return new RegExp(`'${m}':\\s*'`).test(t.match(/const TIP_MASINA = \{[\s\S]*?\};/)?.[0] ?? ''); } catch { return false; } }

// ───────────────────────── Briceni suburban (planul din plan-si.mjs) ─────────────────────────
async function briceni(fCurse) {
  const J0 = J(fCurse), P = J0.plan ?? [];
  if (!J0.scheletIntai) caz('K.5', 'curse-sub fără planul «schelet întâi» (plan-si.mjs n-a rulat)');
  for (const p of P) if (p.sens === 'retur') { const t = p.perecheTur != null ? P.find((q) => q.sens === 'tur' && q.z === p.z && q.r === p.r && q.id === p.perecheTur) : P.find((q) => q.perecheRetur === p.id && q.z === p.z && q.r === p.r);
    if (!t) { if (!p.faraTur) caz('K.5', `ruta ${p.r} ${p.z} retur ${p.id}: fără tur pereche`); continue; }
    if (t.r !== p.r || t.kmSchelet !== p.kmSchelet) caz('K.5', `ruta ${p.r} ${p.z}: tur ${t.kmSchelet} km / retur ${p.kmSchelet} km`); }
  const faraPlan = (J0.curse ?? []).filter((c) => c.tip === 'orar' && !c.plan).length; if (faraPlan) caz('K.5', `${faraPlan} curse «orar» (cu oameni) fără cursă în plan`);
  return { uzina: 'BRICENI', saptamina: J0.FROM };
}

// ───────────────────────── mejgorod (ieșirea hărții, HARTA_OUT) ─────────────────────────
async function mejgorod(fH) {
  const H = J(fH);
  for (const p of H.plan ?? []) if (p.statut === 'facuta' && !(p.km != null && Math.abs(p.km - p.kmSchelet) < 0.05)) caz('K.5', `${p.m} ${p.z} ruta ${p.r} ${p.s}: km ${p.km} ≠ schelet pe porțiune ${p.kmSchelet}`);
  const jum = (H.perechi ?? []).filter((x) => !x.t || !x.r).length; if (jum) avert.push(`K.5 ${jum} perechi tur/retur incomplete (după oră)`);
  for (const r of H.randuri ?? []) { for (const v of r.date?.iv ?? []) if (v.tip === 'cursa' && !v.eticheta) caz('K.5', `${r.m} ${r.z} ${v.ora}: cursă pe hartă fără rol din plan`);
    const s = r1((r.date?.plan?.curse ?? []).filter((c) => c.statut === 'facuta').reduce((a, c) => a + c.km, 0)); if (Math.abs(s - (r.sumar?.cuOameni ?? 0)) > 0.15) caz('K.5', `${r.m} ${r.z}: km cu oameni ≠ Σ schelet`); }
  return { uzina: 'MEJGOROD', saptamina: H.randuri?.[0]?.saptamina ?? null };
}
