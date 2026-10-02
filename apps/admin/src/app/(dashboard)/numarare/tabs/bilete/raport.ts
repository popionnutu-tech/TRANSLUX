// Calculele celor trei rapoarte ION-167 (Comparație perioade, Rute, Șoferi), pure, peste totalurile din migr. 466.
// Plan: docs/plans/2026-10-01-bilete-trei-rapoarte.md (v7).
//
// Două măsuri peste tot: «Bilete TIKI» și «Fără bilet TIKI (numărați)» (Numărare − TIKI pe tronsoane, estimare);
// «Oameni transportați» = suma lor. «Fără bilet» se estimează pe rută: media pe zilele complet numărate × zilele circulate,
// doar pe rutele cu cel puțin jumătate din zile complet numărate.

import type { TikiComparatie, TikiRuta, TikiRutaPerechi, TikiSoferV2 } from './types';

export const PRAG_NUMARATA = 0.5;

// ── Perioade pe luni ─────────────────────────────────────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');

export function monthBounds(m: string): { from: string; to: string } {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${y}-${pad(mo)}-01`, to: `${y}-${pad(mo)}-${pad(last)}` };
}

export function shiftMonthKey(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Ultima lună întreagă cu date: luna lui dateMax dacă dateMax e ultima ei zi, altfel luna dinainte. */
export function lastFullMonth(dateMax: string): string {
  const m = dateMax.slice(0, 7);
  return monthBounds(m).to === dateMax ? m : shiftMonthKey(m, -1);
}

export function monthsDesc(dateMin: string, dateMax: string): string[] {
  const out: string[] = [];
  for (let m = dateMax.slice(0, 7); m >= dateMin.slice(0, 7); m = shiftMonthKey(m, -1)) out.push(m);
  return out;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

// ── Rute ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RutaRand {
  r: TikiRuta;
  acoperire: number | null;       // zile complet numărate / zile circulate
  numarata: boolean;              // ≥ 50 %: «fără bilet» și «se ține pe» se arată
  tikiZi: number | null;          // TIKI pe zi circulată
  faraZi: number | null;          // fără bilet pe zi complet numărată
  oameniZi: number | null;
  top: { nume: string; oameniZi: number; pct: number }[];
}

export function rutaRand(r: TikiRuta): RutaRand {
  const acoperire = div(r.zile_numarate, r.zile_circulate);
  const numarata = r.zile_numarate > 0 && (acoperire ?? 0) >= PRAG_NUMARATA;
  const tikiZi = div(r.tiki, r.zile_circulate);
  const faraZi = numarata ? div(r.fara_c, r.zile_numarate) : null;
  const totC = r.tiki_c + r.fara_c;
  return {
    r, acoperire, numarata, tikiZi, faraZi,
    oameniZi: tikiZi != null && faraZi != null ? tikiZi + faraZi : null,
    top: numarata && totC > 0
      ? r.top.map(p => ({ nume: numePereche(p), oameniZi: (p.tiki + p.fara) / r.zile_numarate, pct: ((p.tiki + p.fara) / totC) * 100 }))
      : [],
  };
}

export interface RuteSumar { circulate: number; estimate: number; oameniZi: number | null; tikiZi: number | null; faraZi: number | null }

/** Media pe rută, doar peste rutele estimate (spus pe ecran: «pe N rute»). */
export function ruteSumar(rows: RutaRand[]): RuteSumar {
  const est = rows.filter(r => r.oameniZi != null);
  const avg = (f: (r: RutaRand) => number) => (est.length ? est.reduce((s, r) => s + f(r), 0) / est.length : null);
  return {
    circulate: rows.filter(r => r.r.zile_circulate > 0).length,
    estimate: est.length,
    oameniZi: avg(r => r.oameniZi!),
    tikiZi: avg(r => r.tikiZi!),
    faraZi: avg(r => r.faraZi!),
  };
}

export interface PerecheRutaRand { nume: string; leg: string; tikiZi: number | null; oameniZi: number | null; pct: number | null }

export function rutaPerechiRanduri(d: TikiRutaPerechi): PerecheRutaRand[] {
  const numarata = d.zile_numarate > 0 && d.zile_numarate / Math.max(d.zile_circulate, 1) >= PRAG_NUMARATA;
  const tot = d.perechi.reduce((s, p) => s + p.tiki_c + p.fara, 0);
  return d.perechi.map(p => ({
    nume: numePereche(p),
    leg: p.leg,
    tikiZi: div(p.tiki, d.zile_circulate),
    oameniZi: numarata ? (p.tiki_c + p.fara) / d.zile_numarate : null,
    pct: numarata && tot > 0 ? ((p.tiki_c + p.fara) / tot) * 100 : null,
  }));
}

// ── Comparație perioade ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface ComparatieRand {
  nume: string;
  tikiA: number; tikiB: number;
  faraA: number | null; faraB: number | null;
  oameniA: number | null; oameniB: number | null;
  /** diferența pe zi (A − B), pe oameni dacă se poate, altfel pe bilete TIKI */
  difZi: number;
}

export interface Comparatie {
  cuFara: boolean;                 // ambele perioade au Numărare și măcar o rută inclusă
  randuri: ComparatieRand[];       // primele `top`, apoi «Altele», apoi «Total»
  total: ComparatieRand;
}

/** Perechea fără sens, capetele în ordinea cheii (sensul se arată separat, pe coloana «Sens»). */
export function numePereche(p: { cheie: string; de_la: string | null; pana_la: string | null }): string {
  if (p.cheie === 'nedeterminat' || !p.de_la || !p.pana_la) return 'Pereche necunoscută';
  return `${p.de_la} – ${p.pana_la}`;
}

export function comparatie(d: TikiComparatie, top = 15): Comparatie {
  const cuFara = d.numarare_a && d.numarare_b && d.rute_incluse > 0;
  const rand = (nume: string, tikiA: number, tikiB: number, faraA: number, faraB: number): ComparatieRand => {
    const oA = cuFara ? tikiA + faraA : null, oB = cuFara ? tikiB + faraB : null;
    const difZi = cuFara ? oA! / d.zile_a - oB! / d.zile_b : tikiA / d.zile_a - tikiB / d.zile_b;
    return { nume, tikiA, tikiB, faraA: cuFara ? faraA : null, faraB: cuFara ? faraB : null, oameniA: oA, oameniB: oB, difZi };
  };
  const all = d.perechi.map(p => rand(numePereche(p), p.tiki_a, p.tiki_b, p.fara_a, p.fara_b));
  const vol = (r: ComparatieRand) => Math.max(r.oameniA ?? r.tikiA, r.oameniB ?? r.tikiB);
  const mari = [...all].sort((x, y) => vol(y) - vol(x));
  const primele = mari.slice(0, top).sort((x, y) => x.difZi - y.difZi);   // cea mai mare scădere sus
  const rest = mari.slice(top);
  const sum = (rs: ComparatieRand[], nume: string) => rand(nume,
    rs.reduce((s, r) => s + r.tikiA, 0), rs.reduce((s, r) => s + r.tikiB, 0),
    rs.reduce((s, r) => s + (r.faraA ?? 0), 0), rs.reduce((s, r) => s + (r.faraB ?? 0), 0));
  const randuri = rest.length ? [...primele, sum(rest, `Altele (${rest.length})`)] : primele;
  return { cuFara, randuri, total: sum(all, 'Total') };
}

// ── Șoferi ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SoferRand {
  s: TikiSoferV2;
  peCursa: number | null;          // bilete pe cursă (toate cursele lui)
  colegiPeCursa: number | null;    // cât ar fi vândut colegii pe cursele lui comparabile, pe cursă
  difPeCursa: number | null;
  dif: number | null;              // bilete în plus (+) / în minus (−) în perioadă, doar pe cursele comparabile
  leiZi: number | null;
}

export function soferRand(s: TikiSoferV2): SoferRand {
  const comp = s.curse_comp > 0;
  return {
    s,
    peCursa: div(s.bilete, s.curse),
    colegiPeCursa: comp ? s.asteptat / s.curse_comp : null,
    difPeCursa: comp ? (s.bilete_comp - s.asteptat) / s.curse_comp : null,
    dif: comp ? s.bilete_comp - s.asteptat : null,
    leiZi: div(s.lei, s.zile),
  };
}

/** Capătul din nord al rutei («Grimăncăuți - Chișinău» / «Chișinău» + «Ocnița» → «Grimăncăuți» / «Ocnița»). */
export function capatNord(deLa: string | null, panaLa: string | null): string {
  const parti = [deLa, panaLa].flatMap(x => (x ?? '').split(' - ')).map(x => x.trim()).filter(Boolean);
  return parti.find(x => !/chi[sș]in[aă]u/i.test(x)) ?? parti[0] ?? '—';
}
