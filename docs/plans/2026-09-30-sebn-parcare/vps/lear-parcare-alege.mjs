// ION-143: alegerea locurilor (1–2) pentru o mașină LEAR — funcție pură, ca să se poată verifica pe cazuri construite (Codex r1 C4).
// legi[i] = { real, acum: {lat,lon} | null }; cand[j] = { n, lat, lon, pref }; cost[i][j] = km propuși pe drumul i prin locul j.
// Pe fiecare drum: dintre locurile alese, doar cele care sunt o mutare reală (> LA_FEL_KM de unde mașina deja stă) și aduc câștigul minim
// (≥ max(2 km, 5 % din real)); dintre ele cel mai ieftin; fără niciunul, «rămâne cum e» (km de acum).
export function alegeLocuri({ legi, cand, cost, hav, P = {} }) {
  const LA_FEL_KM = P.LA_FEL_KM ?? 4, CASTIG_MIN_KM = P.CASTIG_MIN_KM ?? 2, CASTIG_MIN_PROC = P.CASTIG_MIN_PROC ?? 0.05;
  const PRAG_AL_DOILEA = P.PRAG_AL_DOILEA ?? 20, MIN_DRUMURI = P.MIN_DRUMURI ?? 3, TOLERANTA = P.TOLERANTA ?? 20;
  const bunPe = (i, j) => { const l = legi[i]; return !(l.acum && hav(cand[j], l.acum) <= LA_FEL_KM) && l.real - cost[i][j] >= Math.max(CASTIG_MIN_KM, CASTIG_MIN_PROC * l.real); };
  const alege = (idx, i) => { let b = -1; for (const j of idx) if (bunPe(i, j) && (b < 0 || cost[i][j] < cost[i][b])) b = j; return b; };   // -1 = rămâne cum e
  const costAles = (idx, i) => { const j = alege(idx, i); return j < 0 ? legi[i].real : cost[i][j]; };
  const totalCu = (idx) => legi.reduce((s, l, i) => s + costAles(idx, i), 0);
  const folosit = (idx, j) => legi.filter((l, i) => alege(idx, i) === j).length;
  let b1 = null, b2 = null, b2e = null;
  for (let j = 0; j < cand.length; j++) { const t = totalCu([j]); if (!b1 || t < b1.t || (t === b1.t && cand[j].n < cand[b1.idx[0]].n)) b1 = { idx: [j], t }; }
  const elig = (idx) => idx.length === 1 || ((b1.t - totalCu(idx)) >= PRAG_AL_DOILEA && idx.every((j) => folosit(idx, j) >= MIN_DRUMURI));
  for (let j = 0; j < cand.length; j++) for (let k = j + 1; k < cand.length; k++) { const t = totalCu([j, k]); if (!b2 || t < b2.t) b2 = { idx: [j, k], t };
    if ((!b2e || t < b2e.t) && elig([j, k])) b2e = { idx: [j, k], t }; }
  let ales = { idx: [...(b2e ?? b1).idx], t: (b2e ?? b1).t }, buget = TOLERANTA;
  // preferința (toleranță TOLERANTA km/săpt.): se înlocuiește un loc cu unul mai preferat, dacă totalul crește puțin
  for (let p = 0; p < ales.idx.length; p++) { let best = null;
    for (let q = 0; q < cand.length; q++) { if (ales.idx.includes(q) || cand[q].pref <= cand[ales.idx[p]].pref) continue;
      const idx = ales.idx.map((j, n) => (n === p ? q : j)); if (!elig(idx)) continue; const t = totalCu(idx);
      if (t - ales.t <= buget && (!best || cand[q].pref > cand[best.q].pref || (cand[q].pref === cand[best.q].pref && t < best.t))) best = { q, t, idx }; }
    if (best) { buget -= best.t - ales.t; ales = { idx: best.idx, t: best.t }; } }
  return { ales, b1, b2, alege, costAles, folosit };
}
