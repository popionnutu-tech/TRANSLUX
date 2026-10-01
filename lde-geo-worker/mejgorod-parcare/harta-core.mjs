// ION-149 — harta autobuzelor interurbane (mejgorod) și locul de noapte P1/P2: funcțiile pure (testate în harta-core.test.mjs).
// Lanțul: harta.mjs. Planul: docs/plans/2026-09-30-mejgorod-parcare/README.md; variantele alese: raspunsuri.md
// (Ion, 01.10.2026: «adaugă toate direcțiile» — variantele recomandate, ca la LEAR și Drăxlmaier).
import { alegeLocuri } from '../lear-parcare/lear-parcare-alege.mjs';

export const TZ = 'Europe/Chisinau';
export const SALT_KM = 5;            // pas GPS > 5 km = salt, nu drum (kmIntre din LEAR)
export const GOL_MIN = 60;           // golurile sub 60 min nu intră (LEAR)
export const GOL_MAX_H = 20;         // răspunsurile 4 și 5: nopțile până la 20 h; peste = zi liberă, afară
export const LIBER_KM = 5;           // răspunsul 7: ieșirea din pauza de zi la > 5 km de capete = «timp liber», nu parcare
export const STA_MIN = 15;           // o staționare ≥ 15 min se arată pe hartă ca «stă»
export const TOLERANTA = 20;         // răspunsul 2: capătul rutei câștigă dacă costă ≤ 20 km/săpt. mai mult
export const LA_FEL_KM = 4;          // răspunsul 6: pragul «rămâne cum e» rămâne 4 km
// preferința locurilor (răspunsul 2): capătul rutei, apoi unde stă deja (LEAR), gara, orașul, satul
export const PREF = { capat: 3, acum: 2, gara: 1.5, oras: 1, sat: 0 };
// răspunsul 3: coordonatele garajului din Briceni nu se știu; nopțile la Briceni sunt «parcare existentă»
export const BRICENI = { lat: 48.3615, lon: 27.0835, r: 3.5 };

export function hav(a, b) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** km-ul pasului dintre două puncte GPS: fără salturi > 5 km, fără deriva mașinii oprite (kmIntre din LEAR / cercetare) */
export const kmPas = (a, b) => { if (!a || !b) return 0; const d = hav(a, b); return d < SALT_KM && !(a.v <= 1 && b.v <= 1) ? d : 0; };

const parti = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
export function decalaj(t) { const p = parti(t); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; }
/** momentul (ms UTC) al orei 00:00 la Chișinău în ziua AAAA-LL-ZZ */
export function miezulNoptii(zi) { const g = Date.parse(`${zi}T00:00:00Z`); return g - decalaj(g - decalaj(g)); }
export const adaugaZile = (zi, n) => { const d = new Date(`${zi}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const ziLocala = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
/** ziua de lucru 03:00 → 03:00 (LEAR §2.4): golul aparține zilei în care s-a terminat ultima cursă */
export const ziLucru = (t) => ziLocala(t - 3 * 3600e3);
const FMT_ORA = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
export const oraLoc = (t) => FMT_ORA.format(new Date(t));

/**
 * Felul golului dintre două curse ale aceleiași mașini (cercetarea, ca la LEAR):
 * sub 60 min / peste 20 h (zi liberă) / la poarta altei uzine (muncă știută, ex. 652AKD la SEBN Orhei) / Bălți (service) → afară;
 * altfel noapte (trece de 03:00) sau zi (pauza de prânz).
 */
export function felGol({ t1, t0Urm, poarta = null, balti = false }) {
  const min = (t0Urm - t1) / 6e4;
  const noapte = ziLucru(t1) !== ziLucru(t0Urm);
  let motiv = null;
  if (min < GOL_MIN) motiv = 'sub 60 min';
  else if (min > GOL_MAX_H * 60) motiv = 'peste 20 h (zi liberă)';
  else if (poarta) motiv = `la poarta ${poarta} (muncă știută)`;
  else if (balti) motiv = 'Bălți (service)';
  return { min, noapte, motiv };
}

/** răspunsul 7: pauza de zi cu ieșire la > 5 km de capete = «timp liber» (km arătați separat, nu parcare); altfel pauză */
export const judecaPauza = ({ departe }) => (departe > LIBER_KM ? 'liber' : 'pauza');

/** răspunsul 3: numele locului unde stă acum noaptea; Briceni = «parcare existentă» */
export const eBriceni = (p) => !!p && hav(p, BRICENI) <= BRICENI.r;
export const numeAcum = (p, nume) => (eBriceni(p) ? `${nume} (parcare existentă)` : nume);

/**
 * Alegerea locului de noapte P1/P2 pentru o mașină: funcția LEAR (ION-143) neschimbată, cu preferința capătului rutei și toleranța
 * de 20 km/săpt. (răspunsul 2), pragul «rămâne cum e» 4 km (răspunsul 6). Doar nopțile (răspunsul 8).
 * legi[i] = { real, acum: {lat, lon} | null }; cand[j] = { n, lat, lon, pref }; cost[i][j] = km propuși prin locul j.
 */
export function alegeNoapte({ legi, cand, cost }) {
  const r = alegeLocuri({ legi, cand, cost, hav, P: { LA_FEL_KM, TOLERANTA } });
  const loc = legi.map((_, i) => { const j = r.alege(r.ales.idx, i); return j < 0 ? 0 : r.ales.idx.indexOf(j) + 1; });
  const propus = legi.map((l, i) => r.costAles(r.ales.idx, i));
  return { idx: r.ales.idx, loc, propus, real: legi.reduce((s, l) => s + l.real, 0), totalPropus: propus.reduce((s, x) => s + x, 0) };
}

/** staționările dintr-un interval de puncte: ≤ 300 m de ancoră; tăcerea tracker-ului fără deplasare = tot staționare */
export function statii(Q, t1, r = 0.3) {
  const out = []; let i = 0;
  while (i < Q.length) {
    let j = i; while (j + 1 < Q.length && hav(Q[j + 1], Q[i]) <= r) j++;
    const fin = j + 1 < Q.length ? Q[j + 1].t : t1;
    // un singur punct urmat de unul departe, cu viteză de mers între ele = tracker tăcut în mers, nu staționare
    const v = j + 1 < Q.length && fin > Q[j].t ? hav(Q[j], Q[j + 1]) / ((fin - Q[j].t) / 3600e3) : 0;
    const min = j === i && v > 5 ? 0 : (fin - Q[i].t) / 6e4;
    out.push({ lat: Q[i].lat, lon: Q[i].lon, t0: Q[i].t, t1: fin, min });
    i = j + 1;
  }
  return out;
}

/**
 * Bucățile unui gol pe hartă, fără goluri între ele: staționările ≥ 15 min = «parcare» (stă), restul = drumul golului (tipMers).
 * Acoperă exact [t0, t1].
 */
export function bucatiGol(Q, t0, t1, tipMers, extra = {}) {
  const st = statii(Q.filter((p) => p.t >= t0 && p.t <= t1), t1).filter((s) => s.min >= STA_MIN);
  const out = []; let t = t0;
  for (const s of st) {
    const a = Math.max(s.t0, t), b = Math.min(s.t1, t1); if (b <= a) continue;
    if (a > t) out.push({ t0: t, t1: a, tip: tipMers, ...extra });
    out.push({ t0: a, t1: b, tip: 'parcare', sta: { lat: s.lat, lon: s.lon }, ...extra });
    t = b;
  }
  if (t < t1) out.push({ t0: t, t1, tip: tipMers, ...extra });
  return out;
}

/** bucata (span) care conține momentul t; bucățile sunt sortate și lipite */
export function bucataLa(spans, t) {
  let lo = 0, hi = spans.length - 1;
  if (!spans.length || t < spans[0].t0) return -1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (spans[m].t0 <= t) lo = m; else hi = m - 1; }
  return t <= spans[lo].t1 ? lo : -1;
}

/**
 * Intervalele unei zile [A, B): fiecare bucată care atinge ziua, cu km-ul pașilor ale căror puncte cad în ea.
 * pasi: [{ t, km, k }] (k = indicele bucății). Σ intervale = Σ pași = km-ul zilei, exact. Bucățile fără km și sub 1 min nu se arată.
 */
export function intervaleZi(spans, pasi, A, B) {
  const km = new Map(); for (const p of pasi) km.set(p.k, (km.get(p.k) ?? 0) + p.km);
  const out = [];
  spans.forEach((s, k) => {
    if (s.t1 <= A || s.t0 >= B) { if (km.has(k)) throw new Error(`pas în afara bucății ${k}`); return; }
    const t0 = Math.max(s.t0, A), t1 = Math.min(s.t1, B), x = km.get(k) ?? 0;
    if (x === 0 && t1 - t0 < 60e3) return;
    out.push({ k, t0, t1, km: x });
  });
  return out;
}

/** regula din 25.09 (optim2.mjs, «doarme la capăt», doar seara la capăt; informativ, răspunsul 1): km pe mașină în zilele date */
export function regula2509(optim2, m, zile) {
  const Z = new Set(zile); let km = 0, n = 0, laCapat = 0, cazB = 0; const peZi = {};
  for (const r of optim2 ?? []) for (const d of r.detalii ?? []) {
    if (d.m !== m || !Z.has(d.z)) continue;
    n++; km += d.optim ?? 0; if (d.laCapat) laCapat++; if (d.cazB) cazB++; peZi[d.z] = (peZi[d.z] ?? 0) + (d.optim ?? 0);
  }
  return { km: Math.round(km * 10) / 10, zile: n, laCapat, cazB, peZi };
}
