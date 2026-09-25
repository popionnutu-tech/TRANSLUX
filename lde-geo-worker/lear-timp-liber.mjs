// Mișcările în timpul liber ale autobuzelor de uzină — «lanțul muncii» (ION-57).
//
// Ion, 24.09.2026: «cum noi identificăm dacă pe viitor un șofer va vrea în timpul liber să
// taxuiască? … am nevoie automatizat, nu manual să mă uit».
//
// Munca nu e o cursă, e un LANȚ. O ancoră = oprire la poartă (≥ 2 min sub 4 noduri, în raza
// porții) cu SOSIREA într-o fereastră de tur sau PLECAREA într-o fereastră de retur, într-o zi
// lucrătoare a uzinei. Lanțul se întinde de la ancoră înapoi și înainte peste cursele vecine
// cât timp pauza dintre ele e sub 2 h — sau e la poartă/parc, unde așteptarea e muncă — și
// până când mașina ajunge acasă. Tot ce e în lanț e muncă. Drumul la parc cu oprire ≥ 30 min e
// reparație; cursa între două case e navetă; ce rămâne e TIMP LIBER: listat cu ora, km,
// opririle și dacă locul se repetă.
//
// De ce nu «cursa fără poartă»: sonda pe 14–20.09 a dat 758 km/săpt. de curse fără poartă, dar
// aproape toți erau drumuri de poziționare la capătul rutei (061COY Todirești→Bocșa înainte de
// tur, 504BRAR poartă→Măcărești cu așteptare 19′). Lanțul le vede ca muncă; săptămâna aia lasă
// 67 km «liber» pe toată flota.
//
// Ce rămâne orb, spus deschis: o ieșire privată lipită de o atingere a porții (poartă → Fălești
// 3 h → poartă) intră în lanț ca muncă. Km-ii din lanț care ies din culoare se arată ca «ocol»,
// dar nu intră în alarmă — Ion, 24.09, pe exact astfel de rânduri: «aici se transportă uzina».
//
// Modulul e PUR: primește puncte și un context, nu citește nimic, nu scrie nimic, nu se uită la
// ceas. Tot ce depinde de date externe vine injectat: `numeLoc(p)`, porțile altor uzine, ferestrele,
// casa, alimentările, `sfarsitDate`. Nu citește câmpuri puse pe puncte de alți (p.dt,
// p._cursaLaPoarta): își face DTO-urile lui. Nu consultă șoferi sau grafice — doar urma mașinii.

export const PRAGURI = {
  R_POARTA: 0.7,          // km — «la poartă»
  R_POARTA_PAUZA: 1.5,    // km — o pauză lungă atât de aproape de poartă e așteptare, nu rupe lanțul
  R_PARC: 0.5,            // km — depozitul din Bălți; poarta vest Drăxlmaier e la 0,7 km de el, deci raza nu poate fi mai mare
  R_PARC_ZONA: 3,         // km — zona de reparație: drumurile de dus/întors pleacă de aici
  PARC_OPRIRE_MIN: 2,     // min — ORICE oprire la depozit e drum de parc (Ion, 25.09); trecerea prin oraș nu oprește acolo
  R_CASA: 3,              // km — «acasă» (plafon; se ia min(3, d(casă, poartă)/2))
  R_STAT: 0.3,            // km — staționare
  PAUZA_MIN: 20,          // min — o staționare atât de lungă taie cursa
  PAUZA_LANT_MIN: 120,    // min — o pauză atât de lungă rupe lanțul (dacă nu-i la poartă/parc)
  V_LENT: 4,              // noduri — sub atât e oprire
  OPRIRE_MIN: 2,          // min — oprire în cursă (unde a urcat/coborât cineva)
  OPRIRE_POARTA_SEC: 120, // s — timp lent la poartă ca să se scrie «oprire» (informativ: ancora nu o cere,
                          // vezi mai jos la ancore)
  CASA_PAUZA_MIN: 60,     // min — o pauză acasă atât de lungă rupe lanțul; mai scurtă, e drum prin casă
  GOL_SEMNAL_MIN: 30,     // min — gol de semnal: altă cursă
  GOL_DEPLASARE_KM: 1,    // km — golul cu deplasare peste atât e drum nevăzut (neclar)
  LANT_MAX_ORE: 14,       // plafonul lanțului de la ancoră, în fiecare sens
  LANT_MAX_CURSE: 8,
  BRAMBURA_MIN_KM: 5,     // km pe drum neobișnuit într-o cursă de muncă, ca să se scrie «brambura»
  BRAMBURA_ZILE: 2,       // o bucată de drum e «a rutei» dacă mașina a trecut pe ea în atâtea zile diferite
  PRAG_ALARMA_BRAMBURA_KM: 50, // km brambura pe săptămână → steag, separat de liber
  PRAG_ALARMA_KM: 50,     // km liber pe săptămână → steag
  R_REPETA: 1,            // km — «același loc» în alte zile
  ALIMENTARE_MIN: 20,     // ±min între rândul de alimentare și o oprire a mașinii
  R_ALIMENTARE: 5,        // km — stația trebuie să fie lângă casă, poartă sau culoar
  MARGINE_ORE: 4,         // h — cursa fără ancoră care atinge capătul datelor e neclară
  CASA2_ORE: 6,           // h — a doua casă: oprire care acoperă o noapte, atât de lungă
  CASA2_NOPTI: 2,         // …în atâtea nopți (sau o singură oprire ≥ 24 h)
  SALT_KM: 5,             // km — salt GPS între două puncte: nu se numără
  ZI_SCHIMB_ORE: 2.5,     // ziua «de schimb» începe la 02:30 (capătul ferestrelor §3.3)
  NOAPTE_S3: [23 * 60, 6 * 60], // schimbul 3, neanalizat: atingeri ale porții în 23:00–06:00
};

export const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };

// Kilometrii unui pas al urmei: același pentru modul și pentru `kmZi` din worker, ca ecuația de
// control să se închidă. Saltul GPS nu se numără; nici deriva mașinii oprite.
export function kmPas(prev, p, saltKm = PRAGURI.SALT_KM) {
  if (!prev) return 0;
  if (p.v <= 1 && prev.v <= 1) return 0;
  const d = hav(prev, p);
  return d < saltKm ? d : 0;
}

const minuteZi = (ctx, t) => { const l = ctx.local(t); return l.getUTCHours() * 60 + l.getUTCMinutes(); };
const ziLoc = (ctx, t, oreInapoi = 0) => new Date(ctx.local(t).getTime() - oreInapoi * 3600000).toISOString().slice(0, 10);
const inFereastra = (m, f) => f.de_la_min <= f.pana_la_min
  ? (m >= f.de_la_min && m < f.pana_la_min)
  : (m >= f.de_la_min || m < f.pana_la_min);
const dow = zi => new Date(zi + 'T12:00:00Z').getUTCDay();
const hhmm = (ctx, t) => ctx.local(t).toISOString().slice(11, 16);

// ─── cursele, cu opririle și atingerile porții ───────────────────────────────
// Tăiere la staționări ≥ 20′ (300 m) și la goluri de semnal > 30′. Deriva mașinii oprite (v ≤ 1)
// nu mută ancora staționării — altfel o noapte cu derivă > 300 m nu se mai vedea ca oprire și
// seara, noaptea și dimineața se lipeau într-o singură «cursă» de 14 ore.
export function curseCuOpriri(pts, ctx) {
  const P = { ...PRAGURI, ...(ctx.praguri || {}) };
  const out = [];
  let cur = null, ancora = null, deCand = null, prev = null, parcat = null;
  const inchide = (panaLa, motivGol) => {
    if (cur) {
      cur.pana_la = panaLa ?? cur.pts[cur.pts.length - 1].t;
      if (cur.km >= 1) out.push(finalizeaza(cur, ctx, P));
    }
    cur = null; ancora = null; deCand = null;
    if (motivGol) out.push(motivGol);
  };
  for (const p of pts) {
    if (prev && (p.t - prev.t) / 60000 > P.GOL_SEMNAL_MIN) {
      // gol de semnal: cursa de dinainte se închide; dacă mașina s-a mutat mult în gol, drumul
      // nevăzut e o bucată separată, neclară
      const depl = hav(prev, p);
      inchide(prev.t, depl > P.GOL_DEPLASARE_KM
        ? { gol: true, de_la: prev.t, pana_la: p.t, km: depl, p0: prev, p1: p, pts: [prev, p] } : null);
      parcat = null;
    }
    if (!cur) {
      // parcată: cursa următoare începe abia când se mișcă iar (v > 1 sau s-a dus din loc)
      if (parcat && p.v <= 1 && hav(parcat, p) <= 1) { prev = p; continue; }
      cur = { pts: [p], km: 0, de_la: p.t }; ancora = p; deCand = p.t; parcat = null; prev = p; continue;
    }
    if (hav(ancora, p) <= P.R_STAT) {
      if ((p.t - deCand) / 60000 >= P.PAUZA_MIN) {
        // staționare ≥ 20′: cursa s-a terminat când s-a oprit (deCand), nu acum; punctele stării
        // rămân în cursă, ca oprirea la poartă/parc să se vadă, dar timpul ei e PAUZĂ între curse
        inchide(deCand); parcat = p; prev = p; continue;
      }
    } else if (p.v > 1 || prev.v > 1) { ancora = p; deCand = p.t; }   // s-a mutat, sau tocmai s-a oprit după mers
    cur.km += kmPas(prev, p, P.SALT_KM);
    cur.pts.push(p);
    prev = p;
  }
  inchide();
  // pauzele dintre curse (staționarea care le-a tăiat, sau golul). O pauză la poartă e o
  // atingere a porții pentru amândouă cursele: sosirea cursei de dinainte, plecarea celei de după.
  for (let i = 0; i < out.length; i++) {
    const c = out[i], u = out[i - 1];
    c.pauzaInainte = u ? { min: (c.de_la - u.pana_la) / 60000, p: u.p1 ?? u.pts[u.pts.length - 1], gol: !!u.gol || !!c.gol } : null;
    if (u) u.pauzaDupa = c.pauzaInainte;
    if (u && !c.pauzaInainte.gol && c.pauzaInainte.min >= P.OPRIRE_POARTA_SEC / 60 && hav(c.pauzaInainte.p, ctx.poarta) <= P.R_POARTA) {
      if (!u.gol) u.atingeriPoarta.push({ t_sosire: u.pana_la, t_plecare: u.pana_la, min: c.pauzaInainte.min, oprire: true, pozitie: 'final', dinPauza: true });
      if (!c.gol) c.atingeriPoarta.push({ t_sosire: c.de_la, t_plecare: c.de_la, min: c.pauzaInainte.min, oprire: true, pozitie: 'start', dinPauza: true });
    }
  }
  return out;
}

function finalizeaza(c, ctx, P) {
  const pts = c.pts;
  c.p0 = pts[0]; c.p1 = pts[pts.length - 1];
  // km pe zi de lucru, punct cu punct — apartenența la săptămână se decide aici, nu pe cursă
  c.kmPeZi = new Map();
  let depMax = 0;
  for (let i = 1; i < pts.length; i++) {
    const k = kmPas(pts[i - 1], pts[i], P.SALT_KM);
    if (k) { const z = ctx.ziLucru(pts[i].t); c.kmPeZi.set(z, (c.kmPeZi.get(z) || 0) + k); }
  }
  for (const p of pts) { const d = hav(p, ctx.poarta); if (d > depMax) depMax = d; }
  c.depMax = depMax;
  // opriri în cursă: șiruri de puncte lente pe loc, ≥ 2′; și atingerile porții
  c.opriri = []; c.atingeriPoarta = [];
  let st = null;
  const inchideOprire = () => { if (st && (st.pana - st.de) / 60000 >= P.OPRIRE_MIN) c.opriri.push({ t: st.de, pana: st.pana, min: (st.pana - st.de) / 60000, lat: st.p.lat, lon: st.p.lon }); st = null; };
  for (const p of pts) {
    if (p.v <= P.V_LENT && st && hav(st.p, p) <= P.R_STAT) { st.pana = p.t; continue; }
    inchideOprire();
    if (p.v <= P.V_LENT) st = { p, de: p.t, pana: p.t };
  }
  inchideOprire();
  let at = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (hav(p, ctx.poarta) <= P.R_POARTA) {
      if (!at) at = { t_sosire: p.t, t_plecare: p.t, sec_lent: 0, i0: i };
      at.t_plecare = p.t; at.i1 = i;
      if (p.v <= P.V_LENT) { const urm = pts[i + 1]; at.sec_lent += urm ? Math.min((urm.t - p.t) / 1000, 60) : 0; }
    } else if (at) { c.atingeriPoarta.push(at); at = null; }
  }
  if (at) c.atingeriPoarta.push(at);
  for (const a of c.atingeriPoarta) {
    a.min = (a.t_plecare - a.t_sosire) / 60000;
    a.oprire = a.sec_lent >= P.OPRIRE_POARTA_SEC;
    a.pozitie = a.i0 === 0 ? 'start' : a.i1 === pts.length - 1 ? 'final' : 'mijloc';
  }
  // parcul: oprire ≥ 30′ în raza mică; zona mare doar ca semn
  c.parc = { zona: pts.some(p => hav(p, ctx.parc) <= P.R_PARC_ZONA),
    oprireMin: Math.max(0, ...c.opriri.filter(o => hav(o, ctx.parc) <= P.R_PARC).map(o => o.min)) };
  return c;
}

// ─── a doua casă ─────────────────────────────────────────────────────────────
// 043BRAU stă la Horești luni–vineri și pleacă la Drăgănești pe weekend: drumul între ele e
// navetă, nu timp liber. Dar un loc de parcare repetat (taxare din același loc, 3 h sâmbăta și
// 3 h duminica) NU e casă: a doua casă cere o oprire care acoperă o NOAPTE (00:00–05:00), ≥ 6 h,
// în cel puțin două nopți — sau o singură oprire de peste 24 h.
export function caseSecundare(curse, ctx) {
  const P = { ...PRAGURI, ...(ctx.praguri || {}) };
  const locuri = [];
  for (const c of curse) {
    const pz = c.pauzaDupa; if (!pz || pz.gol) continue;
    const ore = pz.min / 60; if (ore < P.CASA2_ORE) continue;
    const p = pz.p;
    if (hav(p, ctx.poarta) <= P.R_POARTA_PAUZA || hav(p, ctx.parc) <= P.R_PARC_ZONA) continue;
    if (ctx.casaC && hav(p, ctx.casaC) <= P.R_CASA) continue;
    // acoperă o noapte: cel puțin o dată 00:00–05:00 locale între început și sfârșit
    const de = c.pana_la, pana = new Date(+c.pana_la + pz.min * 60000);
    let acopera = false; const nopti = new Set();
    for (let t = +de; t <= +pana; t += 3600000) { const m = minuteZi(ctx, new Date(t)); if (m >= 0 && m < 300) { acopera = true; nopti.add(ziLoc(ctx, new Date(t))); } }
    if (!acopera) continue;
    let l = locuri.find(x => hav(x, p) <= P.R_REPETA);
    if (!l) { l = { lat: p.lat, lon: p.lon, nopti: new Set(), oreMax: 0 }; locuri.push(l); }
    for (const n of nopti) l.nopti.add(n); if (ore > l.oreMax) l.oreMax = ore;
  }
  return locuri.filter(l => l.nopti.size >= P.CASA2_NOPTI || l.oreMax >= 24).map(l => ({ lat: l.lat, lon: l.lon, nopti: l.nopti.size }));
}

// ─── etichetarea ─────────────────────────────────────────────────────────────
export function eticheteaza(curse, ctx) {
  const P = { ...PRAGURI, ...(ctx.praguri || {}) };
  const case_ = [ctx.casaC, ...(ctx.caseSecundare ?? caseSecundare(curse, ctx))].filter(Boolean);
  const rCasa = ctx.casaC ? Math.min(P.R_CASA, hav(ctx.casaC, ctx.poarta) / 2) : P.R_CASA;
  const laCasa = p => case_.some(c => hav(p, c) <= rCasa);
  const eZiLucru = zi => { const w = dow(zi); return w === 0 ? !!ctx.lucreazaDuminica : w === 6 ? !!ctx.lucreazaSambata : true; };
  const ziSchimb = t => ziLoc(ctx, t, P.ZI_SCHIMB_ORE);
  const ferTur = (ctx.ferestre || []).filter(f => f.sens === 'tur'), ferRetur = (ctx.ferestre || []).filter(f => f.sens === 'retur');

  // 1. ancorele. Ancora NU cere oprire la poartă: 320BRAT lasă oamenii de la Taxobeni seara
  // trecând prin raza porții la 40 km/h (o oprire de 30 s cade între două puncte la 20 s), iar
  // Ion, 24.09, pe rândurile alea: «aici se transportă uzina». Trecerea privată prin oraș e
  // ținută afară de FEREASTRĂ (la 10:00 nu e nicio fereastră), nu de oprire.
  const E = curse.map((c, i) => ({ i, c, eticheta: null, motiv: null, ancora: null, lant: null, km_brambura: 0, km_alimentare: 0 }));
  for (const e of E) {
    if (e.c.gol) continue;
    for (const a of e.c.atingeriPoarta) {
      const mS = minuteZi(ctx, a.t_sosire), mP = minuteZi(ctx, a.t_plecare);
      const fT = ferTur.find(f => inFereastra(mS, f)), fR = ferRetur.find(f => inFereastra(mP, f));
      if (fT && eZiLucru(ziSchimb(a.t_sosire))) { e.ancora = { tip: 'tur', schimb: fT.shift_number, t: a.t_sosire }; break; }
      if (fR && eZiLucru(ziSchimb(a.t_plecare))) { e.ancora = { tip: 'retur', schimb: fR.shift_number, t: a.t_plecare }; break; }
      const [n0, n1] = P.NOAPTE_S3;
      if (mS >= n0 || mS < n1 || mP >= n0 || mP < n1) e.neanalizat = true;
    }
  }
  // 2. lanțurile: de la fiecare ancoră, înapoi și înainte
  const bariera = (pz) => {
    if (!pz) return true;
    if (pz.gol) return pz.min >= P.PAUZA_LANT_MIN;
    if (pz.min < P.PAUZA_LANT_MIN) return false;
    // întâi poarta/parcul (continuă lanțul), abia apoi casa (rupe)
    if (hav(pz.p, ctx.poarta) <= P.R_POARTA_PAUZA || hav(pz.p, ctx.parc) <= P.R_PARC_ZONA) return false;
    return true;
  };
  for (const e of E) if (e.ancora) {
    e.lant = e.lant ?? e.i; e.eticheta = 'muncă'; e.motiv = `ancoră ${e.ancora.tip} s${e.ancora.schimb} la ${hhmm(ctx, e.ancora.t)}`;
    // înapoi
    for (let j = e.i - 1, n = 0; j >= 0; j--, n++) {
      const urm = E[j + 1];
      if (E[j].c.gol) { if (bariera(E[j].c.pauzaDupa) || (E[j].c.km > P.GOL_DEPLASARE_KM)) break; continue; }
      // cursa de după a plecat de acasă după o pauză lungă: lanțul începe acolo. O trecere scurtă
      // prin casă rămâne în lanț — 456BRAX (Todirești, pe drumul rutei B7) strânge satele, trece
      // pe acasă 46′ și abia apoi merge la poartă.
      if (laCasa(urm.c.p0) && (urm.c.pauzaInainte?.min ?? Infinity) >= P.CASA_PAUZA_MIN) break;
      if (bariera(urm.c.pauzaInainte)) break;
      if (n >= P.LANT_MAX_CURSE || (e.ancora.t - E[j].c.de_la) / 3600000 > P.LANT_MAX_ORE) { E[j].plafon = true; break; }
      if (E[j].eticheta === 'muncă') break;
      E[j].eticheta = 'muncă'; E[j].lant = e.lant; E[j].motiv = `în lanț, înaintea ancorei de la ${hhmm(ctx, e.ancora.t)} (pauza ${Math.round(urm.c.pauzaInainte?.min ?? 0)}′)`;
      if (laCasa(E[j].c.p0) && (E[j].c.pauzaInainte?.min ?? Infinity) >= P.CASA_PAUZA_MIN) break;
    }
    // înainte
    for (let j = e.i + 1, n = 0; j < E.length; j++, n++) {
      const ant = E[j - 1];
      if (E[j].c.gol) { if (bariera(E[j].c.pauzaInainte) || (E[j].c.km > P.GOL_DEPLASARE_KM)) break; continue; }
      if (laCasa(ant.c.p1) && (E[j].c.pauzaInainte?.min ?? Infinity) >= P.CASA_PAUZA_MIN) break;   // a ajuns acasă și a stat
      if (bariera(E[j].c.pauzaInainte)) break;
      if (n >= P.LANT_MAX_CURSE || (E[j].c.pana_la - e.ancora.t) / 3600000 > P.LANT_MAX_ORE) { E[j].plafon = true; break; }
      if (E[j].eticheta === 'muncă') break;
      E[j].eticheta = 'muncă'; E[j].lant = e.lant; E[j].motiv = `în lanț, după ancora de la ${hhmm(ctx, e.ancora.t)} (pauza ${Math.round(E[j].c.pauzaInainte?.min ?? 0)}′)`;
      if (laCasa(E[j].c.p1) && (E[j].c.pauzaDupa?.min ?? Infinity) >= P.CASA_PAUZA_MIN) break;
    }
  }
  // 3. reparație, navetă, neclar, liber — cu prioritatea neanalizat > reparație > navetă > muncă > neclar > liber
  const parcPauza = pz => pz && !pz.gol && pz.min >= P.PARC_OPRIRE_MIN && hav(pz.p, ctx.parc) <= P.R_PARC;
  for (const e of E) {
    const c = e.c;
    if (c.gol) { e.eticheta = 'neclar'; e.motiv = `gol de semnal ${Math.round((c.pana_la - c.de_la) / 60000)}′ cu ${c.km.toFixed(0)} km nevăzuți`; continue; }
    if (e.neanalizat && !e.ancora) { e.eticheta = 'neanalizat'; e.motiv = 'oprire la poartă în 23:00–06:00, schimbul 3 nu se analizează'; continue; }
    // altă uzină: cursa OPREȘTE la poarta altei uzine din bază (Drăxlmaier, Florești, SEBN…) — nu-i LEAR,
    // nu-i liber. Înaintea parcului: poarta vest Drăxlmaier e la 700 m de depozitul nostru.
    const altaUz = (ctx.alteUzine || []).find(u => c.opriri.some(o => hav(o, u) <= (u.r ?? 0.5) + 0.2) ||
      [c.pauzaInainte, c.pauzaDupa].some(pz => pz && !pz.gol && hav(pz.p, u) <= (u.r ?? 0.5) + 0.2));
    if (altaUz) { e.eticheta = 'altă uzină'; e.motiv = `oprește la poarta ${altaUz.nume}`; e.uzina = altaUz.nume; continue; }
    const reparatie = c.parc.oprireMin >= P.PARC_OPRIRE_MIN || parcPauza(c.pauzaInainte) || parcPauza(c.pauzaDupa);
    if (reparatie) { e.eticheta = 'reparație'; e.motiv = 'oprire la depozitul din Bălți — drum de parc'; continue; }
    const c0 = case_.findIndex(x => hav(c.p0, x) <= rCasa), c1 = case_.findIndex(x => hav(c.p1, x) <= rCasa);
    if (c0 >= 0 && c1 >= 0 && c0 !== c1) { e.eticheta = 'navetă'; e.motiv = 'de la o casă la cealaltă'; continue; }
    if (e.eticheta === 'muncă') continue;
    if (c.parc.zona) { e.eticheta = 'neclar'; e.motiv = 'în zona parcului, dar fără oprire ≥ 30′ în el'; continue; }
    if (e.plafon) { e.eticheta = 'neclar'; e.motiv = 'lanț rupt de plafon (14 h / 8 curse)'; continue; }
    if (ctx.sfarsitDate && (ctx.sfarsitDate - c.pana_la) / 3600000 < P.MARGINE_ORE && !laCasa(c.p1) && !(c.pauzaDupa && c.pauzaDupa.min >= P.PAUZA_LANT_MIN)) {
      e.eticheta = 'neclar'; e.motiv = 'cursă neîncheiată la marginea datelor — ancora poate veni după'; continue; }
    // capătul rutei care e chiar casa (320BRAT la Unțești, capătul lui B10) nu spune nimic
    if (ctx.capeteRute && ctx.capeteRute.some(k => !laCasa(k) && c.pts.some(p => hav(p, k) <= 1.5)) && c.atingeriPoarta.length === 0) {
      e.eticheta = 'neclar'; e.motiv = 'atinge capătul unei rute fără să atingă poarta — poarta pierdută de tracker?'; continue; }
    e.eticheta = 'liber'; e.motiv = 'nicio ancoră și niciun lanț';
  }
  // 4. atribute km: brambura (în curse muncă) și alimentarea (în curse ne-muncă)
  // Drumul rutei NU e scheletul fix, ci obișnuința săptămânii: o celulă de ~500 m e «a rutei» dacă
  // mașina a trecut pe ea în cel puțin două zile diferite. Ce e trecut o singură zi, într-o cursă de
  // muncă, e brambura — 537BRAT joi acasă pe alt drum (23 km), 807MUM miercuri pe la Fălești. Ion,
  // 25.09: «nu e parte a rutei așa cum acum se lucrează?» — scheletul nu mai era drumul de azi.
  const zileCelula = new Map();
  const cheie = p => `${Math.floor(p.lat / 0.005)}|${Math.floor(p.lon / 0.005)}`;
  for (const e of E) { if (e.eticheta !== 'muncă') continue;
    for (const p of e.c.pts) { const k = cheie(p); if (!zileCelula.has(k)) zileCelula.set(k, new Set()); zileCelula.get(k).add(ctx.ziLucru(p.t)); } }
  const obisnuit = p => (zileCelula.get(cheie(p))?.size ?? 0) >= P.BRAMBURA_ZILE;
  for (const e of E) {
    const c = e.c; if (c.gol) continue;
    if (e.eticheta === 'muncă') {
      let k = 0; for (let i = 1; i < c.pts.length; i++) { const a = c.pts[i - 1], b = c.pts[i]; const d = kmPas(a, b, P.SALT_KM); if (!d) continue;
        if (!obisnuit(a) && !obisnuit(b)) k += d; }
      e.km_brambura = k >= P.BRAMBURA_MIN_KM ? +k.toFixed(1) : 0;
    } else if (e.eticheta === 'liber' || e.eticheta === 'neclar') {
      for (const al of ctx.alimentari || []) {
        const opr = c.opriri.filter(o => Math.abs(o.t - al.t) / 60000 <= P.ALIMENTARE_MIN || Math.abs(o.pana - al.t) / 60000 <= P.ALIMENTARE_MIN)
          .sort((x, y) => Math.abs(x.t - al.t) - Math.abs(y.t - al.t));
        if (!opr.length) continue;
        if (opr.length > 1 && Math.abs(opr[0].t - opr[1].t) / 60000 < 5) { e.nota = 'alimentare ambiguă — două opriri în interval'; continue; }
        const st = opr[0];
        const aproape = case_.some(x => hav(st, x) <= P.R_ALIMENTARE) || hav(st, ctx.poarta) <= P.R_ALIMENTARE || obisnuit(st);
        if (!aproape) { e.nota = `alimentare la ${ctx.numeLoc ? ctx.numeLoc(st) ?? '?' : '?'}, departe de casă/poartă — nu scutește`; continue; }
        const ref = [...case_, ctx.poarta].sort((x, y) => hav(st, x) - hav(st, y))[0];
        const plafon = 2 * 1.3 * hav(ref, st) + 5;
        e.km_alimentare = +Math.min(c.km, plafon).toFixed(1);
        break;
      }
    }
  }
  return E.map(e => ({ i: e.i, eticheta: e.eticheta, motiv: e.motiv, ancora: e.ancora, lant: e.lant, km_brambura: e.km_brambura, km_alimentare: e.km_alimentare, nota: e.nota ?? null, uzina: e.uzina ?? null, plafon: !!e.plafon, cursa: e.c }));
}

// ─── rezumatul săptămânii ────────────────────────────────────────────────────
// Km-ii se numără punct cu punct după ziua de lucru (ziLucru ∈ săptămână): cursa de duminică
// 13.09 nu poate ajunge în două rapoarte. `kmZiSapt` = Σ kmZi din worker pe zilele săptămânii;
// diferența față de curse e km_stationare (deriva și pașii peste tăieturi).
export function rezumaSaptamina(etichete, ctx, kmZiSapt = null) {
  const P = { ...PRAGURI, ...(ctx.praguri || {}) };
  // Ion, 25.09: «km liber … nu este clar: e parte la rută, în afara orarului? pleacă acasă, vine
  // de acasă?» — fiecare ieșire spune de unde a plecat, unde s-a dus, unde s-a întors și când
  // față de schimb (ancora dinainte și cea de după).
  const case_ = [ctx.casaC, ...(ctx.caseSecundare ?? [])].filter(Boolean);
  const rCasa = ctx.casaC ? Math.min(P.R_CASA, hav(ctx.casaC, ctx.poarta) / 2) : P.R_CASA;
  const numeste = p => { if (!p) return null; if (case_.some(c => hav(p, c) <= rCasa)) return 'acasă'; if (hav(p, ctx.poarta) <= P.R_POARTA_PAUZA) return 'poartă';
    const n = ctx.numeLoc ? ctx.numeLoc(p) : null; return n ?? '?'; };
  const ancoraText = a => a ? `${a.tip} ${hhmm(ctx, a.t)}` : null;
  const vecin = (i, pas) => { for (let j = i + pas; j >= 0 && j < etichete.length; j += pas) { const e = etichete[j]; if (e.ancora) return ancoraText(e.ancora); } return null; };
  const km = { lucru: 0, liber: 0, reparatie: 0, naveta: 0, neclar: 0, neanalizat: 0, alta_uzina: 0, brambura: 0, alimentare: 0, nevazut: 0 };
  const cheie = { 'muncă': 'lucru', 'liber': 'liber', 'reparație': 'reparatie', 'navetă': 'naveta', 'neclar': 'neclar', 'neanalizat': 'neanalizat', 'altă uzină': 'alta_uzina' };
  const iesiri = []; const zile = new Set();
  for (const e of etichete) {
    const c = e.cursa;
    let kmS = 0;
    if (c.gol) { const z = ctx.ziLucru(c.de_la); if (ctx.inSapt(z)) kmS = c.km; }
    else for (const [z, k] of c.kmPeZi) if (ctx.inSapt(z)) kmS += k;
    if (!kmS) continue;
    const frac = c.gol ? 1 : kmS / (c.km || 1);
    km[cheie[e.eticheta]] += kmS;
    if (c.gol) km.nevazut += kmS;   // drum nevăzut în golul de semnal: kmZi nu-l are (salt ≥ 5 km), controlul îl scoate
    if (e.eticheta === 'muncă' && e.km_brambura) km.brambura += e.km_brambura * frac;
    if (e.km_alimentare) km.alimentare += e.km_alimentare * frac;
    if (e.eticheta === 'liber' || e.eticheta === 'neclar' || e.eticheta === 'navetă' || e.eticheta === 'altă uzină' || (e.eticheta === 'muncă' && e.km_brambura)) {
      const zi = ctx.ziLucru(c.de_la); zile.add(e.eticheta === 'liber' ? zi : null);
      const opriri = (c.opriri || []).map(o => ({ loc: ctx.numeLoc ? ctx.numeLoc(o) ?? null : null, min: Math.round(o.min), ora: hhmm(ctx, o.t), lat: o.lat, lon: o.lon }));
      const principal = opriri.length ? [...opriri].sort((a, b) => b.min - a.min)[0] : null;
      let dep = null; for (const p of c.pts) { const d = hav(p, ctx.poarta); if (!dep || d > dep.d) dep = { p, d }; }
      const dincolo = (() => { let d = null; for (const p of c.pts) { const dd = hav(p, ctx.poarta); if (!d || dd > d.d) d = { p, d: dd }; } return d?.p; })();
      const w = dow(zi); const eZiLucru = w === 0 ? !!ctx.lucreazaDuminica : w === 6 ? !!ctx.lucreazaSambata : true;
      iesiri.push({ zi, de_la: hhmm(ctx, c.de_la), pana_la: hhmm(ctx, c.pana_la), km: +kmS.toFixed(1),
        de_unde: numeste(c.p0), pana_unde: numeste(c.p1), cel_mai_departe: numeste(dincolo),
        dupa: vecin(e.i, -1), inainte: vecin(e.i, +1), zi_nelucratoare: !eZiLucru || undefined,
        km_brambura: e.eticheta === 'muncă' ? +(e.km_brambura * frac).toFixed(1) : undefined, uzina: e.uzina ?? undefined,
        km_alimentare: e.km_alimentare ? +(e.km_alimentare * frac).toFixed(1) : undefined,
        departare: +(c.depMax ?? 0).toFixed(1), eticheta: e.eticheta === 'muncă' ? 'brambura' : e.eticheta, motiv: e.motiv, nota: e.nota,
        loc_principal: principal?.loc ?? (dep && ctx.numeLoc ? ctx.numeLoc(dep.p) ?? null : null),
        _pl: principal ? { lat: principal.lat, lon: principal.lon } : dep?.p, repetat: false,
        opriri: opriri.slice(0, 10).map(({ lat, lon, ...o }) => o) });
    }
  }
  zile.delete(null);
  // «se repetă»: același loc (1 km) în alte zile, printre ieșirile libere
  const libere = iesiri.filter(x => x.eticheta === 'liber');
  for (const x of libere) { if (!x._pl) continue;
    const alte = new Set(libere.filter(y => y !== x && y.zi !== x.zi && y._pl && hav(x._pl, y._pl) <= P.R_REPETA).map(y => y.zi));
    x.repetat = alte.size >= 1; }
  for (const x of iesiri) delete x._pl;
  iesiri.sort((a, b) => b.km - a.km);
  const kmLiberAlarma = km.liber - km.alimentare;
  const sumaCurse = km.lucru + km.liber + km.reparatie + km.naveta + km.neclar + km.neanalizat + km.alta_uzina - km.nevazut;
  const r = (x) => +x.toFixed(1);
  return {
    km: r(kmLiberAlarma), prag_km: P.PRAG_ALARMA_KM, peste_prag: kmLiberAlarma >= P.PRAG_ALARMA_KM, zile: zile.size,
    km_brambura: r(km.brambura), prag_brambura_km: P.PRAG_ALARMA_BRAMBURA_KM, peste_prag_brambura: km.brambura >= P.PRAG_ALARMA_BRAMBURA_KM,
    km_alta_uzina: r(km.alta_uzina),
    km_lucru: r(km.lucru), km_reparatie: r(km.reparatie), km_naveta: r(km.naveta), km_neclar: r(km.neclar),
    km_neanalizat: r(km.neanalizat), km_alimentare: r(km.alimentare), km_nevazut: r(km.nevazut),
    iesiri: iesiri.slice(0, 20), si_altele: Math.max(0, iesiri.length - 20),
    control: kmZiSapt == null ? null : { km_curse: r(sumaCurse), km_zi: r(kmZiSapt), km_stationare: r(kmZiSapt - sumaCurse) },
  };
}

// ─── diagnostic (--de-ce) ────────────────────────────────────────────────────
export function explica(etichete, ctx) {
  const simb = { 'muncă': '●', 'liber': '○', 'neclar': '≈', 'reparație': '⚒', 'navetă': '⇄', 'neanalizat': '·', 'altă uzină': '⊗' };
  return etichete.map(e => { const c = e.cursa;
    const s = e.ancora ? '●' : e.eticheta === 'muncă' ? (e.lant != null && e.lant < e.i ? '↓' : '↑') : simb[e.eticheta];
    return `${s} ${hhmm(ctx, c.de_la)}–${hhmm(ctx, c.pana_la)} ${String(Math.round(c.km)).padStart(4)} km · ${e.eticheta}${e.km_brambura ? ` · brambura ${e.km_brambura} km` : ''}${e.km_alimentare ? ` · alimentare ${e.km_alimentare} km` : ''} — ${e.motiv}${e.nota ? ` (${e.nota})` : ''}`; });
}
