// ION-268 «SCHELET ÎNTÂI» — adaptorul mejgorod (rutele interurbane). Planul = graficul zilei (atribuirile: rută × sens × zi × mașină, cu ora
// programată); GPS-ul (curse-<LUNI>.json, urma tăiată pe fiecare atribuire de curse.mjs) doar confirmă: FĂCUTĂ dacă urma acoperă ≥ ACOPERIRE
// (constanta comună, schelet-intai.mjs) din opririle scheletului între capetele reale ale sensului; NECONFIRMATĂ dacă are urmă, dar nu pe drumul
// rutei; LIPSĂ fără urmă. Km cursei făcute = km din schelet (ideal.json, lanțul simetric) DOAR pe porțiunea efectiv parcursă, între opririle
// atinse (Ion, 06.10: varianta b — excepția interurbanelor: capătul scurtat lasă tur ≠ retur în km; la uzine T.1 rămâne strict).
// Perechea tur ↔ retur a mașinii în zi se leagă după ORA din grafic (plecarea programată), nu după numărul rutei (Ion, 06.10).
import { PARAM_SI } from '../../lear-parcare/schelet-intai.mjs';
export const ACOPERIRE = PARAM_SI.ACOPERIRE, TRECERE_M = 3000, ORA_TOL_MIN = 60;
const r1 = (x) => Math.round(x * 10) / 10, toMin = (h) => { if (!h) return null; const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
const minLocal = (t) => { const [h, m] = FMT.format(new Date(t)).split(':').map(Number); return h * 60 + m; };
export const cheie = (a) => `${a.r}|${a.s}|${a.z}|${a.m}`;

/** N = nomenclator, C = curse, I = ideal (lista), zile = zilele săptămânii → { plan: [...], perechi: [...], pe: Map cheie → cursa din plan } */
export function planMejgorod(N, C, I, zile) {
  const IM = new Map(I.map((r) => [r.ruta, r])), R = new Map(N.rute.map((r) => [r.id, r])), rec = new Map(C.curse.map((c) => [cheie(c), c]));
  const plecare = (r, s) => { const st = s === 'tur' ? r.opriri : [...r.opriri].reverse(); for (const o of st) { const m = toMin(s === 'tur' ? o.hN : o.hC); if (m != null) return m; } return null; };
  const lantReal = (id, s) => { const x = IM.get(id); if (!x) return []; const st = [...x.stops].sort((a, b) => a.km - b.km); const rl = x.real?.[s];
    const ix = (n) => st.findIndex((q) => q.n === n || (q.alias ?? []).includes(n));
    let a = rl ? ix(rl.capA) : -1, b = rl ? ix(rl.capB) : -1; if (a < 0 || b < 0) { a = 0; b = st.length - 1; } if (a > b) [a, b] = [b, a];
    return st.slice(a, b + 1).filter((q) => !q.interpolat); };
  const plan = [];
  for (const a of N.atribuiri) { if (!zile.includes(a.z)) continue;
    const r = R.get(a.r), x = IM.get(a.r), c = rec.get(cheie(a));
    const kmDe = (o) => { const q = x?.stops.find((y) => y.o === o); if (q) return q.km; const g = r?.opriri.find((y) => y.o === o); if (!g) return null;
      const n = x?.stops.find((y) => y.n === g.n || (y.alias ?? []).includes(g.n)); if (n) return n.km; if (g.lat == null) return null;
      let b = null, bd = 5; for (const y of x?.stops ?? []) { const d = Math.hypot((y.lat - g.lat) * 111, (y.lon - g.lon) * 75); if (d < bd) { bd = d; b = y; } } return b?.km ?? null; };
    const p = { ...a, nume: r?.nume ?? null, plecareProg: r ? plecare(r, a.s) : null, kmPlin: x?.km ?? null };
    if (!c) { plan.push({ ...p, statut: 'lipsa', motiv: 'fără urmă (mașina fără tracker sau neprinsă)' }); continue; }
    if (c.motiv) { plan.push({ ...p, statut: 'lipsa', motiv: `urma: ${c.motiv}` }); continue; }
    const pass = new Map((c.pass ?? []).map((q) => [q.o, q])), L = lantReal(a.r, a.s);
    const cu = L.filter((q) => pass.has(q.o)), ok = cu.filter((q) => pass.get(q.o).d <= TRECERE_M), acop = cu.length ? ok.length / cu.length : 0;
    const kA = kmDe(c.oA), kB = kmDe(c.oB), kmS = kA != null && kB != null ? r1(Math.abs(kB - kA)) : null;
    let dOra = null; if (p.plecareProg != null && c.tA) { dOra = minLocal(c.tA) - p.plecareProg; if (dOra > 720) dOra -= 1440; if (dOra < -720) dOra += 1440; }
    const fac = acop >= ACOPERIRE && kmS != null;
    plan.push({ ...p, statut: fac ? 'facuta' : 'neconfirmata', acoperire: r1(acop * 100), km: fac ? kmS : null, kmSchelet: kmS, kmGps: c.km, oA: c.oA, oB: c.oB, t0: c.t0, t1: c.t1, tA: c.tA, tB: c.tB, dOra,
      capatScurtat: fac && p.kmPlin != null && p.kmPlin - kmS > 5, oraAfara: dOra != null && Math.abs(dOra) > ORA_TOL_MIN,
      motiv: fac ? null : kmS == null ? 'opririle atinse nu sunt pe lanțul scheletului' : `urma acoperă ${r1(acop * 100)} % din opririle rutei (sub ${ACOPERIRE * 100} %)` }); }
  // perechile tur ↔ retur ale mașinii în zi, după ora programată
  const perechi = [], peMZ = new Map();
  for (const p of plan) { const k = `${p.m}|${p.z}`; (peMZ.get(k) ?? peMZ.set(k, []).get(k)).push(p); }
  for (const [k, L] of peMZ) { const T = L.filter((p) => p.s === 'tur').sort((a, b) => a.plecareProg - b.plecareProg), Rt = L.filter((p) => p.s === 'retur').sort((a, b) => a.plecareProg - b.plecareProg);
    const fol = new Set();
    for (const t of T) { const r = Rt.find((q) => !fol.has(q) && q.plecareProg >= t.plecareProg) ?? Rt.find((q) => !fol.has(q)); if (r) { fol.add(r); r.perecheCu = t.r; t.perecheCu = r.r; } perechi.push({ k, t, r: r ?? null }); }
    for (const r of Rt) if (!fol.has(r)) perechi.push({ k, t: null, r }); }
  return { plan, perechi, pe: new Map(plan.map((p) => [cheie(p), p])) };
}
