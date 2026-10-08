// Citirea .xls-ului Intelect cu SheetJS 0.20.3 (versiunea fără GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9), cu opțiuni
// stricte: fără formule, fără HTML, cel mult 20.000 de rânduri. Doar pe server.
import * as XLSX from 'xlsx';
import { EroareFisier } from './combustibil-fisiere';

export function randuriXls(buf: Uint8Array): string[][] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: 20000, dense: true });
  } catch {
    throw new EroareFisier('Fișierul .xls nu se poate deschide — e chiar raportul din Intelect?');
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new EroareFisier('Fișierul .xls nu are nicio foaie');
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }).map((r) => Array.from(r ?? [], (x) => String(x ?? '')));
}
