// Briceni (ION-73) — regulile de livrare și optimizare SEBN aplicate la Trox + suburbanele Briceni, pe o săptămână.
// Ion, 25.09.2026: «aplică regulile optimizare SEBN la Trox și suburbane»; «întoarcere goală după finalizare rută — drum
// spre casă (dacă merge spre casă), dar trebuie de verificat să nu fie rută». Plan aprobat: ~/.claude/plans (ION-73).
//
// Ziua mașinii (03:00 → 03:00, SEBN 2.4) se împarte în intervale; fiecare primește O categorie, după tabela de precedență:
//   1 cursă Trox pe rută; retur după predare ............................. CU OAMENI
//   2 cursă suburbană din orar .............................................. CU OAMENI
//   3 primul neprog al zilei de la locul nopții / ultimul spre el ........... LIVRARE
//   4 neprog tur (sat → gară) ............................................... CU OAMENI (neprogramat)
//   5 neprog retur între două curse din orar ale aceleiași rute ............. GOL PE RUTĂ
//   6 gol cu Parcul Bălți ................................................... SERVICE
//   7 gol care iese la >15 km de Briceni, satele mașinii și casă ............ DEPLASARE
//   8 gol cu opriri de urcare (30 s–5 min) în ≥2 sate ale rutei, care pleacă/ajunge la gară sau poartă ... RUTĂ NEPOTRIVITĂ
//   9 gol de la / spre locul nopții, sau pe acasă ≥20 min între curse ...... LIVRARE (între curse: doar ocolul, impartOcol)
//  10 gol între două joburi, fără casă ...................................... LEGĂTURĂ (nu e economie)
//  11 restul ................................................................ NECUNOSCUT
// Brambura (SEBN §11.3, migr. 400): în livrare / legătură / deplasare, km pe celule de ~500 m trecute în < 2 zile din cele 7,
// doar ≥5 km pe bucată; se scade din categoria bucății. Economia R1 = livrarea netă × lei/km (SEBN 9).
//   cd /root/lde-worker/briceni/cod && SUFIX=-sapt node --env-file=../../.env livrare.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { hav, GARA, POARTA, localToUtc, localMin, hhmm, normPlate, scrieAtomic, zileIntre, isoDow, ruteRaport } from './geo.mjs';
import { evenimente, bucata, tIn, tOut } from './evenimente.mjs';

export const PR = {
  PARC: { lat: 47.770, lon: 27.923, r: 0.5 },         // Parcul Bălți (SEBN 5.6)
  DEPLASARE_KM: 15, CASA_KM: 0.5, CASA_STAT_MIN: 20, OPRIRE_MIN_S: 30, OPRIRE_SCURTA_S: 300, SATE_OPRIRI_MIN: 2, SAT_KM: 1,
  NOAPTE: [20 * 60, 29 * 60],                          // 20:00 → 05:00 a doua zi
  CELULA_LAT: 0.0045, CELULA_LON: 0.0068,             // ~500 m
  BRAMBURA_MIN_KM: 5, BRAMBURA_ZILE: 2, STEAG_KM: 50, BILANT_KM: 0.5, PREDARE_CAPAT_KM: 1.5, PREDARE_MAX_MIN: 120,
  REPARATIE: 1.00, REPARATIE_MARE: 1.50, SALARIU: 1.00,
};
export const CAT = ['cuOameni', 'nepotrivita', 'golRuta', 'golTure', 'service', 'deplasare', 'livrare', 'legatura', 'necunoscut'];

const lang = (a, b) => hav(a, b);
const minDist = (p, arr) => arr.reduce((m, q) => Math.min(m, lang(p, q)), Infinity);

/**
 * Locul nopții: cea mai lungă staționare (stat/parcare) care se suprapune cu fereastra [ta, tb].
 * @param pts punctele (parcari aplicate) din fișierele zilelor care acoperă fereastra
 */
export function loculNoptii(pts, ta, tb) {
  let best = null, bd = 0;
  for (const x of pts) {
    if (!x.stat) continue;
    const d = Math.min(x.t1, tb) - Math.max(x.t0, ta);
    if (d > bd) { bd = d; best = x; }
  }
  return best && bd >= 60 * 60e3 ? { lat: best.lat, lon: best.lon, min: Math.round(bd / 60e3) } : null;
}

/**
 * Clasifică o zi. inp = { pts, opriri, legs: [{t0,t1,kind:'trox'|'predare'|'orar'|'neprog',dir,r}], ta, tb, noapteA,
 * noapteB, sateMasina: [{lat,lon}], sate: [{lat,lon,n,key}] }. Întoarce intervalele cu categoria, km, ruta atribuită.
 */
export function clasificaZi(inp) {
  const { pts, opriri = [], ta, tb, noapteA, noapteB, sateMasina = [], sate = [] } = inp;
  const legs = [...inp.legs].filter((l) => l.t1 > ta && l.t0 < tb).sort((a, b) => a.t0 - b.t0);
  const orar = legs.filter((l) => l.kind === 'orar');
  const eticheta = [];
  const prima = legs[0], ultima = legs.at(-1);
  const langa = (t, casa) => { if (!casa) return false; const p = pts.find((x) => !x.mut && tOut(x) >= t) ?? pts.at(-1); return p && lang(p, casa) <= 1; };
  for (const l of legs) {
    let cat = null, prio = 9;
    if (l.kind === 'trox' || l.kind === 'predare') { cat = 'cuOameni'; prio = 1; }
    else if (l.kind === 'orar') { cat = 'cuOameni'; prio = 2; }
    else if (l.kind === 'neprog') {
      if ((l === prima && langa(l.t0, noapteA)) || (l === ultima && langa(l.t1, noapteB))) { cat = 'livrare'; prio = 3; }
      else if (l.dir === 'tur') { cat = 'cuOameni'; prio = 4; }
      else {
        const inainte = [...orar].reverse().find((o) => o.t1 <= l.t0), dupa = orar.find((o) => o.t0 >= l.t1);
        if (inainte && dupa && inainte.r === l.r && dupa.r === l.r) { cat = 'golRuta'; prio = 5; }
        // returul de după ultima cursă din orar a rutei: orarele suburbane au doar tururi, returul duce oamenii înapoi
        // (285BRAT 15.09: gară 14:03 → Cotiujeni → Larga → Medveja, opriri de 4–5 min, apoi acasă la Cotiujeni). Doar
        // drumul care se termină acasă e livrare (regula 3, mai sus).
        else if (inainte && inainte.r === l.r && !dupa) { cat = 'cuOameni'; prio = 4; }
      }
    }
    if (cat) eticheta.push({ t0: Math.max(l.t0, ta), t1: Math.min(l.t1, tb), cat, prio, r: l.r, kind: l.kind, leg: true });
  }
  // deduplicarea: intervalul cu prioritatea mai mare taie intervalele cu prioritate mai mică
  eticheta.sort((a, b) => a.prio - b.prio || a.t0 - b.t0);
  const ocupat = [];
  for (const e of eticheta) {
    let bucati = [[e.t0, e.t1]];
    for (const o of ocupat) bucati = bucati.flatMap(([a, b]) => (o.t1 <= a || o.t0 >= b ? [[a, b]] : [[a, Math.min(b, o.t0)], [Math.max(a, o.t1), b]].filter(([x, y]) => y - x > 0)));
    for (const [a, b] of bucati) ocupat.push({ ...e, t0: a, t1: b });
  }
  ocupat.sort((a, b) => a.t0 - b.t0);
  // golurile = complementul în [ta, tb]
  const goluri = []; let c = ta;
  for (const o of ocupat) { if (o.t0 > c) goluri.push({ t0: c, t1: o.t0 }); c = Math.max(c, o.t1); }
  if (c < tb) goluri.push({ t0: c, t1: tb });
  const legsCuOameni = ocupat.filter((o) => o.leg && o.cat !== 'livrare');
  const out = [];
  for (const o of ocupat) { const b = bucata(pts, o.t0, o.t1); out.push({ ...o, km: b.km, bpts: b.pts }); }
  for (const g of goluri) {
    const b = bucata(pts, g.t0, g.t1);
    const prev = [...legsCuOameni].reverse().find((o) => o.t1 <= g.t0), next = legsCuOameni.find((o) => o.t0 >= g.t1);
    let cat = 'necunoscut', r = null, motiv = '';
    const mv = b.pts;
    if (b.km < 0.2) { out.push({ ...g, cat: 'stat', km: b.km, bpts: mv }); continue; }
    const ancore = [GARA, POARTA, ...sateMasina, ...(noapteA ? [noapteA] : []), ...(noapteB ? [noapteB] : [])];
    const departe = mv.length ? Math.max(...mv.map((p) => minDist(p, ancore))) : 0;
    // opririle scurte în sate (nu acasă) din interiorul golului
    // opririle de urcare (30 s – 5 min; sub 30 s sunt intersecții) în satele rutelor mașinii, nu acasă
    const opr = opriri.filter((o) => o.t0 >= g.t0 && o.t1 <= g.t1 && o.sec >= PR.OPRIRE_MIN_S && o.sec < PR.OPRIRE_SCURTA_S
      && !(noapteA && lang(o, noapteA) <= PR.CASA_KM) && !(noapteB && lang(o, noapteB) <= PR.CASA_KM));
    const peRuta = sateMasina.length ? sate.filter((x) => sateMasina.some((s) => lang(s, x) <= 0.1)) : sate;
    const sateOpr = new Set(opr.map((o) => { const s = peRuta.find((x) => lang(o, x) <= PR.SAT_KM); return s?.key ?? null; }).filter(Boolean));
    const sfarsit = mv.at(-1), inceput = mv[0];
    const laCapat = (p) => p && (lang(p, GARA) <= GARA.r || lang(p, POARTA) <= POARTA.r);
    // ca o cursă cu oameni: aduce la gară/poartă (tur) sau pleacă de acolo (retur); drumul de acasă spre capăt nu e rută
    // de la poartă oamenii pleacă doar în ferestrele de retur, iar acolo returul e tăiat deja: un gol care PORNEȘTE de la
    // poartă e gol (283YEK 16.09, 05:42 poartă → Trebisăuți acasă); de la gară poate fi un retur suburban neprogramat
    const laPoartaSauGara = laCapat(sfarsit) || (inceput && lang(inceput, GARA) <= GARA.r);
    // acasă la prânz: staționare ≥20 min la locul nopții (de dinainte sau de după)
    const casa = pts.find((x) => x.stat && x.t0 < g.t1 && x.t1 > g.t0 && x.t1 - x.t0 >= PR.CASA_STAT_MIN * 60e3
      && ((noapteA && lang(x, noapteA) <= PR.CASA_KM) || (noapteB && lang(x, noapteB) <= PR.CASA_KM)));
    const peAcasa = !!casa;
    const dimineata = !prev && mv[0] && noapteA && lang(mv[0], noapteA) <= 1;
    const seara = !next && sfarsit && noapteB && lang(sfarsit, noapteB) <= 1;
    if (mv.some((p) => lang(p, PR.PARC) <= PR.PARC.r)) { cat = 'service'; }
    else if (departe > PR.DEPLASARE_KM) { cat = 'deplasare'; motiv = `${departe.toFixed(0)} km de ancore`; }
    else if (sateOpr.size >= PR.SATE_OPRIRI_MIN && laPoartaSauGara) { cat = 'nepotrivita'; r = next?.r ?? prev?.r ?? null; motiv = `opriri scurte în ${sateOpr.size} sate`; }
    else if (dimineata || seara || peAcasa || (!prev && !noapteA) || (!next && !noapteB)) {
      cat = 'livrare'; r = !prev ? next?.r ?? null : !next ? prev?.r ?? null : next?.r ?? prev?.r ?? null;
      motiv = dimineata ? 'de acasă la prima cursă' : seara ? 'de la ultima cursă acasă' : peAcasa ? 'pe acasă între curse' : 'marginea zilei';
    }
    // între două curse din orar ale aceleiași rute: întoarcerea goală la capăt, impusă de orar (ca regula 5)
    else if (prev && next && prev.kind === 'orar' && next.kind === 'orar' && prev.r === next.r) { cat = 'golRuta'; r = prev.r; }
    else if (prev && next) { cat = 'legatura'; motiv = `${prev.kind} → ${next.kind}`; }
    // între două curse, pe acasă: se ține minte casa și ce fel de curse o încadrează (impartOcol)
    const intre = cat === 'livrare' && prev && next && peAcasa && !dimineata && !seara
      ? { casa: { lat: casa.lat, lon: casa.lon }, prev: prev.kind, next: next.kind } : null;
    out.push({ ...g, cat, km: b.km, bpts: mv, r, motiv, departe, ...(intre ? { intre } : {}) });
  }
  out.sort((a, b) => a.t0 - b.t0);
  return out;
}

/**
 * Golul impus de ture la Trox (Ion, 25.09: «un amestec între SEBN și LEAR: aceeași mașină, același capăt, 6 drumuri pe 2
 * ture»). Ziua ideală a unei rute Trox = 6 drumuri pe rută: 4 cu oameni + 2 goale impuse de ture (dimineața înapoi de la
 * poartă după ce a lăsat S1, seara la poartă după S2). Cele 2 goale sunt ale uzinei (gol pe rută, ca la LEAR), nu livrare.
 * Din bucățile de livrare care ating poarta se scade partea de pe culoarul rutei (≤1 km de schelet), cel mult bugetul
 * 2 × lungimea rutei; restul — drumul spre o casă din afara rutei, drumurile în plus — rămâne livrare (SEBN 5.3).
 */
export const CORIDOR_KM = 1;
export function golImpusDeTure(seg, coridor, bugetKm) {
  let ramas = bugetKm;
  for (const s of seg) {
    if (ramas <= 0) break;
    if (s.cat !== 'livrare' || s.ocol || !s.bpts?.length || s.km <= 0) continue;
    if (!s.bpts.some((p) => lang(p, POARTA) <= POARTA.r + 0.1)) continue; // doar drumurile goale de la/spre poartă
    let on = 0, tot = 0;
    for (let i = 1; i < s.bpts.length; i++) {
      const a = s.bpts[i - 1], b = s.bpts[i], d = lang(a, b); if (d > 5) continue;
      tot += d; const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
      if (minDist(mid, coridor) <= CORIDOR_KM) on += d;
    }
    if (!tot) continue;
    const g = Math.min(s.km * on / tot, ramas);
    if (g > 0) { s.golTure = +g.toFixed(2); s.km = +(s.km - g).toFixed(2); ramas -= g; }
  }
  return +(bugetKm - ramas).toFixed(2);
}

/**
 * Drumul pe acasă ÎNTRE două curse: economie e doar ocolul (Ion, 26.09 — «include toate rutele suburbane în analiza de
 * optimizare, și pe Trox»). 054MLD 15.09: casa din Slobozia-Șirăuți stă chiar pe drumul Bezeda (capătul 57) → Drepcăuți
 * (capătul T3); 27 km ar fi fost făcuți oricum, și dacă aștepta la Bezeda. Drumul direct = km pe drum start → sfârșit
 * (Valhalla) × 1,05 (urma GPS iese cu câteva procente mai lungă decât drumul), cel mult km-ii reali; ocolul = restul, deci
 * și drumurile în plus (054MLD 15.09 după-amiaza: Drepcăuți → acasă → Tețcani → acasă → Lipcani, direct 7,4 km). Drumul
 * direct: gol între ture când ambele curse sunt Trox, altfel legătură; niciunul nu e economie. d = { se } km pe drum; fără
 * el bucata rămâne cum e. Între două curse Trox drumul gol impus merge pe traseul rutei (Ion: «6 drumuri pe 2 ture»,
 * același capăt), deci direct ≥ d.minDirect = lungimea cursei Trox cu oameni a zilei (904BRAN 15.09: poartă → Groznița pe
 * scurtătură 21 km, pe rută 32). Întoarce bucățile care o înlocuiesc pe s (ocolul primul, doar dacă e).
 */
export const GPS_PESTE_DRUM = 1.05;
/**
 * R-PAUZĂ (ION-263, Ion 06.10.2026, lde_uzine.reguli_livrare TROX_BRICENI P.1–P.2, la fel și suburbanele): pauza ACASĂ între
 * două curse e permisă dacă drumul pe acasă adaugă cel mult PRAG_PAUZA_KM pe șosea (Valhalla, bus) față de așteptarea la
 * capătul rutei: (sfârșitul cursei dinainte → casă → startul cursei de după) − (sfârșit → capăt → start). Startul cursei de
 * după E capătul (tur Trox / suburban), deci alternativa = drumul sfârșit → start, cel puțin lungimea cursei Trox (minDirect,
 * golul impus «6 drumuri pe 2 ture»). Sub prag pauza nu e livrare evitabilă; peste, livrarea se numără ca până acum.
 */
export const PRAG_PAUZA_KM = 15;
export async function costPauza(s, se, minDirect, kmDrum) {
  if (!s.intre?.casa || !s.bpts?.length || se == null) return null;
  // noaptea nu e pauză între curse (ține de parcare): golul peste miezul nopții sau început înainte de 04:00 rămâne cum era
  if (localMin(s.t0) > localMin(s.t1) || localMin(s.t0) < 240) return null;
  const a = s.bpts[0], b = s.bpts.at(-1);
  const [x, y] = [await kmDrum(a, s.intre.casa), await kmDrum(s.intre.casa, b)];
  if (x == null || y == null) return null;
  const alt = Math.max(se, (minDirect ?? 0) / GPS_PESTE_DRUM), viaCasa = x + y, cost = +(viaCasa - alt).toFixed(2);
  return { viaCasa: +viaCasa.toFixed(2), alt: +alt.toFixed(2), cost, permis: cost <= PRAG_PAUZA_KM };
}
export function impartOcol(s, d) {
  if (!s.intre || d?.se == null) return [s];
  const direct = +Math.min(s.km, Math.max(d.se * GPS_PESTE_DRUM, d.minDirect ?? 0)).toFixed(2), ocol0 = +(s.km - direct).toFixed(2);
  // R-PAUZĂ: sub prag, din ocol iese drumul pe acasă permis (costul pe șosea × 1,05, ca drumul direct); ce trece de el —
  // drumurile în plus prin sat (054MLD 15.09: Drepcăuți → acasă → Tețcani → acasă) — rămâne livrare
  const p = d.pauza ?? null;
  const permis = p?.permis && ocol0 > 0 ? +Math.min(ocol0, Math.max(0, p.cost) * GPS_PESTE_DRUM).toFixed(2) : 0;
  const ocol = +(ocol0 - permis).toFixed(2);
  const ratio = s.km > 0 ? ocol / s.km : 0;
  const troxK = (k) => k === 'trox' || k === 'predare';
  const catDirect = troxK(s.intre.prev) && troxK(s.intre.next) ? 'golTure' : 'legatura';
  const pz = p ? { pauza: { cost: p.cost, permis: p.permis, prag: PRAG_PAUZA_KM } } : {};
  return [
    ...(ocol > 0 ? [{ ...s, ...pz, km: ocol, ocol: true, motiv: p && !p.permis
      ? `ocolul pe acasă între curse (${Math.round(ratio * 100)}% din drum) — pauza acasă costă +${p.cost.toFixed(1)} km față de capăt, peste ${PRAG_PAUZA_KM} (R-PAUZĂ)`
      : p?.permis ? `drum în plus peste pauza acasă permisă (${Math.round(ratio * 100)}% din drum)`
      : `ocolul pe acasă între curse (${Math.round(ratio * 100)}% din drum)` }] : []),
    // direct: true — ca drumul direct, nu se mai caută brambura pe el (nici aici, nici în harta.mjs)
    ...(permis > 0 ? [{ ...s, ...pz, cat: 'legatura', km: permis, ocol: true, direct: true, pauzaPermisa: true, r: null,
      motiv: `pauza acasă permisă: +${p.cost.toFixed(1)} km față de așteptarea la capăt, ≤ ${PRAG_PAUZA_KM} (R-PAUZĂ)` }] : []),
    ...(direct > 0 ? [{ ...s, cat: catDirect, km: direct, ocol: true, direct: true, r: catDirect === 'golTure' ? s.r : null,
      motiv: direct > d.se * GPS_PESTE_DRUM + 0.05 ? `drumul gol impus de ture, pe traseul rutei — l-ar face oricum`
        : `drumul direct între curse, ${d.se.toFixed(1)} km pe drum — l-ar face oricum` }] : []),
  ];
}

/** Celulele de ~500 m ale unui drum. */
export const celula = (p) => `${Math.round(p.lat / PR.CELULA_LAT)}|${Math.round(p.lon / PR.CELULA_LON)}`;

/**
 * Brambura (SEBN §11.3) pe o bucată: km pe celulele trecute în < 2 zile ale săptămânii. zileCelula: Map celulă → nr. zile.
 */
export function bramburaBucata(bpts, zileCelula) {
  let km = 0;
  for (let i = 1; i < bpts.length; i++) {
    const a = bpts[i - 1], b = bpts[i], d = lang(a, b);
    if (d > 5) continue;
    const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    if ((zileCelula.get(celula(mid)) ?? 0) < PR.BRAMBURA_ZILE) km += d;
  }
  return km >= PR.BRAMBURA_MIN_KM ? +km.toFixed(1) : 0;
}

// ------------------------------------------------------------------------------------------------------------------ main
if (/(^|\/)livrare\.mjs$/.test(process.argv[1] ?? '')) {
  const SUFIX = process.env.SUFIX || '-sapt';
  const N = JSON.parse(readFileSync(`../date/nomenclator${SUFIX}.json`, 'utf8'));
  const CT = JSON.parse(readFileSync(`../date/curse-trox${SUFIX}.json`, 'utf8'));
  const CS = JSON.parse(readFileSync(`../date/curse-sub${SUFIX}.json`, 'utf8')).curse;
  const zileSapt = zileIntre(N.FROM, N.TO);
  // satele cunoscute (nomenclator + act) și satele fiecărei rute
  const LOC = new Map();
  for (const r of N.suburban) for (const s of r.lant) if (s.loc && s.loc.key !== GARA.key) LOC.set(s.loc.key, s.loc);
  for (const r of N.trox) for (const s of r.sate) if (s.loc) LOC.set(s.loc.key, s.loc);
  const LOCV = [...LOC.values()];
  const troxSate = new Set(N.trox.flatMap((r) => r.sate.map((s) => s.loc?.key).filter(Boolean)));
  const sateRuta = new Map([...N.suburban.map((r) => [String(r.id), r.lant.map((s) => s.loc).filter((l) => l && l.key !== GARA.key)]),
    ...N.trox.map((r) => [r.id, r.sate.map((s) => s.loc).filter(Boolean)])]);
  // ruta de raport (Coteala 1, 2, 3 = una)
  const raport = new Map(); for (const r of ruteRaport(N)) for (const m of r.membri) raport.set(String(m), { id: String(r.id), nume: r.nume.replace(' → Briceni', '') });
  for (const r of N.trox) raport.set(r.id, { id: r.id, nume: r.denumire });

  const cache = new Map();
  const ziFis = (m, z) => { const k = `${m}|${z}`; if (cache.has(k)) return cache.get(k); const f = `../date/zile/${m}/${z}.json`;
    const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; if (cache.size > 30) cache.delete(cache.keys().next().value); cache.set(k, v); return v; };
  const ziua = (z, d) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  // locul nopții care se termină dimineața zilei z: fișierul z−1 (20:00 → 04:00) + fișierul z (00:00 → 05:00)
  const noapte = (m, z) => {
    const ta = localToUtc(ziua(z, -1), PR.NOAPTE[0]).getTime(), tb = localToUtc(ziua(z, -1), PR.NOAPTE[1]).getTime();
    const pts = [];
    for (const zz of [ziua(z, -1), z]) { const d = ziFis(m, zz); if (d) pts.push(...evenimente(d, []).pts); }
    const n = loculNoptii(pts, ta, tb);
    if (!n) return null;
    const s = LOCV.reduce((b, x) => (lang(n, x) < lang(n, b) ? x : b), LOCV[0]);
    return { ...n, n: lang(n, GARA) <= 2 ? 'Briceni' : lang(n, s) <= 2 ? s.n : `${n.lat.toFixed(3)},${n.lon.toFixed(3)}` };
  };

  // ---- zilele cu cursă interurbană (Chișinău ↔ nord) țin de analiza mejgorod, nu de Briceni: drumul spre Chișinău
  // ieșea «deplasare» (263NSX, 692TWK, 703TWK pe 14–20.09) — se scot și se listează
  const SB0 = process.env.SUPABASE_URL, KEY0 = process.env.SUPABASE_SERVICE_KEY;
  const get0 = async (p) => { const r = await fetch(`${SB0}/rest/v1/${p}`, { headers: { apikey: KEY0, Authorization: `Bearer ${KEY0}` } }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
  const [ruteInter, vehs0] = await Promise.all([get0('crm_routes?route_type=eq.interurban&select=id'), get0('vehicles?select=id,plate_number&limit=5000')]);
  const placa0 = new Map(vehs0.map((v) => [v.id, normPlate(v.plate_number)]));
  const asgInter = await get0(`daily_assignments?assignment_date=gte.${N.FROM}&assignment_date=lte.${N.TO}&crm_route_id=in.(${ruteInter.map((r) => r.id)})&select=assignment_date,vehicle_id,vehicle_id_retur&limit=5000`);
  const interurban = new Set(asgInter.flatMap((a) => [a.vehicle_id, a.vehicle_id_retur].filter(Boolean).map((v) => `${placa0.get(v)}|${a.assignment_date}`)));
  // ---- ziua fiecărei mașini din flotă (SEBN 1.1: cursă Trox pe rută sau suburbană din orar)
  const flota0 = new Set([...CT.curse.filter((c) => c.ruta).map((c) => `${c.m}|${c.z}`), ...CS.filter((c) => c.tip === 'orar').map((c) => `${c.m}|${c.z}`)]);
  const zileInterurban = [...flota0].filter((k) => interurban.has(k)).sort();
  const flota = new Set([...flota0].filter((k) => !interurban.has(k)));
  const ZILE = [];
  const zileCelula = new Map(); // m → Map celulă → Set zile
  for (const k of [...flota].sort()) {
    const [m, z] = k.split('|'); if (!zileSapt.includes(z)) continue;
    const day = ziFis(m, z); if (!day || !day.pts.length) continue;
    const E = evenimente(day, LOCV);
    const ta = localToUtc(z, 180).getTime(), tb = localToUtc(ziua(z, 1), 180).getTime();
    const legs = [
      ...CT.curse.filter((c) => c.m === m && c.z === z && c.ruta).map((c) => ({ t0: c.t0, t1: c.t1, kind: 'trox', dir: c.sens, r: c.ruta })),
      ...CS.filter((c) => c.m === m && c.z === z && (c.tip === 'orar' || c.tip === 'neprog')).map((c) => ({ t0: c.t0, t1: c.t1, kind: c.tip, dir: c.dir, r: String(c.r) })),
    ];
    // returul din fereastra schimbului, după ≥15 min la poartă, fără capăt sigur (904BRAN 16.09: poartă → Colicăuți →
    // Bălcăuți → Mărcăuți, lasă oamenii fără opriri prinse): cu oameni până la ultimul sat din act trecut, cu ruta turului
    const rutaZilei = (() => { const f = {}; for (const c of CT.curse.filter((c) => c.m === m && c.z === z && c.ruta)) f[c.ruta] = (f[c.ruta] || 0) + 1;
      return Object.entries(f).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; })();
    for (const c of CT.curse.filter((c) => c.m === m && c.z === z && !c.ruta && c.sens === 'retur')) {
      const ult = E.sate.filter((s) => troxSate.has(s.key) && s.tin >= c.t0 && s.tin <= c.t1).at(-1);
      if (ult) legs.push({ t0: c.t0, t1: ult.tin, kind: 'trox', dir: 'retur', r: rutaZilei, faraCapat: true }); // la intrarea în sat: acasă stă parcat
    }
    // returul după predare (BL-1): de la poartă până la capătul rutei turului, cel mult 2 h și înaintea cursei următoare
    for (const p of CT.predari.filter((p) => p.m === m && p.z === z && p.t0 && p.capKey && LOC.has(p.capKey))) {
      const cap = LOC.get(p.capKey), urm = Math.min(...legs.filter((l) => l.t0 > p.t0).map((l) => l.t0), p.t0 + PR.PREDARE_MAX_MIN * 60e3);
      const x = E.pts.find((q) => !q.mut && tIn(q) > p.t0 && tIn(q) <= urm && lang(q, cap) <= PR.PREDARE_CAPAT_KM);
      if (x) legs.push({ t0: p.t0, t1: tIn(x), kind: 'predare', dir: 'retur', r: p.ruta });
    }
    const sateMasina = [...new Set(legs.map((l) => l.r))].flatMap((r) => sateRuta.get(r) ?? []);
    const noapteA = noapte(m, z), noapteB = noapte(m, ziua(z, 1));
    const seg = clasificaZi({ pts: E.pts, opriri: day.opriri, legs, ta, tb, noapteA, noapteB, sateMasina, sate: LOCV });
    const total = bucata(E.pts, ta, tb).km;
    // celulele zilei (toată mișcarea zilei), pentru brambura
    const cm = zileCelula.get(m) ?? new Map(); zileCelula.set(m, cm);
    for (const s of seg) for (const p of s.bpts ?? []) { const c = celula(p); (cm.get(c) ?? cm.set(c, new Set()).get(c)).add(z); }
    ZILE.push({ m, z, seg, total, noapteA, noapteB, legs });
  }
  // drumul pe acasă între curse: doar ocolul e livrare (impartOcol); km pe drum din Valhalla de pe VPS
  const VALHALLA = 'http://localhost:8002/route', kmCache = new Map();
  const kmDrum = async (a, b) => {
    const k = `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
    if (kmCache.has(k)) return kmCache.get(k);
    let v = null;
    if (lang(a, b) < 0.05) v = 0;
    else try {
      const r = await fetch(VALHALLA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: 'bus', units: 'kilometers' }) });
      const j = await r.json(); v = j?.trip?.summary?.length ?? null;
    } catch { v = null; }
    kmCache.set(k, v); return v;
  };
  let ocoluri = 0, faraDrum = 0, pauzePermise = 0, pauzePeste = 0, pauzeFaraDrum = 0;
  const troxK = (k) => k === 'trox' || k === 'predare';
  const lungimeTrox = (seg) => { const k = seg.filter((s) => s.leg && troxK(s.kind) && s.km > 5).map((s) => s.km).sort((a, b) => a - b);
    return k.length ? k[Math.floor(k.length / 2)] : null; };
  for (const d of ZILE) {
    const nou = [], L = lungimeTrox(d.seg);
    for (const s of d.seg) {
      if (!s.intre || !s.bpts?.length) { nou.push(s); continue; }
      const se = await kmDrum(s.bpts[0], s.bpts.at(-1));
      if (se == null) { faraDrum++; nou.push(s); continue; }
      // lungimea rutei doar pe drumul gol capăt ↔ poartă; între două sate (retur până la Drepcăuți, tura de seară din Lipcani,
      // 054MLD 15.09) golul impus e drumul direct dintre ele
      const laPoarta = (p) => lang(p, POARTA) <= POARTA.r + 0.1;
      const minDirect = troxK(s.intre.prev) && troxK(s.intre.next) && (laPoarta(s.bpts[0]) || laPoarta(s.bpts.at(-1))) ? L ?? 0 : 0;
      const pauza = await costPauza(s, se, minDirect, kmDrum);
      if (!pauza) pauzeFaraDrum++; else if (pauza.permis) pauzePermise++; else pauzePeste++;
      ocoluri++; nou.push(...impartOcol(s, { se, minDirect, pauza }));
    }
    d.seg = nou;
  }
  console.log(`ocoluri pe acasă între curse: ${ocoluri} (fără drum Valhalla: ${faraDrum}) · R-PAUZĂ ≤ ${PRAG_PAUZA_KM} km: ${pauzePermise} permise, ${pauzePeste} peste prag, ${pauzeFaraDrum} fără drum`);

  // brambura pe bucățile fără ancoră (livrare / legătură / deplasare), frecvența doar pe cele 7 zile; nu pe drumul direct
  // dintre curse (aceeași urmă ca ocolul, s-ar scădea de două ori)
  for (const d of ZILE) {
    const cm = new Map([...zileCelula.get(d.m)].map(([c, s]) => [c, s.size]));
    // Ion, 26.09: «seara spre casă nu e brambura» — nici dimineața de acasă, nici ocolul pe acasă între curse: drumul
    // casă ↔ rută se schimbă după capătul cursei, deci e «nefolosit în altă zi» fără să fie hoinăreală
    const acasa = (p) => p && [d.noapteA, d.noapteB].some((n) => n && lang(p, n) <= 1);
    for (const s of d.seg) if (['livrare', 'legatura', 'deplasare'].includes(s.cat) && !s.direct
      && !(s.cat === 'livrare' && (s.intre || acasa(s.bpts?.[0]) || acasa(s.bpts?.at(-1))))) {
      const b = bramburaBucata(s.bpts, cm); if (b) { s.brambura = Math.min(b, s.km); s.km = +(s.km - s.brambura).toFixed(2); }
    }
  }

  // ---- golul impus de ture la Trox: 2 drumuri goale pe culoarul rutei, fiecare cât mediana curselor Trox cu oameni ale zilei
  const IDEAL = JSON.parse(readFileSync('../date/ideal.json', 'utf8')).unitati;
  const COTEALA_ID = ['46', '52', '53', '54'];
  const indes = (sh) => {
    const o = [];
    for (let i = 1; i < sh.length; i++) {
      const [a1, o1] = sh[i - 1], [a2, o2] = sh[i];
      const n = Math.max(1, Math.ceil(lang({ lat: a1, lon: o1 }, { lat: a2, lon: o2 }) / 0.3));
      for (let k = 0; k < n; k++) o.push({ lat: a1 + (a2 - a1) * k / n, lon: o1 + (o2 - o1) * k / n });
    }
    if (sh.length) o.push({ lat: sh.at(-1)[0], lon: sh.at(-1)[1] });
    return o;
  };
  const coridorRuta = new Map(IDEAL.filter((u) => !u.slab).map((u) => [u.id, [u.shape, ...(u.variante ?? []).map((v) => v.shape)].flatMap(indes)]));
  const coridorDe = (r) => coridorRuta.get(COTEALA_ID.includes(r) ? 'COTEALA' : r) ?? [];
  for (const d of ZILE) {
    const kms = d.seg.filter((s) => s.leg && (s.kind === 'trox' || s.kind === 'predare') && s.km > 5).map((s) => s.km).sort((a, b) => a - b);
    if (!kms.length) continue;
    const L = kms[Math.floor(kms.length / 2)];
    // doar ruta Trox a zilei: pe culoarul unei rute suburbane drumul e dusul la cursa suburbană (054MLD 15.09, casă → Tețcani)
    const coridor = [...new Set(d.legs.filter((l) => l.kind === 'trox' || l.kind === 'predare').map((l) => l.r).filter(Boolean))].flatMap(coridorDe);
    d.golTure = golImpusDeTure(d.seg, coridor, 2 * L); d.lungimeTrox = L;
  }

  // ---- lei/km (SEBN 9): normă × prețul ANRE al zilei / 100 + reparație + salariu
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY, H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const rest = async (p) => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
  const [veh, norme, tipuri, preturi] = await Promise.all([rest('vehicles?select=id,plate_number&limit=5000'),
    rest('lde_vehicle_norms?select=vehicle_id,vehicle_type_id,measured_consumption_l_per_100km&limit=5000'),
    rest('lde_vehicle_types?select=id,category,norm_l_per_100km'), rest(`lde_diesel_price?select=valid_from,price_lei&valid_from=lte.${N.TO}&order=valid_from.desc&limit=60`)]);
  const tip = new Map(tipuri.map((t) => [t.id, t]));
  const normaPlaca = new Map();
  for (const v of veh) { const n = norme.find((x) => x.vehicle_id === v.id); if (!n) continue; const t = tip.get(n.vehicle_type_id);
    const litri = t?.norm_l_per_100km != null ? +t.norm_l_per_100km : n.measured_consumption_l_per_100km != null ? +n.measured_consumption_l_per_100km : null;
    if (litri != null && !normaPlaca.has(normPlate(v.plate_number))) normaPlaca.set(normPlate(v.plate_number), { litri, categorie: t?.category ?? null }); }
  const pretZi = (z) => { const p = preturi.find((x) => x.valid_from <= z); return p ? +p.price_lei : null; };
  const leiKm = (m, z) => { const n = normaPlaca.get(m), p = pretZi(z); if (!n || p == null) return null;
    return n.litri / 100 * p + (n.categorie === 'autobuz_mare' ? PR.REPARATIE_MARE : PR.REPARATIE) + PR.SALARIU; };

  // ---- agregarea pe mașină și pe rută
  // golul impus de ture stă pe bucățile de livrare (s.golTure), restul categoriilor pe s.cat
  // (și pe bucățile «drumul direct între curse» Trox → Trox, cu categoria golTure)
  const suma = (seg, cat) => (cat === 'golTure' ? seg.reduce((a, s) => a + (s.golTure ?? 0), 0) : 0) + seg.filter((s) => s.cat === cat).reduce((a, s) => a + s.km, 0);
  // de unde → încotro pe fiecare bucată (Ion, 26.09: «la livrări nu îmi ajunge de unde încotro»): poarta, gara, acasă sau
  // satul cel mai apropiat; «prin» = satele trecute (≤1 km), în ordine
  const numeLoc = (p, d) => {
    if (!p) return null;
    if (lang(p, POARTA) <= POARTA.r + 0.1) return 'poarta Trox';
    if (lang(p, GARA) <= GARA.r + 0.1) return 'gara Briceni';
    for (const n of [d.noapteA, d.noapteB]) if (n && lang(p, n) <= 0.5) return `acasă (${n.n})`;
    const s = LOCV.reduce((b, x) => (lang(p, x) < lang(p, b) ? x : b), LOCV[0]);
    const k = lang(p, s);
    return k <= 1.5 ? s.n : `${k.toFixed(0)} km de ${s.n}`;
  };
  const prin = (bp, de, pana, d) => {
    const o = [];
    for (const p of bp ?? []) {
      const acasa = [d.noapteA, d.noapteB].find((n) => n && lang(p, n) <= 0.5);
      const s = LOCV.find((x) => lang(p, x) <= 1);
      const n = acasa ? `acasă (${acasa.n})` : s?.n ?? (lang(p, GARA) <= GARA.r ? 'gara Briceni' : lang(p, POARTA) <= POARTA.r ? 'poarta Trox' : null);
      // satul-casă și «acasă» din el sunt același loc: rămâne «acasă»
      const k = (x) => x?.replace(/^acasă \((.*)\)$/, '$1');
      if (!n || o.at(-1) === n) continue;
      if (k(o.at(-1)) === k(n)) { if (n.startsWith('acasă')) o[o.length - 1] = n; continue; }
      o.push(n);
    }
    const f = o.filter((n, i) => !(i === 0 && de?.includes(n)) && !(i === o.length - 1 && pana?.includes(n)));
    return f.length > 8 ? [...f.slice(0, 4), '…', ...f.slice(-3)] : f;
  };
  const PE_M = new Map(), PE_R = new Map();
  for (const d of ZILE) {
    const km = Object.fromEntries(CAT.map((c) => [c, +suma(d.seg, c).toFixed(1)]));
    const brambura = +d.seg.reduce((a, s) => a + (s.brambura ?? 0), 0).toFixed(1);
    const sum = CAT.reduce((a, c) => a + km[c], 0) + brambura;
    const lk = leiKm(d.m, d.z), lei = lk != null ? Math.round(km.livrare * lk) : null;
    // ce rute a făcut mașina în ziua asta (Ion, 26.09: «nu îmi ajunge informație, care rute face»): cursele cu oameni pe rută
    const ruteZi = new Map();
    for (const s of d.seg) if (s.leg && s.r && (s.cat === 'cuOameni' || s.cat === 'nepotrivita')) {
      const id = raport.get(s.r)?.id ?? s.r; const x = ruteZi.get(id) ?? { r: id, nume: raport.get(s.r)?.nume ?? null, trox: /^T\d/.test(id), curse: 0, km: 0 };
      x.curse++; x.km += s.km; ruteZi.set(id, x);
    }
    const zi = { z: d.z, dow: isoDow(d.z), total: +d.total.toFixed(1), km, brambura, lei, leiKm: lk != null ? +lk.toFixed(2) : null,
      rute: [...ruteZi.values()].map((x) => ({ ...x, km: +x.km.toFixed(1) })).sort((a, b) => b.trox - a.trox || b.curse - a.curse),
      bilant: Math.abs(sum - d.total) <= PR.BILANT_KM, dif: +(sum - d.total).toFixed(1),
      casaDim: d.noapteA?.n ?? null, casaSeara: d.noapteB?.n ?? null, lungimeTrox: d.lungimeTrox ?? null,
      bucati: d.seg.filter((s) => s.cat !== 'stat' && s.km + (s.brambura ?? 0) + (s.golTure ?? 0) >= 0.5).map((s) => ({ ora: `${hhmm(s.t0)}–${hhmm(s.t1)}`, cat: s.cat, km: +s.km.toFixed(1), brambura: s.brambura ?? 0, golTure: +(s.golTure ?? 0).toFixed(1), r: s.r ? raport.get(s.r)?.id ?? s.r : null, motiv: s.motiv ?? null, ...(s.pauza ? { pauza: s.pauza } : {}),
        ...(() => { const bp = (s.bpts ?? []).filter((p) => p.lat != null); const de = numeLoc(bp[0], d), pana = numeLoc(bp.at(-1), d);
          return { de, pana, prin: prin(bp, de, pana, d) }; })() })) };
    const M = PE_M.get(d.m) ?? { m: d.m, zile: [], nopti: new Map() }; PE_M.set(d.m, M); M.zile.push(zi);
    if (d.noapteA) M.nopti.set(d.noapteA.n, (M.nopti.get(d.noapteA.n) ?? 0) + 1);
    // livrarea pe rută: fiecare bucată la ruta ei (dimineața → prima cursă, seara → ultima, prânz → următoarea)
    for (const s of d.seg) if (s.cat === 'livrare' && s.r) {
      const rr = raport.get(s.r) ?? { id: s.r, nume: s.r }; const R = PE_R.get(rr.id) ?? { id: rr.id, nume: rr.nume, livrare: 0, lei: 0, masini: new Set() };
      R.livrare += s.km; R.lei += lk != null ? s.km * lk : 0; R.masini.add(d.m); PE_R.set(rr.id, R);
    }
    for (const s of d.seg) if (s.cat === 'cuOameni' && s.r) { const rr = raport.get(s.r) ?? { id: s.r, nume: s.r };
      const R = PE_R.get(rr.id) ?? { id: rr.id, nume: rr.nume, livrare: 0, lei: 0, masini: new Set() }; R.masini.add(d.m); PE_R.set(rr.id, R); }
  }
  const masini = [...PE_M.values()].map((M) => {
    const sum = (c) => +M.zile.reduce((a, z) => a + z.km[c], 0).toFixed(1);
    const km = Object.fromEntries(CAT.map((c) => [c, sum(c)]));
    const brambura = +M.zile.reduce((a, z) => a + z.brambura, 0).toFixed(1);
    const lei = M.zile.every((z) => z.lei == null) ? null : M.zile.reduce((a, z) => a + (z.lei ?? 0), 0);
    const ruteM = new Map();
    for (const z of M.zile) for (const x of z.rute) { const y = ruteM.get(x.r) ?? { r: x.r, nume: x.nume, trox: x.trox, zile: 0, curse: 0, km: 0 };
      y.zile++; y.curse += x.curse; y.km += x.km; ruteM.set(x.r, y); }
    // R-PAUZĂ pe mașină: pauzele acasă între curse (o pauză = un gol, chiar dacă e tăiat în ocol / direct / permis)
    const pz = new Map();
    for (const z of M.zile) for (const b of z.bucati) if (b.pauza) pz.set(`${z.z} ${b.ora}`, { ...b.pauza, km: (pz.get(`${z.z} ${b.ora}`)?.km ?? 0) + (b.cat === 'livrare' ? b.km : 0) });
    const pauze = { permise: [...pz.values()].filter((p) => p.permis).length, peste: [...pz.values()].filter((p) => !p.permis).length,
      kmPermis: +M.zile.reduce((a, z) => a + z.bucati.filter((b) => b.motiv?.startsWith('pauza acasă permisă')).reduce((x, b) => x + b.km, 0), 0).toFixed(1) };
    return { m: M.m, zile: M.zile.length, pauze, total: +M.zile.reduce((a, z) => a + z.total, 0).toFixed(1), km, brambura,
      rute: [...ruteM.values()].map((y) => ({ ...y, km: +y.km.toFixed(1) })).sort((a, b) => b.trox - a.trox || b.curse - a.curse),
      livrareZi: +(km.livrare / M.zile.length).toFixed(1), lei, leiZi: lei != null ? Math.round(lei / M.zile.length) : null,
      steagBrambura: brambura >= PR.STEAG_KM, casa: [...M.nopti].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      deLamurit: M.zile.filter((z) => !z.bilant).length, detalii: M.zile.sort((a, b) => a.z.localeCompare(b.z)) };
  }).sort((a, b) => b.km.livrare - a.km.livrare);
  const rute = [...PE_R.values()].map((R) => ({ id: R.id, nume: R.nume, livrare: +R.livrare.toFixed(1), lei: Math.round(R.lei), masini: [...R.masini].sort() }))
    .sort((a, b) => b.livrare - a.livrare);
  const total = Object.fromEntries(CAT.map((c) => [c, +masini.reduce((a, x) => a + x.km[c], 0).toFixed(1)]));
  total.brambura = +masini.reduce((a, x) => a + x.brambura, 0).toFixed(1);
  total.lei = masini.reduce((a, x) => a + (x.lei ?? 0), 0);
  const zileTot = ZILE.length, zileOk = masini.reduce((a, x) => a + x.zile - x.deLamurit, 0);
  const faraTracker = [...new Set(N.atribuiri.filter((a) => a.z >= N.FROM && a.z <= N.TO && !existsSync(`../date/zile/${a.m}`)).map((a) => a.m))];
  const OUT = { uzina: 'BRICENI', saptamina: N.FROM, pana_la: N.TO, praguri: PR, total, zile: zileTot, zileBilantOk: zileOk,
    sumaRute: +rute.reduce((a, r) => a + r.livrare, 0).toFixed(1), masini, rute, faraTracker, zileInterurban };
  scrieAtomic(`../date/livrare${SUFIX}.json`, OUT);
  console.log(`${N.FROM} → ${N.TO}: ${masini.length} mașini · ${zileTot} zile (${zileOk} cu bilanț) · km: ${CAT.map((c) => `${c} ${total[c]}`).join(' · ')} · brambura ${total.brambura} · lei ${total.lei}`);
  console.log(`  livrare pe mașini ${total.livrare} = pe rute ${OUT.sumaRute}`);
  for (const x of masini) console.log(`  ${x.m.padEnd(8)} ${String(x.zile).padStart(2)} zile · livrare ${String(x.km.livrare).padStart(6)} (${x.livrareZi}/zi) · legătură ${x.km.legatura} · cu oameni ${x.km.cuOameni} · gol ${x.km.golRuta} · gol ture ${x.km.golTure} · nepotr ${x.km.nepotrivita} · necun ${x.km.necunoscut} · brambura ${x.brambura} · lei ${x.lei ?? '—'} · casa ${x.casa} · de lămurit ${x.deLamurit} · R-PAUZĂ ${x.pauze.permise} permise (${x.pauze.kmPermis} km) / ${x.pauze.peste} peste`);
}
