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
export const PAUZA_INTOARCERE_MIN = 30;  // o staționare de atât între două vizite la poartă e pauza dintre ture
export const VITEZA_OPRIT_ND = 8;        // noduri (~15 km/h); sub ea, în raza porții, mașina lasă/ia oameni
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
        else { if (curent) brute.push(curent); curent = { uzina_id: lovit.uzina_id, gate: lovit.label, poarta: lovit, iIn: i, iOut: i, tIn: pts[i].t, tOut: pts[i].t }; }
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
  // A ATINS poarta sau doar A TRECUT prin dreptul ei? Măsurat pe toată flota, 16.09
  // (310 atingeri): sub un minut în rază — 23 de atingeri, NICIUNA cu mașina oprită;
  // peste 10 minute — 218, toate oprite. Între 1 și 3 minute e amestec (19 oprite din
  // 40). Deci nu timpul desparte, ci OPRIREA: două puncte consecutive la ≤50 m unul de
  // altul înăuntrul razei. Popescu (552BRAO) trece de trei ori pe zi prin poarta Orhei
  // în drum spre Strășeni, câte un minut, fără să oprească — și fiecare trecere îi rupea
  // ziua în bucăți și năștea o cursă pe o rută Orhei pe care n-o face.
  // Se judecă doar punctele DIN RAZĂ: după debounce, o atingere poate cuprinde și drumul
  // dintre două treceri (ieșit și revenit în sub 30 de minute), iar o oprire acolo nu e la poartă.
  // «Oprit» = viteza trackerului (noduri) ≤ VITEZA_OPRIT_ND pe două puncte consecutive;
  // unde viteza lipsește, două puncte la ≤50 m. Distanța singură nu ajunge: la un stop
  // de lângă poartă mașina încetinește pentru un punct și „oprea" fals. Pragul nu e 0:
  // la Strășeni oamenii urcă într-o parcare la marginea razei, iar în rază mașina doar
  // se târăște cu 9–12 noduri (552BRAO, 22:33); trecerile prin dreptul porții nu coboară
  // sub 20 de noduri pe niciun punct (aceeași mașină, șase treceri prin Orhei).
  const inRaza = (p, t) => hav(p, t.poarta) <= Number(t.poarta.radius_km ?? 0.6);
  const stat = (p) => (p.sp != null && Number.isFinite(+p.sp)) ? +p.sp <= VITEZA_OPRIT_ND : null;
  for (const t of out) {
    t.oprit = false;
    for (let i = t.iIn; i < t.iOut; i++) {
      if (!inRaza(pts[i], t) || !inRaza(pts[i + 1], t)) continue;
      const a = stat(pts[i]), b = stat(pts[i + 1]);
      const oprit = (a != null && b != null) ? (a && b) : hav(pts[i], pts[i + 1]) <= 0.05;
      if (oprit) { t.oprit = true; break; }
    }
  }
  return out;
}

/**
 * Valoarea unei granițe de schimb, învățată din plecările de la poartă DIN JURUL EI.
 *
 * Se învață VALOAREA, nu eticheta (regula 4): granița pe care o căutăm e numită de orarul
 * declarat, iar aici doar i se măsoară ora adevărată, în fereastra ei.
 *
 * De ce în fereastră și nu pe ziua întreagă: prima variantă grupa toate plecările uzinei în
 * binuri de 30 de minute și tăia grupările acolo unde apărea un bin gol. La o uzină mare nu
 * apare niciodată: Draxelmaier are 39 de mașini care ating poarta la toate orele, deci ziua
 * întreagă ieșea O SINGURĂ grupare, cu trei vârfuri, și era respinsă ca „program_schimbat".
 * Așa au ajuns 18 din 30 de granițe să fie declarate bimodale — un diagnostic fals: nu uzina
 * își mutase programul, ci grupările nu se puteau despărți.
 *
 * Bimodalitatea rămâne, dar se judecă ÎN fereastră, unde chiar înseamnă ce spune: două
 * vârfuri depărtate = uzina și-a mutat ora în intervalul de 60 de zile. Atunci granița se
 * respinge, NU se mediază între vârfuri.
 */
export function invataGranite(plecari, minuteDeclarat, { fereastraMin = 90, binMin = 30, pragN = 20 } = {}) {
  if (minuteDeclarat == null) return { minuteZi: null, n: 0, motiv: 'orar neparsabil' };
  const dist = (a, b) => { const x = Math.abs(a - b); return Math.min(x, 1440 - x); };
  // decalajul față de graniță, cu semn, ca mediana să aibă sens și peste miezul nopții
  const decalaje = [];
  for (const t of plecari) {
    const m = minuteZiLocal(t);
    if (dist(m, minuteDeclarat) > fereastraMin) continue;
    let d = m - minuteDeclarat;
    if (d > 720) d -= 1440;
    if (d < -720) d += 1440;
    decalaje.push(d);
  }
  if (decalaje.length < pragN) return { minuteZi: null, n: decalaje.length, motiv: 'sub prag' };

  const binuri = new Map();
  for (const d of decalaje) {
    const b = Math.floor(d / binMin);
    binuri.set(b, (binuri.get(b) ?? 0) + 1);
  }
  const chei = [...binuri.keys()].sort((a, b) => a - b);
  // Al doilea vârf contează doar dacă e comparabil cu primul. Cu pragul de „jumătate din
  // pragN" ieșeau bimodale tocmai cele două uzine mari: la Draxelmaier vârful graniței are
  // 197 de plecări, iar coada de la 08:00 are 26 (13%); la Orhei 533 față de 25 (5%). O
  // mutare reală de program dă două vârfuri apropiate ca mărime, nu o coadă.
  const maxBin = Math.max(...binuri.values());
  const pragVarf = Math.max(pragN / 2, 0.4 * maxBin);
  const varfuri = chei.filter((b, k) => {
    const n = binuri.get(b);
    return n >= (binuri.get(chei[k - 1]) ?? 0) && n >= (binuri.get(chei[k + 1]) ?? 0) && n >= pragVarf;
  });
  if (varfuri.length > 1 && varfuri[varfuri.length - 1] - varfuri[0] >= 2)
    return { minuteZi: null, n: decalaje.length, motiv: 'program_schimbat' };

  decalaje.sort((a, b) => a - b);
  const med = decalaje[Math.floor(decalaje.length / 2)];
  return { minuteZi: ((minuteDeclarat + med) % 1440 + 1440) % 1440, n: decalaje.length, motiv: null };
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
export function imperecheazaTreceri(treceri, granite, shifturi, tol = TOLERANTA_SCHIMB_MIN, capacitate = null, atribuite = null) {
  // Schimburile din GRAFIC față de cele doar posibile la uzină. Un schimb neatribuit
  // poate da un rol numai cât timp mașinii îi lipsește o cursă pentru o rută pe care o
  // are — bugetul e 2 roluri (livrare + ridicare) pe fiecare rută. Fără buget, la
  // Ungheni 217RST primea «ridicare s3» pe atingerea de dimineață (sfârșitul lui 3 și
  // începutul lui 1 cad pe același minut), deși n-are schimbul 3: drumul gol de 80 km
  // spre casă se scria ca retur PLIN al unui schimb pe care nu-l lucrează. Așa ieșea
  // Ungheni cu zero km goi în 17 zile. Cu buget, Guzun Ivan (2 rute, ambele s1) tot își
  // primește livrarea de la 15:00 pe s2 — el chiar are o cursă neacoperită.
  const atribuit = new Set((atribuite ?? shifturi ?? []).map(String));
  const eAtribuit = (c) => atribuit.has(String(c.shift_number));
  let buget = 0;
  for (const sh of atribuit) buget += 2 * (capacitate?.get(String(sh)) ?? 1);
  let roluri = 0;
  const cand = [];
  for (const sh of new Set(shifturi ?? []))
    for (const [rol, tip] of [['livrare', 'inceput'], ['ridicare', 'sfarsit']]) {
      const g = granite.find((x) => x.shift_number === sh && x.tip === tip && x.minuteZi != null);
      if (g) cand.push({ shift_number: sh, rol, minuteZi: g.minuteZi });
    }
  const perechi = treceri.map(() => ({ livrare: null, ridicare: null }));
  if (!cand.length || !treceri.length) return perechi;

  const dist = (a, b) => { const x = Math.abs(a - b); return Math.min(x, 1440 - x); };
  // Livrarea se măsoară pe SOSIRE (mașina ajunge înainte să înceapă tura), ridicarea pe
  // PLECARE (pleacă după ce s-a terminat). Între ele stă staționarea, care e 17-51 de
  // minute și diferă de la o uzină la alta (migr. 359) — cu un singur moment pentru
  // amândouă, uzina cu staționare lungă ieșea mereu la limita toleranței.
  const cand_d = (t, c) => dist(minuteZiLocal(c.rol === 'livrare' ? t.tIn : t.tOut), c.minuteZi);
  // Câte curse poate face mașina pe un (schimb, rol). Implicit una — dar o mașină poate
  // avea DOUĂ rute în același schimb (22 din 169 de perechi mașină×schimb pe 16.09), și
  // atunci face două livrări și două ridicări. Cu o singură capacitate, a doua cursă
  // rămânea fără rol, iar km-ii ei se duceau la „necunoscut".
  const folosite = new Map();
  const capac = (c) => capacitate?.get(String(c.shift_number)) ?? 1;
  const plin = (c) => (folosite.get(`${c.shift_number}|${c.rol}`) ?? 0) >= capac(c);
  const pune = (i, c) => {
    if (perechi[i][c.rol] || plin(c)) return false;
    if (!eAtribuit(c) && roluri >= buget) return false;   // n-are pentru cine
    perechi[i][c.rol] = { ...c, abatere_min: cand_d(treceri[i], c) };
    const k = `${c.shift_number}|${c.rol}`;
    folosite.set(k, (folosite.get(k) ?? 0) + 1);
    roluri++;
    return true;
  };

  // ── granițele COMUNE se împart pe ordinea fizică, nu pe ceas ──
  // La 15:30 la Draxelmaier sfârșitul schimbului 1 și începutul lui 2 sunt același minut,
  // deci ceasul nu poate spune care atingere e care — și tocmai acolo sunt cele mai multe
  // curse. Ordinea, însă, e sigură: oamenii schimbului următor trebuie ADUȘI înainte ca
  // cei care au terminat să fie LUAȚI. Deci, dintre atingerile din fereastră, cea mai
  // devreme e livrarea și cea mai târzie e ridicarea. Dacă e una singură, ea le face pe
  // amândouă — cazul spus de Ion: vine plină cu o rută, pleacă plină cu alta.
  const peMinut = new Map();
  for (const c of cand) {
    if (!peMinut.has(c.minuteZi)) peMinut.set(c.minuteZi, []);
    peMinut.get(c.minuteZi).push(c);
  }
  for (const [minut, grup] of peMinut) {
    // pe granița comună se împart doar rolurile schimburilor din GRAFIC; un schimb
    // neatribuit își poate lua rolul abia în faza lacomă, dacă mai e buget
    const liv = grup.find((c) => c.rol === 'livrare' && eAtribuit(c));
    const rid = grup.find((c) => c.rol === 'ridicare' && eAtribuit(c));
    if (!liv || !rid) continue;
    const inFereastra = treceri
      .map((t, i) => ({ i, t }))
      .filter(({ t }) => dist(minuteZiLocal(t.tIn), minut) <= tol || dist(minuteZiLocal(t.tOut), minut) <= tol)
      .sort((a, b) => a.t.tIn - b.t.tIn);
    if (!inFereastra.length) continue;
    if (inFereastra.length === 1) { pune(inFereastra[0].i, liv); pune(inFereastra[0].i, rid); }
    else {
      // cele mai devreme atingeri livrează, cele mai târzii ridică — câte una de fiecare
      // parte pentru fiecare cursă pe care mașina o are în schimbul ăla
      const n = Math.min(capac(liv), Math.floor(inFereastra.length / 2)) || 1;
      for (let k = 0; k < n; k++) pune(inFereastra[k].i, liv);
      for (let k = 0; k < n; k++) pune(inFereastra[inFereastra.length - 1 - k].i, rid);
    }
  }

  // ── restul: cea mai apropiată atingere ia rolul, fiecare rol o singură dată ──
  const optiuni = [];
  treceri.forEach((t, i) => {
    for (const c of cand) optiuni.push({ i, c, d: cand_d(t, c) });
  });
  optiuni.sort((a, b) => (eAtribuit(b.c) - eAtribuit(a.c)) || a.d - b.d || a.i - b.i);
  for (const o of optiuni) {
    if (o.d > tol) continue;
    if (plin(o.c)) continue;
    // o atingere ia un al doilea rol doar dacă nu-l poate lua o atingere încă nefolosită
    const areDejaAltRol = perechi[o.i].livrare || perechi[o.i].ridicare;
    if (areDejaAltRol && optiuni.some((x) => x.c === o.c && x.d <= tol
        && !perechi[x.i].livrare && !perechi[x.i].ridicare)) continue;
    pune(o.i, o.c);
  }
  return perechi;
}

/**
 * Ce e segmentul dinaintea unei atingeri și ce e cel de după.
 *
 * O atingere poate avea DOUĂ roluri deodată, și asta e cazul cel mai des întâlnit la
 * ora de mijloc. Ion, 17.09: «când ruta nu se repetă în toate schimburile, el la tur
 * aduce o rută, iar în același retur ea altă rută; ruta care a adus-o acum, la retur o
 * ia peste 8 ore». Adică la 15:30 la Draxelmaier mașina vine PLINĂ cu oamenii
 * schimbului 2 ai unei rute și pleacă PLINĂ cu oamenii schimbului 1 ai alteia — o
 * singură oprire la poartă, două curse diferite, ale unor rute diferite.
 *
 * Cu o singură etichetă pe atingere, jumătate din drumul acela plin se socotea gol și
 * se punea pe ruta greșită. De aceea fiecare capăt al opririi își are rolul lui:
 *   · sosirea e plină dacă atingerea are o LIVRARE (a adus schimbul care începe),
 *     goală dacă are doar o ridicare (a venit după oameni);
 *   · plecarea e plină dacă are o RIDICARE, goală dacă are doar o livrare.
 */
export function stareApropiere(pereche) {
  const p = pereche ?? {};
  if (p.livrare) return { stare: 'plin', motiv: null, shift_number: p.livrare.shift_number };
  if (p.ridicare) return { stare: 'gol', motiv: 'vine să ia schimbul', shift_number: p.ridicare.shift_number };
  return { stare: 'necunoscut', motiv: 'nicio graniță aproape', shift_number: null };
}

export function starePlecare(pereche) {
  const p = pereche ?? {};
  if (p.ridicare) return { stare: 'plin', motiv: null, shift_number: p.ridicare.shift_number };
  if (p.livrare) return { stare: 'gol', motiv: 'tocmai a livrat schimbul', shift_number: p.livrare.shift_number };
  return { stare: 'necunoscut', motiv: 'nicio graniță aproape', shift_number: null };
}

/**
 * Opririle SCURTE de pe un interval — martorul independent pentru plin/gol.
 *
 * Ion, 17.09: «mașina când merge acasă la șofer nu are opriri, ori opririle sunt haotice;
 * în sens se verifică foarte ușor returul sau turul gol». Are dreptate, dar opririle pe
 * care le salvăm azi (`lde_gps_stops`) cer 90 de secunde — iar urcarea a cinci oameni
 * într-un sat ține 30-40. Măsurat pe primele curse scrise: 287 din 560 de curse „pline"
 * ieșeau cu ZERO opriri, iar segmentele goale aveau mai multe decât cele pline (1,62 față
 * de 0,77) — exact pe dos, fiindcă oprirea de acasă și cea de la magazin trec de 90 de
 * secunde, iar cea din sat nu.
 *
 * `inSat` e un filtru dat din afară. Cu el se pot pune două întrebări diferite: «a oprit
 * într-un sat?» (migr. 369) și, mai tare, «a oprit într-un sat AL RUTEI LUI?» — regula lui
 * Ion, 18.09: «dacă auto repetă opririle cum este pe rută, auto a avut pasageri». A doua
 * deosebește oprirea la a treia stație a rutei de cea la magazinul de pe drumul spre casă.
 *
 * Se numără din GEOMETRIE, nu din viteza raportată de tracker: câmpul `speed` lipsește pe
 * o parte din dispozitive, iar cu el ieșeau curse de 94 km prin 38 de sate cu ZERO opriri.
 * Punctele vin la ~30 de secunde, deci o oprire = puncte consecutive strânse sub `razaKm`
 * care acoperă cel puțin `pragS` secunde. Se sar locurile care nu spun nimic despre cursă:
 * poarta uzinei (staționare de 17-51 min) și baza șoferului.
 */
export function opririScurte(pts, from, to, { pragS = 40, razaKm = 0.15, exclude = [], inSat = null } = {}) {
  let n = 0, i = Math.max(0, from);
  const deSarit = (p) => exclude.some((e) => e && hav(p, e) <= (e.raza ?? 1.0));
  while (i < to) {
    let j = i;
    while (j + 1 <= to && hav(pts[i], pts[j + 1]) <= razaKm) j++;
    const secunde = (pts[j].t - pts[i].t) / 1000;
    // Dacă se cere, se numără DOAR opririle din sat. Ion: opririle unui drum gol sunt
    // haotice — la magazin, la o benzinărie, la o intersecție — iar cele ale unui drum
    // plin sunt acolo unde stau oamenii. Numărul brut nu desparte nimic (măsurat pe
    // 16.09: 3,40 pe segmentele pline față de 3,25 pe cele goale).
    if (j > i && secunde >= pragS && !deSarit(pts[i]) && (!inSat || inSat(pts[i]))) n++;
    i = j === i ? i + 1 : j;
  }
  return n;
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
/**
 * Staționările din [from, to]: grupuri de puncte la ≤150 m unul de altul, de cel puțin
 * `pragS` secunde. Aceeași geometrie ca `opririScurte`, dar întoarce popasurile, nu numărul.
 */
export function popasuri(pts, from, to, { pragS = 40, razaKm = 0.15 } = {}) {
  const out = [];
  let i = Math.max(0, from);
  while (i < to) {
    let j = i;
    while (j + 1 <= to && hav(pts[i], pts[j + 1]) <= razaKm) j++;
    const secunde = (pts[j].t - pts[i].t) / 1000;
    if (j > i && secunde >= pragS) out.push({ from: i, to: j, secunde });
    i = j === i ? i + 1 : j;
  }
  return out;
}

/** Cea mai lungă staționare din [from, to]; null dacă nu e niciuna. */
export function celMaiLungPopas(pts, from, to, razaKm = 0.15) {
  let best = null;
  for (const p of popasuri(pts, from, to, { pragS: 0, razaKm })) if (!best || p.secunde > best.secunde) best = p;
  return best;
}

export function segmenteZi(pts, calc, treceri, perechi) {
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
    // Punctul de întoarcere = SFÂRȘITUL celei mai lungi staționări dintre cele două vizite
    // (pauza de acasă sau dintre ture), dacă ține măcar PAUZA_INTOARCERE_MIN; altfel, cel
    // mai depărtat punct de poartă. Doar depărtarea înșela acolo unde capătul rutei nu e și
    // punctul cel mai depărtat în linie dreaptă: Covalschi, 503BRAR/16.09, stă 335 de
    // minute acasă la Lalova, pleacă la 21:22 și oprește în Slobozia-Horodiște și
    // Horodiște, dar tăietura cădea la 21:50, pe drumul spre Mincenii de Jos. Primii 33 km
    // ai turului se scriau pe returul dinainte, turul „începea" la Mincenii de Jos și
    // etalonul lui, la fel — iar livrarea lui ieșea 51 km/zi, deși ruta începe la el în sat.
    const poarta = pts[t.iOut];
    let vf = t.iOut, vd = -1;
    for (let i = t.iOut; i <= pana; i++) { const d = hav(pts[i], poarta); if (d > vd) { vd = d; vf = i; } }
    const pauza = celMaiLungPopas(pts, t.iOut, pana);
    if (pauza && pauza.secunde >= PAUZA_INTOARCERE_MIN * 60) vf = pauza.to;
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
