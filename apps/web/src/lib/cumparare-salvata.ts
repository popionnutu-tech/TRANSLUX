import type { TripResult } from "@/app/(public)/actions";

// Cumpărarea neterminată (Ion, 10.10.2026: «am băgat pe MIA — aruncă în aplicația băncii, nu se primește și vreau să ies,
// am pierdut toți pașii»). Înainte de trimiterea la bancă alegerea se ține în fila browserului (sessionStorage, 30 min);
// la întoarcere — pagina biletului «Plata nu a trecut» sau prima pagină — «Reia plata» redeschide fereastra la plată cu
// tot ce era ales, cu chei noi și cu încercarea veche dată spre înlocuire (550).

export const CHEIE_CUMPARARE = "tlx_cumparare";
const VALABIL_MS = 30 * 60_000;

export interface CumparareSalvata {
  v: 1;
  tip: "simplu" | "tur-retur";
  salvatLa: number;
  from: string; to: string; fromRo: string; toRo: string;
  trip: TripResult;
  retur: TripResult | null;
  seats: number;
  alese: number[];
  aleseRetur: number[];
  punct: number | null;
  camp: { lastName: string; firstName: string; phone: string; email: string };
  /** Cheile de tur trimise înainte (cel mult 4): serverul le înlocuiește dacă banca n-a încasat nimic. */
  chei: string[];
}

export function salveazaCumpararea(c: Omit<CumparareSalvata, "v" | "salvatLa">): void {
  try { sessionStorage.setItem(CHEIE_CUMPARARE, JSON.stringify({ ...c, v: 1, salvatLa: Date.now(), chei: c.chei.slice(-4) })); } catch { /* stocare blocată */ }
}

export function citesteCumpararea(): CumparareSalvata | null {
  try {
    const raw = sessionStorage.getItem(CHEIE_CUMPARARE);
    if (!raw) return null;
    const c = JSON.parse(raw) as CumparareSalvata;
    if (c?.v !== 1 || !c.trip || Date.now() - Number(c.salvatLa) > VALABIL_MS) { sessionStorage.removeItem(CHEIE_CUMPARARE); return null; }
    return c;
  } catch { return null; }
}

export function stergeCumpararea(): void {
  try { sessionStorage.removeItem(CHEIE_CUMPARARE); } catch { /* nimic */ }
}
