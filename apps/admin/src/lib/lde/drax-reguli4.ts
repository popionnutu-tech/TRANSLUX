// Cele 4 reguli de optimizare ale lui Ion pentru Drăxlmaier (ION-120, 28.09.2026; §8.7): 1 doarme la capăt dacă ruta se termină în aceeași
// localitate, 2 rămâne la uzină între tur și retur, 3 rutele împărțite altfel, 4 nu pleacă acasă între schimburi. Cifrele vin din rândul
// săptămânii (date.reguli4, scris de VPS: drax/cod/saptamanal/{patru-reguli,scrie-reguli4}.mjs), după dezbaterea Claude + Codex și deciziile
// lui Ion: Bălți în afara regulii 1, regula 1 propusă doar peste 100 km/săpt. pe mașină, regula 2 fără plafon, regula 3 doar dacă totalul flotei
// scade cu ≥ 50 km/săpt. Fiecare km e într-o singură regulă. Aici doar textul, funcții pure.

export interface KmRegula { masurat: number; extrapolat: number }
export interface Reguli4Masina {
  m: string;
  R1: { propus: boolean; km: number; kmSapt: number; nopti: number; X: string | null; soferKm: number | null; motiv: string | null } | null;
  R2: number; R4: number; R4laCapat: number; R4laUzina: number; balti: number; total: number;
}
export interface Reguli4Drax {
  versiune: string; rulat: string; esantion: number; zileLV: number; factor: number;
  flota: {
    R1propus: KmRegula; R1masuratToateMasinile: KmRegula; R2: KmRegula; R4: KmRegula; sumaPropusa: KmRegula;
    R3: { candidati: number; net: number; nota: string }; balti: KmRegula & { toateZileleDiag: number; nota: string };
  };
  R3: { candidati: { A: string; B: string; net: number; castigA: number; castigB: number }[]; perechiVerificate: number; masiniEligibile: number;
    masiniCuZileExcluse: number; prag: number; capacitate: string };
  masini: Reguli4Masina[];
}

const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');

export const TITLURI_REGULI4 = {
  R1: '1 · Doarme la capăt',
  R2: '2 · Rămâne la uzină',
  R3: '3 · Rute împărțite altfel',
  R4: '4 · Nu pleacă acasă între schimburi',
} as const;

/** regula 1 pe mașină: unde doarme și cât taie, sau de ce nu se propune */
export function textR1(m: Reguli4Masina): string {
  if (!m.R1 || m.R1.km < 0.5) return '—';
  const unde = m.R1.X ?? 'capăt';
  if (!m.R1.propus) return `sub prag (${nr(m.R1.kmSapt)}/săpt.)`;
  const sofer = m.R1.soferKm != null && m.R1.soferKm >= 0.5 ? ` · șofer ${nr(m.R1.soferKm)} km` : '';
  return `${unde} · ${nr(m.R1.km)}${sofer}`;
}

/** regula 4 pe mașină: câți km și unde așteaptă în loc să meargă acasă */
export function textR4(m: Reguli4Masina): string {
  if (m.R4 < 0.5) return '—';
  const parti = [m.R4laCapat >= 0.5 ? `capăt ${nr(m.R4laCapat)}` : '', m.R4laUzina >= 0.5 ? `uzină ${nr(m.R4laUzina)}` : ''].filter(Boolean);
  return `${nr(m.R4)} · ${parti.join(' / ')}`;
}

/** textul cardului regulii 3: schimburile propuse sau de ce nu e niciunul */
export function textR3(r: Reguli4Drax): string {
  if (!r.R3.candidati.length)
    return `Niciun schimb nu scade flota cu ≥ ${r.R3.prag} km/săpt. (${r.R3.masiniEligibile} mașini verificate). Locuri pe tip: de confirmat.`;
  return r.R3.candidati.map((c) => `${c.A} ↔ ${c.B}: flota −${nr(c.net)} km/săpt. (${c.A} ${c.castigA >= 0 ? '−' : '+'}${nr(Math.abs(c.castigA))}, ${c.B} ${c.castigB >= 0 ? '−' : '+'}${nr(Math.abs(c.castigB))})`).join(' · ')
    + ' · locuri pe tip: de confirmat';
}

/** mașinile cu ceva de tăiat, în ordinea totalului; cele doar cu Bălți la coadă */
export function randuriReguli4(r: Reguli4Drax): Reguli4Masina[] {
  return r.masini.filter((m) => m.total >= 0.5 || m.balti >= 0.5 || (m.R1?.km ?? 0) >= 0.5)
    .sort((a, b) => b.total - a.total || b.balti - a.balti || a.m.localeCompare(b.m));
}
