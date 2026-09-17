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
// Cât de departe de graniță mai contează o atingere de poartă. Nu ales din burtă:
// măsurat pe 30 de zile, cele 5.623 de atingeri de poartă cad față de cea mai apropiată
// graniță la 33 de minute (mediana), 43 (p75), 87 (p90). Pragul de 45 pe care îl aveam
// tăia 22% din atingeri — ele nu ieșeau greșite, ieșeau `necunoscut`, iar km-ii lor nu se
// adunau nicăieri. Cu 75 intră 88,6%, iar granițele reale sunt la ore distanță una de
// alta, deci lărgirea nu poate confunda două schimburi.
export const TOLERANTA_SCHIMB_MIN = 75;

const minute = (a, b) => (b - a) / 60000;

// Orarele uzinelor sunt în ora LOCALĂ (Europe/Chisinau), iar timestamp-urile din tracker
// sunt UTC. Fără conversie, granițele învățate ies cu 3 ore mai devreme decât cele
// declarate — exact ce a arătat proba din 17.09: Ungheni 02:45/11:45/20:15 în loc de
// 06:00/14:30/23:00, iar aproape toate cursele ieșeau 'necunoscut'.
// Intl, nu un offset fix: la sfârșitul lui octombrie se schimbă ora.
const FUS = 'Europe/Chisinau';
const fmt = new Intl.DateTimeFormat('ro-RO', { timeZone: FUS, hour: '2-digit', minute: '2-digit', hour12: false });
export function minuteZiLocal(t) {
  const p = fmt.formatToParts(new Date(t));
  const h = +p.find((x) => x.type === 'hour').value;
  const m = +p.find((x) => x.type === 'minute').value;
  return h * 60 + m;
}

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
    const b = Math.floor(minuteZiLocal(t) / binMin);
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
 * ÎMPERECHEREA atingerilor de poartă cu schimburile — de aici iese și plin/gol.
 *
 * O atingere de poartă are un singur rost: ori mașina a ADUS oamenii schimbului care
 * începe (livrare), ori a venit să-i IA pe cei care termină (ridicare). Amândouă se
 * recunosc pe ceas, față de granița schimbului, iar din rol urmează totul: segmentul
 * dinainte de atingere e plin la livrare și gol la ridicare, cel de după — invers.
 *
 * De ce împerechere și nu „a k-a atingere = schimbul k": ordinea nu ține. Măsurat pe
 * 01–16.09, tiparul NORMAL e 3 atingeri la 2 atribuiri (245 de cazuri), fiindcă o
 * atribuire produce două atingeri la 8 ore distanță. Numărătoarea poziției dădea cursei
 * a doua ruta schimbului următor, cu km reali și abatere fabricată.
 *
 * Fiecare rol se ia O SINGURĂ DATĂ: mașina nu livrează de două ori același schimb. De
 * aceea potrivirea e lacomă, în ordinea apropierii de graniță — asta rezolvă și granița
 * comună de la Draxelmaier (sfârșitul lui 1 = începutul lui 2 = 15:30), unde altfel
 * ambele roluri sunt adevărate pe același ceas: atingerea mai apropiată de 15:30 ia
 * ridicarea schimbului 1, cealaltă rămâne cu livrarea schimbului 2.
 *
 * @param treceri  [{ tIn, tOut, ... }] — atingerile, în ordine cronologică
 * @param granite  [{ minuteZi, tip:'inceput'|'sfarsit', shift_number }]
 * @param shifturi numerele schimburilor pe care mașina chiar le are atribuite în ziua aia
 * @returns un element pe atingere: { shift_number, rol:'livrare'|'ridicare' } sau null
 */
export function imperecheazaTreceri(treceri, granite, shifturi, tol = TOLERANTA_SCHIMB_MIN) {
  const cand = [];
  for (const sh of new Set(shifturi ?? []))
    for (const [rol, tip] of [['livrare', 'inceput'], ['ridicare', 'sfarsit']]) {
      const g = granite.find((x) => x.shift_number === sh && x.tip === tip && x.minuteZi != null);
      if (g) cand.push({ shift_number: sh, rol, minuteZi: g.minuteZi });
    }
  const perechi = new Array(treceri.length).fill(null);
  if (!cand.length) return perechi;

  const dist = (a, b) => { const x = Math.abs(a - b); return Math.min(x, 1440 - x); };
  const optiuni = [];
  treceri.forEach((t, i) => {
    // Se măsoară pe momentul în care mașina a ATINS poarta, nu pe plecare: staționarea
    // la poartă e între 17 și 51 de minute și diferă de la o uzină la alta (migr. 359).
    const m = minuteZiLocal(t.tIn);
    for (const c of cand) optiuni.push({ i, c, d: dist(m, c.minuteZi) });
  });
  optiuni.sort((a, b) => a.d - b.d || a.i - b.i);
  const luate = new Set();
  for (const o of optiuni) {
    if (o.d > tol) break;
    const cheie = `${o.c.shift_number}|${o.c.rol}`;
    if (perechi[o.i] || luate.has(cheie)) continue;
    perechi[o.i] = { ...o.c, abatere_min: o.d };
    luate.add(cheie);
  }
  return perechi;
}

/** Ce e segmentul dinaintea unei atingeri: a adus oamenii sau a venit gol după ei? */
export function stareApropiere(pereche) {
  if (!pereche) return { stare: 'necunoscut', motiv: 'nicio graniță aproape', shift_number: null };
  return pereche.rol === 'livrare'
    ? { stare: 'plin', motiv: null, shift_number: pereche.shift_number }
    : { stare: 'gol', motiv: 'vine să ia schimbul', shift_number: pereche.shift_number };
}

/** Și oglinda lui: ce e segmentul de DUPĂ atingere. */
export function starePlecare(pereche) {
  if (!pereche) return { stare: 'necunoscut', motiv: 'nicio graniță aproape', shift_number: null };
  return pereche.rol === 'ridicare'
    ? { stare: 'plin', motiv: null, shift_number: pereche.shift_number }
    : { stare: 'gol', motiv: 'tocmai a livrat schimbul', shift_number: pereche.shift_number };
}

/** Km-ii unui interval, din pașii deja calculați — măsurați, nu reconstruiți din mediane. */
export function kmInterval(stepKm, from, to) {
  let s = 0;
  for (let i = from + 1; i <= to; i++) s += stepKm[i];
  return +s.toFixed(2);
}

/**
 * Segmentele unei mașini-zi, cu starea fiecăruia. Asta e funcția pe care o cheamă
 * worker-ul; celelalte sunt cărămizile ei.
 * @returns [{ tip:'apropiere'|'plecare', from, to, km, stare, shift_number, uzina_id, gate }]
 */
export function segmenteZi(pts, calc, treceri, granite, shifturi = []) {
  const perechi = imperecheazaTreceri(treceri, granite, shifturi);
  const out = [];
  if (!treceri.length) {
    out.push({ tip: 'apropiere', from: 0, to: pts.length - 1, km: kmInterval(calc.stepKm, 0, pts.length - 1), stare: 'necunoscut', motiv: 'nicio trecere prin poartă' });
    return out;
  }
  // ── de la începutul zilei până la prima poartă: apropiere ──
  out.push({
    tip: 'apropiere', from: 0, to: treceri[0].iIn, uzina_id: treceri[0].uzina_id, gate: treceri[0].gate,
    km: kmInterval(calc.stepKm, 0, treceri[0].iIn), ...stareApropiere(perechi[0]),
  });

  treceri.forEach((t, k) => {
    const urm = treceri[k + 1];
    const pana = urm ? urm.iIn : pts.length - 1;
    if (pana <= t.iOut) return;
    if (!urm) {
      // coada zilei: mașina pleacă de la poartă și se duce acasă
      out.push({
        tip: 'plecare', from: t.iOut, to: pana, uzina_id: t.uzina_id, gate: t.gate,
        km: kmInterval(calc.stepKm, t.iOut, pana), ...starePlecare(perechi[k]),
      });
      return;
    }
    // Între două vizite la poartă mașina IESE spre sate și SE ÎNTOARCE. Sunt două
    // segmente, nu unul — altfel același drum se numără de două ori (bug prins la
    // proba din 17.09: suma segmentelor ieșea 105.340 km la un total de 73.089).
    // Punctul de întoarcere = cel mai depărtat de poartă din tot intervalul.
    const poarta = pts[t.iOut];
    let vf = t.iOut, vd = -1;
    for (let i = t.iOut; i <= pana; i++) { const d = hav(pts[i], poarta); if (d > vd) { vd = d; vf = i; } }
    out.push({
      tip: 'plecare', from: t.iOut, to: vf, uzina_id: t.uzina_id, gate: t.gate,
      km: kmInterval(calc.stepKm, t.iOut, vf), ...starePlecare(perechi[k]),
    });
    out.push({
      tip: 'apropiere', from: vf, to: pana, uzina_id: urm.uzina_id, gate: urm.gate,
      km: kmInterval(calc.stepKm, vf, pana), ...stareApropiere(perechi[k + 1]),
    });
  });
  return out;
}
