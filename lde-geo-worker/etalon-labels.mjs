// ============================================================================
// LDE — de la urma GPS a unei mașini-zi la CURSE: sate deservite, treceri prin
// porți, sens, plin/gol, km utili/goi.
//
// Modul PUR: primește puncte și tabele, nu atinge nici trackerul, nici Supabase.
// E chemat din bucla lui gps-worker, acolo unde punctele sunt deja în memorie —
// ca să nu existe o a doua citire din baza furnizorului și niciun depozit de urme
// brute. Scrierea o face gps-worker, imediat după opriri.
//
// Reguli care NU se negociază (toate plătite cu o observație de review):
//  1. Se consumă DOAR secvențe continue de puncte acceptate (km-core: acceptedRuns).
//     Două puncte despărțite de o pauză de semnal nu sunt vecini — altfel segmentul
//     virtual dintre ele taie raza unei porți unde autobuzul n-a fost.
//  2. Satele sunt ETICHETE lipite pe urmă, nu puncte de rutare
//     (packages/db/src/lde-geo-rules.ts, regulă fermă 23.06.2026).
//  3. Plin sau gol se decide pe CEAS, nu pe topologie: un retur gol are exact
//     aceeași urmă ca unul plin. Unde ceasul nu decide → 'necunoscut', niciodată o
//     presupunere.
//  4. Granițele de schimb se învață din porți, dar ETICHETA lor (sfârșit al lui N /
//     început al lui N+1) vine din orarul declarat. O grupare nu se poate numerota
//     singură: Draxelmaier are 2 schimburi și 3 granițe.
// ============================================================================
import { hav, acceptedRuns } from './km-core.mjs';

export const PRAG_SAT_KM = 2.0;          // = LDE_GEO_VILLAGE_PROXIMITY_KM, regulă fermă
export const DEBOUNCE_POARTA_MIN = 30;   // plecare→sosire; staționarea la poartă e 17-51 min
export const TOLERANTA_SCHIMB_MIN = 45;  // cât de departe de graniță mai contează o plecare

const minute = (a, b) => (b - a) / 60000;

/** Secvențele de puncte pe care avem voie să lucrăm (regula 1). */
export function secvente(pts, calc) {
  return acceptedRuns(pts.length, calc.stepAccepted, calc.stepCut);
}

/**
 * Satele deservite de-a lungul unui interval, în ordinea primei atingeri.
 * Varianta B — TOATE locurile sub prag, nu doar cel mai apropiat: la probă a dat
 * 83,6% acoperire față de 81,0%, fiindcă un cătun lipit de drum masca satul declarat.
 * Ordinea = indicele primului punct la care satul intră în rază (nu „mediana poziției",
 * care nu era definită pentru un sat traversat de două ori).
 */
export function sateDeservite(pts, placesIdx, from, to, prag = PRAG_SAT_KM) {
  const primaAtingere = new Map();
  for (let i = from; i <= to; i++)
    for (const c of placesIdx.allWithin(pts[i], prag))
      if (!primaAtingere.has(c.name)) primaAtingere.set(c.name, i);
  return [...primaAtingere.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

/**
 * Trecerile prin porți, pe secvențe continue, cu debounce pe PLECARE→SOSIRE.
 * Pragul de 30 min nu e ales din burtă: staționarea măsurată la poartă e 17 min la
 * Punctul est Orhei și 32-38 la poartă (migr. 359). Cu debounce pe sosire→sosire,
 * autobuzul care lasă oamenii la punctul est și apoi intră pe poartă ar fi produs
 * două sosiri și un „retur gol" de 800 m — fix indicatorul pe care se sprijină
 * propunerea de repartizare.
 */
export function treceriPorti(pts, secv, gates, debounceMin = DEBOUNCE_POARTA_MIN) {
  const brute = [];
  for (const { from, to } of secv) {
    let curent = null;
    for (let i = from; i <= to; i++) {
      let lovit = null;
      for (const g of gates) if (hav(pts[i], g) <= Number(g.radius_km ?? 0.6)) { lovit = g; break; }
      if (lovit) {
        if (curent && curent.uzina_id === lovit.uzina_id) { curent.iOut = i; curent.tOut = pts[i].t; }
        else { if (curent) brute.push(curent); curent = { uzina_id: lovit.uzina_id, gate: lovit.label, iIn: i, iOut: i, tIn: pts[i].t, tOut: pts[i].t }; }
      } else if (curent) { brute.push(curent); curent = null; }
    }
    if (curent) brute.push(curent);
  }
  // debounce: două atingeri ale ACELEIAȘI uzine, despărțite de sub prag, sunt una
  const out = [];
  for (const t of brute) {
    const ultim = out[out.length - 1];
    if (ultim && ultim.uzina_id === t.uzina_id && minute(ultim.tOut, t.tIn) < debounceMin) {
      ultim.iOut = t.iOut; ultim.tOut = t.tOut;
    } else out.push({ ...t });
  }
  return out;
}

/**
 * Granițele de schimb ale unei uzine, învățate din plecările de la poartă.
 * Se învață VALOAREA, nu eticheta (regula 4). Bin de 30 min; două grupări vecine se
 * separă prin cel puțin un bin gol; prag minim de observații PE GRANIȚĂ, nu pe uzină
 * — rarefierea e pe graniță (Trox are 27/83/62, Florești 26/62/51).
 * Bimodalitatea (uzina și-a mutat programul în fereastră) → graniță respinsă, cu motiv.
 */
export function invataGranite(plecari, { binMin = 30, pragN = 20 } = {}) {
  const binuri = new Map();
  for (const t of plecari) {
    const d = new Date(t);
    const b = Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / binMin);
    binuri.set(b, (binuri.get(b) ?? 0) + 1);
  }
  const chei = [...binuri.keys()].sort((a, b) => a - b);
  const grupuri = [];
  let g = null;
  for (const b of chei) {
    if (g && b === g.pana + 1) { g.pana = b; g.n += binuri.get(b); g.binuri.push([b, binuri.get(b)]); }
    else { if (g) grupuri.push(g); g = { dela: b, pana: b, n: binuri.get(b), binuri: [[b, binuri.get(b)]] }; }
  }
  if (g) grupuri.push(g);

  return grupuri.map((gr) => {
    if (gr.n < pragN) return { minuteZi: null, n: gr.n, motiv: 'sub prag' };
    // bimodalitate: două vârfuri despărțite de ≥2 binuri, fiecare peste jumătate de prag
    const varfuri = gr.binuri.filter(([, n], k) => {
      const prev = gr.binuri[k - 1]?.[1] ?? 0, next = gr.binuri[k + 1]?.[1] ?? 0;
      return n >= prev && n >= next && n >= pragN / 2;
    });
    if (varfuri.length > 1 && varfuri[varfuri.length - 1][0] - varfuri[0][0] >= 2)
      return { minuteZi: null, n: gr.n, motiv: 'program_schimbat' };
    // granița = mediana atingerilor grupării
    const toate = [];
    for (const [b, n] of gr.binuri) for (let k = 0; k < n; k++) toate.push(b * binMin + binMin / 2);
    toate.sort((a, b) => a - b);
    return { minuteZi: toate[Math.floor(toate.length / 2)], n: gr.n, motiv: null };
  });
}

/**
 * Plin sau gol, pe ceas (regula 3).
 * `granite` = [{ minuteZi, tip: 'sfarsit'|'inceput', shift_number }] — eticheta vine
 * din orarul declarat, valoarea poate fi învățată. Plecarea de la poartă lângă
 * SFÂRȘITUL schimbului = mașina duce oamenii acasă (plin); lângă ÎNCEPUT = tocmai i-a
 * livrat și pleacă goală.
 * Dezambiguizarea granițelor comune (sfârșitul lui 1 = începutul lui 2, unde sunt cele
 * mai multe curse): în interiorul ACELEIAȘI atribuiri, prima atingere e livrare
 * (plecare goală), a doua e ridicare (plecare plină).
 */
export function clasificaPlecare(tPlecare, granite, ordineInAtribuire, tol = TOLERANTA_SCHIMB_MIN) {
  const d = new Date(tPlecare);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const dist = (g) => { const x = Math.abs(m - g.minuteZi); return Math.min(x, 1440 - x); };
  const aproape = granite.filter((g) => g.minuteZi != null && dist(g) <= tol);
  if (!aproape.length) return { stare: 'necunoscut', motiv: 'nicio graniță aproape' };

  const tipuri = new Set(aproape.map((g) => g.tip));
  if (tipuri.size === 1) return { stare: tipuri.has('sfarsit') ? 'plin' : 'gol', motiv: null };
  // graniță comună → ordinea în atribuire decide
  if (ordineInAtribuire === 1) return { stare: 'gol', motiv: 'graniță comună, prima atingere = livrare' };
  if (ordineInAtribuire === 2) return { stare: 'plin', motiv: 'graniță comună, a doua atingere = ridicare' };
  return { stare: 'necunoscut', motiv: 'graniță comună, ordinea atingerii necunoscută' };
}

/** Km-ii unui interval, din pașii deja calculați — măsurați, nu reconstruiți din mediane. */
export function kmInterval(stepKm, from, to) {
  let s = 0;
  for (let i = from + 1; i <= to; i++) s += stepKm[i];
  return +s.toFixed(2);
}
