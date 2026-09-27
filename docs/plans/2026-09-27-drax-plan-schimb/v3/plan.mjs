// Drăxlmaier — planul de schimb (ION-108 A, v3): optimizarea, normalizarea, lanțurile, rotația și invarianții, PURE.
// Costul și permisiunea vin din afară: cost(m, asg) → km/săpt. (Infinity = imposibil), voie(m, P) → bool.
// masini = [{ m }], azi = Map(m → { s1, s2 }) cu programe { id, azi, schimb, cheie }.
import { ungar, componente, ordoneaza } from './model.mjs';

export const PENAL = 0.5;
const S = ['s1', 's2'];

/** ungar pe fiecare schimb (celălalt fixat, pasul nu se acceptă dacă strică) + schimb pe un schimb + schimb de program întreg */
export function optimizeaza(masini, azi, voie, cost, penal = PENAL) {
  const plan = new Map([...azi].map(([k, v]) => [k, { ...v }]));
  const ob = (m, asg) => cost(m, asg) + penal * S.filter((s) => asg[s] && asg[s].azi !== m.m).length;
  const total = () => masini.reduce((a, m) => a + ob(m, plan.get(m.m)), 0);
  let t0 = Infinity;
  for (let runda = 0; runda < 30; runda++) {
    for (const s of S) {
      const rows = masini.filter((m) => plan.get(m.m)[s]); if (!rows.length) continue;
      const cols = rows.map((m) => plan.get(m.m)[s]);
      const C = rows.map((m) => cols.map((P) => { if (!voie(m, P)) return 1e9; const c = ob(m, { ...plan.get(m.m), [s]: P }); return Number.isFinite(c) ? c : 1e9; }));
      const p = ungar(C), vechi = rows.map((m) => plan.get(m.m)[s]), tv = total();
      rows.forEach((m, i) => { plan.get(m.m)[s] = cols[p[i]]; });
      if (!(total() <= tv + 1e-6)) rows.forEach((m, i) => { plan.get(m.m)[s] = vechi[i]; });
    }
    for (let bun = true; bun;) { bun = false;
      for (let i = 0; i < masini.length; i++) for (let j = i + 1; j < masini.length; j++) {
        const a = masini[i], b = masini[j], Pa = plan.get(a.m), Pb = plan.get(b.m), cand = [];
        for (const s of S) if (Pa[s] && Pb[s]) cand.push([{ ...Pa, [s]: Pb[s] }, { ...Pb, [s]: Pa[s] }]);
        if (Pa.s1 && Pa.s2 && Pb.s1 && Pb.s2) cand.push([{ ...Pb }, { ...Pa }]);
        for (const [na, nb] of cand) {
          if (!S.every((s) => (!na[s] || voie(a, na[s])) && (!nb[s] || voie(b, nb[s])))) continue;
          if (ob(a, na) + ob(b, nb) < ob(a, Pa) + ob(b, Pb) - 1e-6) { plan.set(a.m, na); plan.set(b.m, nb); bun = true; break; }
        } } }
    const t = total(); if (!(t < t0 - 1e-6)) break; t0 = t;
  }
  const suma = () => masini.reduce((a, m) => a + cost(m, plan.get(m.m)), 0);
  const costOptimizator = suma();
  // normalizarea: un program cu aceleași linii ca al mașinii se dă înapoi DOAR dacă suma nu crește
  let normalizate = 0;
  for (let ok = true; ok;) { ok = false;
    for (const m of masini) for (const s of S) { const P = plan.get(m.m)[s], own = azi.get(m.m)[s];
      if (!P || !own || P === own || P.cheie !== own.cheie) continue;
      const x = masini.find((q) => plan.get(q.m)[s] === own); if (!x || !voie(x, P)) continue;
      const Pm = plan.get(m.m), Px = plan.get(x.m);
      if (cost(m, { ...Pm, [s]: own }) + cost(x, { ...Px, [s]: P }) <= cost(m, Pm) + cost(x, Px) + 1e-6) { plan.set(m.m, { ...Pm, [s]: own }); plan.set(x.m, { ...Px, [s]: P }); normalizate++; ok = true; } } }
  return { plan, costOptimizator, costNormalizat: suma(), normalizate };
}

/** mutările (P, dela, la, schimb) și componentele lor; economia unei componente (mașinile ei schimbă doar între ele) */
export function lanturiDin(masini, azi, plan, cost, M) {
  const mutari = [];
  for (const m of masini) for (const s of S) { const P = plan.get(m.m)[s]; if (P && P.azi !== m.m) mutari.push({ P, dela: P.azi, la: m.m, schimb: s }); }
  return componente(mutari).map((comp) => {
    const mut = ordoneaza(mutari.filter((q) => comp.includes(q.la)));
    const pe = comp.map((x) => ({ m: x, inainte: cost(M.get(x), azi.get(x)), dupa: cost(M.get(x), plan.get(x)) }));
    return { comp, mut, pe, ec: pe.reduce((a, q) => a + q.inainte - q.dupa, 0) };
  });
}

/** săptămâna R are schimburile inversate față de W? majoritatea mașinilor cu două programe (cheile s1/s2 schimbate între ele) */
export function inversata(masiniW, MR) {
  let inv = 0, la = 0;
  for (const m of masiniW) { const r = MR.get(m.m); if (!r || !m.prog?.s1 || !m.prog?.s2 || !r.prog?.s1 || !r.prog?.s2) continue;
    if (m.prog.s1.cheie === r.prog.s2.cheie || m.prog.s2.cheie === r.prog.s1.cheie) inv++;
    if (m.prog.s1.cheie === r.prog.s1.cheie || m.prog.s2.cheie === r.prog.s2.cheie) la++; }
  return inv === la ? null : inv > la;
}

/** aceleași mutări pe săptămâna R, după (linii, schimbul corespondent); programele deja luate se exclud */
export function peRotatie(L, R) {   // R = { masini, M, azi, voie, cost, inv }
  if (!R) return { verificat: false, motiv: 'fără săptămâna precedentă' };
  if (R.inv == null) return { verificat: false, motiv: 'nu se vede dacă schimburile s-au inversat' };
  const plan = new Map([...R.azi].map(([k, v]) => [k, { ...v }])), luate = new Set();
  for (const q of L.mut) {
    const s2 = R.inv ? (q.schimb === 's1' ? 's2' : 's1') : q.schimb;
    const src = R.M.get(q.dela), P = src?.prog?.[s2];
    if (!P || P.cheie !== q.P.cheie || luate.has(P.id)) return { verificat: false, motiv: `${q.dela} nu face aceleași linii pe schimbul corespondent în săptămâna precedentă` };
    if (!R.M.get(q.la)) return { verificat: false, motiv: `${q.la} nu lucrează în săptămâna precedentă` };
    luate.add(P.id); plan.get(q.la)[s2] = P;
  }
  const folosite = new Map();
  for (const m of R.masini) for (const s of S) { const P = plan.get(m.m)[s]; if (!P) continue;
    if (P.schimb !== s || !R.voie(m, P)) return { verificat: false, motiv: `${m.m}: clasa, forma sau schimbul nu se potrivesc` };
    folosite.set(P.id, (folosite.get(P.id) ?? 0) + 1); }
  const nProg = R.masini.reduce((a, m) => a + S.filter((s) => R.azi.get(m.m)[s]).length, 0);
  if ([...folosite.values()].some((n) => n !== 1) || folosite.size !== nProg) return { verificat: false, motiv: 'un program ar rămâne fără mașină sau cu două' };
  const xs = [...new Set(L.mut.flatMap((q) => [q.dela, q.la]))];
  const ec = xs.reduce((a, x) => a + R.cost(R.M.get(x), R.azi.get(x)) - R.cost(R.M.get(x), plan.get(x)), 0);
  return Number.isFinite(ec) ? { verificat: true, ecKmSapt: Math.round(ec * 10) / 10 } : { verificat: false, motiv: 'curse suprapuse în săptămâna precedentă' };
}

/** invarianții blochează scrierea; concordanțele statistice (model ↔ GPS) sunt doar informative */
export const INVARIANTI = ['conservare', 'faraSuprapuneri', 'fiecareProgramOData', 'capacitateSiForma', 'schimbPastrat', 'economieA', 'economieB', 'normalizareaNuStrica'];
export const picate = (C) => INVARIANTI.filter((k) => !C[k]?.trece);
