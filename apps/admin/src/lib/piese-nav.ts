import type { AdminRole } from '@translux/db';

// Sursă unică pentru vizibilitatea sub-paginilor modulului „Piese" pe rol.
// Folosită de PieseNav (taburi) ȘI de Sidebar (meniu), ca să nu divergă.
// ADMIN = acces complet (null). Restul rolurilor: doar href-urile din set.
const PIESE_HREFS_BY_ROLE: Partial<Record<AdminRole, Set<string>>> = {
  // VINZATOR — ieșiri (rashod), vânzări (magazin), mutări între depozite, inventariere + e-Factura pt. vânzările lui.
  VINZATOR: new Set(['/piese', '/piese/stoc', '/piese/cautare', '/piese/catalog', '/piese/nomenclator', '/piese/rashod', '/piese/mutari', '/piese/inventar', '/piese/magazin', '/piese/fiscal', '/piese/harta', '/piese/rapoarte']),
  // DEPOZITAR — intrări (prihod), inventariere, nomenclator (furnizori); vede „de comandat"/stoc.
  DEPOZITAR: new Set(['/piese', '/piese/stoc', '/piese/cautare', '/piese/catalog', '/piese/nomenclator', '/piese/prihod', '/piese/inventar', '/piese/harta', '/piese/rapoarte']),
  // CONTABIL — doar citire pe documente + rapoarte + e-Factura/1C (export).
  CONTABIL: new Set(['/piese', '/piese/stoc', '/piese/cautare', '/piese/catalog', '/piese/harta', '/piese/rapoarte', '/piese/fiscal', '/piese/integrare-1c']),
  // MANAGER — doar supraveghere (citire + rapoarte).
  MANAGER: new Set(['/piese', '/piese/stoc', '/piese/cautare', '/piese/catalog', '/piese/harta', '/piese/rapoarte']),
};

// Întoarce setul de href-uri permise pentru un rol, sau null pentru acces complet (ADMIN).
// Fallback la MANAGER (cel mai restrictiv) pentru orice rol necunoscut — niciodată acces lărgit implicit.
export function pieseHrefsForRole(role: AdminRole): Set<string> | null {
  if (role === 'ADMIN') return null;
  return PIESE_HREFS_BY_ROLE[role] ?? PIESE_HREFS_BY_ROLE.MANAGER!;
}
