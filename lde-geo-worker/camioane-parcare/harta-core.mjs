// ION-150 — harta cisternelor, funcțiile pure (testate în harta-core.test.mjs). Lanțul: harta.mjs.
// Ion, 30.09.2026: «drumul față de schelet, P1/P2 doar informativ»; staționările de peste 24 h rămân; Bubuieci = casa șoferului;
// odihna pe drum la Galați / Ovidiu–Agigea / Giurgiu / Novi Iskăr e bună; oprirea LJN076 la Albina (+46 km) e abatere.
// Planul: docs/plans/2026-09-30-camioane-parcare/README.md, răspunsurile: raspunsuri.md.

export const TZ = 'Europe/Chisinau';
export const R_ACASA_KM = 3;          // o oprire la ≤ 3 km de casă = acasă (grupurile din cercetare, 3 km)
export const R_LINIE_KM = 5;          // la ≤ 5 km de linia ideală = pe drum (ION-144: peste 5 km de linie e «alt drum»)
export const ODIHNA_MIN = 8 * 60;     // odihna zilnică: parcare ≥ 8 h (ION-122)
export const LUNGA_MIN = 24 * 60;     // staționare ≥ 24 h: rămâne cum e (Ion, 30.09, întrebarea 2)

// Locurile de odihnă pe drum pe care Ion le-a dat drept bune (30.09, întrebarea 4). Coordonatele: opririle flotei din cercetare
// (cercetare/analiza.out) și centrul localității; raza acoperă parcările TIR din jurul lor.
export const ODIHNA_BUNA = [
  { n: 'Galați', lat: 45.435, lon: 28.008, r: 10 },
  { n: 'Ovidiu', lat: 44.270, lon: 28.560, r: 8 },
  { n: 'Agigea', lat: 44.085, lon: 28.640, r: 8 },
  { n: 'Giurgiu', lat: 43.900, lon: 25.970, r: 10 },
  { n: 'Novi Iskăr', lat: 42.8189, lon: 23.3687, r: 6 },
];

export function hav(a, b) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** decalajul Chișinăului față de UTC (ms) într-un moment dat */
export function decalaj(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
/** momentul (ms UTC) al orei 00:00 la Chișinău în ziua AAAA-LL-ZZ */
export function miezulNoptii(zi) {
  const g = Date.parse(`${zi}T00:00:00Z`);
  const t = g - decalaj(g);
  return g - decalaj(t);
}
export const adaugaZile = (zi, n) => { const d = new Date(`${zi}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const FMT_ORA = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
export const oraLoc = (t) => FMT_ORA.format(new Date(t));
export const ziLocala = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

/** distanța (km) de la un punct la o linie dată ca puncte [[lat, lon], …] — cel mai apropiat vârf; liniile scheletului au vârfuri la ≤ 2 km */
export function distLaLinie(p, linie) {
  if (!linie?.length) return null;
  let d = Infinity;
  for (const q of linie) { const x = hav(p, { lat: q[0], lon: q[1] }); if (x < d) d = x; }
  return d;
}

/**
 * Judecata unei staționări în afara punctelor de dispecerat (informativ, fără km de tăiat).
 * Ordinea: fără semnal → acasă → ≥ 24 h (rămâne) → < 8 h (pauză) → locurile bune ale lui Ion → linia ideală (≤ 5 km pe drum, altfel abatere).
 */
export function judecaStationare({ min, incert, dCasa, dLinie, dBun }) {
  const ore = Math.round(min / 60);
  if (incert) return { fel: 'semnal', nota: `fără semnal ${ore} h` };
  if (dCasa != null && dCasa <= R_ACASA_KM) return { fel: 'casa', nota: 'acasă' };
  if (min >= LUNGA_MIN) return { fel: 'lunga', nota: `staționare de ${ore} h — rămâne cum e` };
  if (min < ODIHNA_MIN) return { fel: 'pauza', nota: `pauză ${ore >= 1 ? `${ore} h` : `${Math.round(min)} min`}` };
  if (dBun != null) return { fel: 'drum', nota: 'odihnă pe drum — bună' };
  if (dLinie == null) return { fel: 'faraIdeal', nota: 'odihnă (drumul n-are ideal în schelet)' };
  if (dLinie <= R_LINIE_KM) return { fel: 'drum', nota: 'odihnă pe drum — bună' };
  return { fel: 'abatere', nota: `odihnă la ${Math.round(dLinie)} km de drumul ideal — abatere` };
}

/** locul bun de odihnă (lista lui Ion) în raza căruia cade poziția, sau null */
export const odihnaBuna = (p) => ODIHNA_BUNA.find((o) => hav(p, o) <= o.r) ?? null;

/** grupuri de opriri la ≤ r km (primul membru e centrul), cu orele adunate */
export function grupeaza(opriri, r = R_ACASA_KM) {
  const out = [];
  for (const o of opriri) {
    const g = out.find((x) => hav(x, o) <= r);
    if (g) { g.n++; g.min += o.min; g.membri.push(o); } else out.push({ lat: o.lat, lon: o.lon, n: 1, min: o.min, membri: [o] });
  }
  return out.sort((a, b) => b.min - a.min);
}

/** casa șoferului: grupul cu cele mai multe ore de parcare ≥ 8 h în Moldova, în afara punctelor; cel puțin 2 nopți sau 24 h */
export function casaDin(opriri) {
  const g = grupeaza(opriri.filter((o) => !o.incert && !o.punct && o.tara === 'Moldova' && o.min >= ODIHNA_MIN))[0];
  return g && (g.n >= 2 || g.min >= LUNGA_MIN) ? { lat: g.lat, lon: g.lon, n: g.n, ore: Math.round(g.min / 60) } : null;
}

/** Douglas–Peucker în metri (proiecție plană locală), pe puncte {lat, lon, …} */
export function dp(P, eps) {
  if (P.length < 3) return P;
  const k = 111320, c = Math.cos(P[0].lat * Math.PI / 180), X = P.map((p) => [p.lon * k * c, p.lat * k]);
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let m = -1, md = 0; const [x1, y1] = X[a], [x2, y2] = X[b], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - X[i][1]) - (x1 - X[i][0]) * (y2 - y1)) / L; if (d > md) { md = d; m = i; } }
    if (md > eps) { keep[m] = 1; st.push([a, m], [m, b]); }
  }
  return P.filter((_, i) => keep[i]);
}

/**
 * Tăietura zilei pe intervale, fiecare cu UN fel: staționare (la punct sau parcare) sau drum (plin / gol, pe drumul-curse al lui).
 * pasi: [{i, t, km, sta: id|null, drum: id|null}] = punctele zilei în ordine, cu km-ul pasului de la punctul anterior.
 * Km-ul unui pas intră în intervalul punctului în care ajunge, deci Σ intervale = Σ pași = km-ul zilei, exact.
 */
export function taieZiua(pasi) {
  const out = [];
  for (const p of pasi) {
    const cheie = p.sta != null ? `s${p.sta}` : `d${p.drum ?? '-'}`;
    const u = out[out.length - 1];
    if (u && u.cheie === cheie) { u.i1 = p.i; u.t1 = p.t; u.km += p.km; u.idx.push(p.i); }
    else out.push({ cheie, sta: p.sta, drum: p.drum, i0: p.i, i1: p.i, t0: p.t, t1: p.t, km: p.km, idx: [p.i] });
  }
  return out;
}

/** cheia liniei din public/lde/schelet-camioane.json: m|<origine → destinație>|<variantă> sau b|<cod>|ideal1 */
export function cheieMotorina(schelet, origine, destinatie, vama) {
  const r = schelet.motorina.find((x) => x.origine === origine && x.destinatie === destinatie);
  if (!r) return null;
  const regim = (r.deBaza ?? 'baza-giu').split('-')[0];
  const v = vama === 'Albița' ? 'alb' : vama === 'Giurgiulești' ? 'giu' : null;
  const id = v ? `${regim}-${v}` : r.deBaza;
  return r.variante.some((x) => x.id === id) ? `m|${r.id}|${id}` : `m|${r.id}|${r.deBaza}`;
}
export const cheieBiodiesel = (schelet, cod) => (schelet.biodiesel.some((b) => b.id === cod) ? `b|${cod}|ideal1` : null);

// numele scurte ale punctelor, ca în verifica-zi.mjs (ION-144)
export const scurt = (s) => (s ?? '').replace(' — încărcare diesel', '').replace(' — descărcare diesel', '').replace('Bază Chișinău — stație ', '')
  .replace('Rafinăria Petromidia — Năvodari', 'Petromidia').replace('Bază Berdichev — încărcare biodiesel', 'Berdichev')
  .replace(' — descărcare biodiesel', '').replace('Vama Albița–Leușeni', 'Vama Albița');

/** locurile P1/P2 ale săptămânii (informativ): grupurile de parcare ≥ 8 h, după ore; felul = judecata celei mai lungi opriri */
export function locuriSaptamana(parcari, numeLoc) {
  return grupeaza(parcari.filter((o) => (o.minTot ?? o.min) >= ODIHNA_MIN && !o.incert)).slice(0, 2).map((g, k) => {
    const cea = [...g.membri].sort((a, b) => b.min - a.min)[0];
    return { nr: k + 1, n: numeLoc(g), fel: cea.fel, c: [+g.lat.toFixed(5), +g.lon.toFixed(5)], drumuri: g.n, ore: Math.round(g.min / 60), nota: cea.nota };
  });
}
