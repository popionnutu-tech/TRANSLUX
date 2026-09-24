// Satele din nomenclatorul LEAR care nu se găsesc pe hartă (ION-48).
//
// Ion, 24.09.2026, după ce i-am arătat lista: «fă așa cum ai zis». Adică: satul necunoscut se pune
// unde trece de fapt mașina, nu unde bănuiesc eu, iar dintre două variante cu același nume se
// alege aceea prin care chiar trece autobuzul.
//
// Din 37 de nume negăsite exact, cele mai multe nu-s sate necunoscute, ci OPRIRI scrise ca sate:
// «Pîrlița școală» și «Pîrlița biserică» sunt două stații în același sat, «Petrești traseu» e
// stația de la șosea. Harta are doar satul. Deci trei trepte, în ordine:
//
//   1. numele curățat — diacriticele jos, calificativul scos (traseu, liceu, școală, biserică,
//      fermă, stadion, sat, oraș, gară, stație), articolul «-ul» normalizat
//   2. mai multe variante (Albinețul Vechi / Nou) → cea mai apropiată de forma rutei: prin ea
//      trece autobuzul
//   3. niciuna → se pune pe forma rutei, între vecinii lui din nomenclator, la locul dat de
//      ordine. Nu-i o ghicire: e punctul de pe drumul pe care mașina chiar îl face.
//
// Scrie `lear-sate.json`, citit de lear-analiza.mjs ca sursă în plus la coordonate.
//
// Rulare:  node --env-file=.env lear-sate.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPlaces } from './places-index.mjs';

const CALE_SCHELET = process.env.LEAR_SCHELET || '/root/lde-worker/lear-schelet.json';
const CALE_OUT = process.env.LEAR_SATE || '/root/lde-worker/lear-sate.json';
const WRITE = process.argv.includes('--write');
const POARTA = { lat: 47.2230, lon: 27.8016 };
// Cât de departe de drumul rutei poate sta un sat al ei. Peste atât, potrivirea e a altui loc:
// «Dănuțeni» ajungea la «Danu», 71 km mai încolo, doar fiindcă numele începe la fel. Dănuțeni e
// un cartier al Ungheniului, nu un sat de pe hartă — și atunci se așază pe drum, ca celelalte.
const MAX_DE_RUTA = 2;

const hav = (a, b) => { const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

const cur = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[-\s]+/g, ' ').trim();
// cuvintele care arată o OPRIRE, nu o localitate
const CALIF = /\b(traseu|drum|liceu|scoala|scoal|biserica|ferma|stadion|sat|oras|gara|statie|centru|magazin|pod|c\.?\s*f\.?)\b/gi;
// «Ciolacul Nou» și «Ciolacu Nou» sunt același loc: articolul se scrie și așa, și așa
const articol = (s) => s.replace(/\bciolacul\b/g, 'ciolacu').replace(/(\w)ul\b/g, '$1u');

const S = JSON.parse(readFileSync(CALE_SCHELET, 'utf8'));
const locuri = loadPlaces(process.env.PLACES_FILE);
const index = new Map();
for (const p of locuri) {
  const k = cur(p.name);
  if (!index.has(k)) index.set(k, []);
  index.get(k).push(p);
}
const nume = new Set(locuri.map((p) => p.name));

// forma rutei, ca să putem alege și așeza pe drumul adevărat
const formaRutei = (r) => [...(r.g?.tur?.plin || []), ...(r.g?.retur?.plin || [])]
  .map((c) => ({ lat: c[0], lon: c[1] }));
const deForma = (forma, p) => { let m = Infinity;
  for (const f of forma) { const d = hav(f, p); if (d < m) m = d; } return m; };

function candidati(n) {
  const incercari = [cur(n), articol(cur(n)), cur(n.replace(CALIF, '')), articol(cur(n.replace(CALIF, '')))];
  for (const k of incercari) {
    if (k && index.has(k)) return { lista: index.get(k), cum: k === cur(n) ? 'exact' : 'nume curățat' };
  }
  // început comun, dar destul de lung ca «Fabrica Biochimică» să nu ajungă la «Fabrica de Zahăr»
  const baza = articol(cur(n.replace(CALIF, ''))).trim();
  if (baza.length >= 6) {
    const chei = [...index.keys()].filter((x) => x.startsWith(baza) || baza.startsWith(x));
    if (chei.length) {
      chei.sort((a, b) => b.length - a.length);
      return { lista: chei.flatMap((k) => index.get(k)), cum: 'după început' };
    }
  }
  return { lista: [], cum: null };
}

const out = {};
const raport = [];
for (const r of S.rute) {
  const forma = formaRutei(r);
  const lipsa = r.sate.filter((n) => !nume.has(n));
  if (!lipsa.length) continue;
  for (const n of lipsa) {
    if (out[n]) continue;
    const { lista, cum } = candidati(n);
    // dintre variante, aceea prin care trece autobuzul: cea mai apropiată de forma rutei
    let best = null;
    for (const p of lista) {
      const d = forma.length ? deForma(forma, p) : hav(p, POARTA);
      if (!best || d < best.d) best = { p, d };
    }
    // dar numai dacă e chiar pe drumul ei; altfel e alt loc cu nume asemănător
    if (best && (!forma.length || best.d <= MAX_DE_RUTA)) {
      const etich = lista.length > 1 ? `${cum} · varianta pe rută` : cum;
      out[n] = { lat: best.p.lat, lon: best.p.lon, cum: etich, prin: best.p.name, ruta: r.id };
      raport.push([n, best.p.name, etich, best.d]);
      continue;
    }
    if (best) raport.push([n, null, `«${best.p.name}» respins: ${n1(best.d)} km de drumul rutei`, null]);
    // niciun nume: se pune pe forma rutei, între vecinii lui din nomenclator
    if (!forma.length) { raport.push([n, null, 'ruta n-are formă', null]); continue; }
    const i = r.sate.indexOf(n);
    const vecini = [];
    for (let k = i - 1; k >= 0; k--) if (nume.has(r.sate[k])) { vecini.push(r.sate[k]); break; }
    for (let k = i + 1; k < r.sate.length; k++) if (nume.has(r.sate[k])) { vecini.push(r.sate[k]); break; }
    if (!vecini.length) { raport.push([n, null, 'n-are vecini știuți', null]); continue; }
    const pv = vecini.map((v) => locuri.filter((p) => p.name === v)
      .sort((a, b) => hav(a, POARTA) - hav(b, POARTA))[0]).filter(Boolean);
    if (!pv.length) { raport.push([n, null, 'vecinii n-au coordonate', null]); continue; }
    // punctul de pe forma rutei aflat la mijloc între vecini — acolo trece mașina
    const tinta = pv.length === 2
      ? { lat: (pv[0].lat + pv[1].lat) / 2, lon: (pv[0].lon + pv[1].lon) / 2 }
      : pv[0];
    let pe = null;
    for (const f of forma) { const d = hav(f, tinta); if (!pe || d < pe.d) pe = { f, d }; }
    out[n] = { lat: +pe.f.lat.toFixed(5), lon: +pe.f.lon.toFixed(5),
      cum: `pus pe forma rutei ${r.id}, între ${vecini.join(' și ')}`, prin: null, ruta: r.id };
    raport.push([n, `pe ruta ${r.id} între ${vecini.join(' și ')}`, 'așezat pe drum', pe.d]);
  }
}

console.log('nume din nomenclator negăsite pe hartă și ce s-a făcut cu ele:\n');
for (const [n, prin, cum, d] of raport.sort((a, b) => a[0].localeCompare(b[0], 'ro')))
  console.log(`  ${prin ? '✓' : '✗'} ${n.padEnd(22)} ${String(prin ?? '—').padEnd(34)} ${String(cum).padEnd(26)}` +
    (d != null ? ` ${n1(d)} km de forma rutei` : ''));
const rez = Object.keys(out).length;
console.log(`\n${rez} din ${raport.length} rezolvate.`);

if (WRITE) { writeFileSync(CALE_OUT, JSON.stringify(out, null, 1)); console.log(`scris ${CALE_OUT}`); }
else console.log('(fără --write, nimic nu s-a scris)');
