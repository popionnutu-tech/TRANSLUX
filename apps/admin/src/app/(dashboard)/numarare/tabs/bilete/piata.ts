// «Piața» pe pereche (ION-171): piesele pure ale coloanei — cheia perechii ca în SQL (piata_cheie, migr. 463), motivul
// pentru care coloana arată «—», textele. Logica de calcul e în baza de date (piata_calc_luna); aici doar citire.

import type { Filters, Piata, PiataPereche } from './types';

/** Alias-urile din tiki_stop_map (scrierea TIKI → numele din Numărare / BNS). Ținute la zi cu migr. 452. */
const ALIAS: Record<string, string> = { beleavineti: 'beleavinti', 'sl sirauti': 'sirauti' };

export function piataStopNorm(x: string): string {
  const n = x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(ga|gara|autogara)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return ALIAS[n] ?? n;
}

/** Cheia perechii TIKI «A - B», identică cu piata_cheie(A, B) din SQL. */
export function piataCheie(pair: string): string {
  const [a = '', b = ''] = pair.split(' - ');
  return [piataStopNorm(a), piataStopNorm(b)].sort().join('|');
}

export const PIATA_PRIMA_LUNA = '2026-05-01';

/** De ce nu se poate arăta «Piața» pentru filtrele alese; null = se poate. */
export function motivFaraPiata(filters: Pick<Filters, 'from' | 'to' | 'route' | 'driver'>, piata: Piata | null): string | null {
  if (filters.route || filters.driver) return 'Piața se calculează pe toate cursele și toți șoferii: scoate filtrul de cursă / șofer.';
  if (!piata) return 'Piața nu s-a putut încărca.';
  if (piata.luni.length === 0) {
    const prima = piata.prima_luna ?? PIATA_PRIMA_LUNA;
    if (filters.to < prima) return `Piața există din ${fmtLuna(prima)} (locurile din grafic sunt din 04.04.2026).`;
    return 'Piața e pe luni încheiate, calculate noaptea: alege «Luna dinainte» sau o perioadă care cuprinde o lună întreagă (≥ ' + fmtLuna(prima) + ').';
  }
  return null;
}

export function fmtLuna(d: string): string {
  const m = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];
  const [y, mm] = d.split('-');
  return `${m[Number(mm) - 1]} ${y}`;
}

const nf0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

/** «3.000–3.400»; o singură cifră când capetele coincid (fără concurenți). */
export function fmtInterval(min: number, max: number): string {
  const a = Math.round(min), b = Math.round(max);
  return a === b ? nf0.format(a) : `${nf0.format(a)}–${nf0.format(b)}`;
}

export const TIP_LABEL: Record<PiataPereche['tip'], string> = {
  mic: 'sat mic — fără estimare (doar orașe și sate foarte mari, ca Corjeuți)', coada: 'coadă', balti: 'Bălți (doar cursele directe Bălți–Chișinău)', trunchi: 'trunchi — fără concurenți', local: 'fără Chișinău (cursele străine care ating ambele capete)',
};

export const STEAG_LABEL: Record<string, string> = {
  fara_baza: 'fără bilete în luna de bază: concurenții nu se pot scala',
  regula40_extinsa: 'regula 40 % dată de Ion pentru Briceni / Edineț, aplicată și aici',
  fara_bazin: 'stația nu e legată de o localitate BNS',
  model_sub_observat: 'bilete + omiși depășesc piața estimată',
  fara_concurenti: 'nicio cursă străină pe pereche în graficul ANTA',
};

/** Textul de la hover: componentele și presupunerile, în ordinea planului. */
export function descriePereche(p: PiataPereche, parametri: Record<string, unknown> = {}): string {
  const pond = Number(parametri.pondere_imbarcare ?? 0.4) * 100;
  const rows: string[] = [];
  rows.push(`${p.de_la} – ${p.pana_la} · ${TIP_LABEL[p.tip]} · ${p.luni} ${p.luni === 1 ? 'lună' : 'luni'}`);
  rows.push(`Bilete observate (ziua cursei): ${nf0.format(p.bilete)}`);
  if (p.omisi != null) rows.push(`~Omiși de TIKI (estimare, extrapolată la zilele lunii; Numărare pe ${Math.round((p.omisi_acoperire ?? 0) * 100)} % din zile): ${nf0.format(p.omisi)}`);
  if (p.tip !== 'trunchi' && p.tip !== 'mic') {
    rows.push(`Concurenți (ANTA): ${fmtInterval(p.conc_min, p.conc_max)} bilete = Σ curse străine × ${pond} % din ${Number(parametri.locuri_straine ?? 20)} locuri pe plecare × cota perechii pe cursă (după biletele noastre pe perechile pe care le atinge cursa) × factor de oră (îmbarcarea noastră la ora cursei ÷ media, 0,5…1,5) × 5/7…7/7 zile`);
    const curse = p.detalii?.curse ?? [];
    for (const c of curse.slice(0, 12)) {
      rows.push(`  · ${c.firma} — ${c.cursa}, ${c.sens === 'chisinau_nord' ? 'din Chișinău' : 'spre Chișinău'} ${c.ora}: cota ${c.cota ?? "?"} · factor de oră ${c.factor_ora ?? 1} (noi ${c.bpp == null ? '?' : c.bpp} bilete/plecare)${c.tranzit !== 1 ? `, tranzit ×${c.tranzit}` : ''} → ~${nf0.format(c.luna)}/lună`);
    }
    if (curse.length > 12) rows.push(`  · … încă ${curse.length - 12} curse`);
    if (p.detalii?.delta != null && p.detalii.delta !== 1) rows.push(`Delta față de luna de bază (09.2026): ×${Number(p.detalii.delta).toFixed(2)}`);
  }
  if (p.oras != null) rows.push(`Oraș ${nf0.format(p.oras)} loc. · bazin ${nf0.format(p.bazin ?? p.oras)} loc. (RPL 2024; + satele fără stație din 10 km) — numitor de scară, nu clienți posibili`);
  if (p.aford_net != null) rows.push(`Afordabilitate: dus-întors = ${(p.aford_net * 100).toFixed(1)} % din salariul net al raionului${p.aford_pensie != null ? `, ${(p.aford_pensie * 100).toFixed(0)} % dintr-o pensie` : ''}`);
  for (const s of p.steaguri ?? []) rows.push(`⚑ ${STEAG_LABEL[s] ?? s}`);
  return rows.join('\n');
}
