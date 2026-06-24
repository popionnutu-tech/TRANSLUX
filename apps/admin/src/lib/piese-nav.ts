import type { AdminRole } from '@translux/db';

// Sursă unică pentru vizibilitatea sub-paginilor modulului „Piese" pe rol.
// Folosită de PieseNav (taburi) ȘI de Sidebar (meniu), ca să nu divergă (vezi review-ul arhitectural).
// ADMIN = acces complet (null). Restul rolurilor: doar href-urile din set.
const PIESE_HREFS_BY_ROLE: Partial<Record<AdminRole, Set<string>>> = {
  // CONTABIL — citire + intrări (prihod) + fiscal/1C + nomenclator (grupe/furnizori/clienți).
  CONTABIL: new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/nomenclator', '/piese/prihod', '/piese/harta', '/piese/rapoarte', '/piese/fiscal', '/piese/integrare-1c']),
  // DEPOZITAR — operează depozitul + vânzări + nomenclator operațional; fără fiscal/1C.
  DEPOZITAR: new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/nomenclator', '/piese/prihod', '/piese/rashod', '/piese/mutari', '/piese/inventar', '/piese/harta', '/piese/magazin', '/piese/rapoarte']),
  // MANAGER — doar supraveghere (citire).
  MANAGER: new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/harta', '/piese/rapoarte']),
};

// Întoarce setul de href-uri permise pentru un rol, sau null pentru acces complet (ADMIN).
export function pieseHrefsForRole(role: AdminRole): Set<string> | null {
  if (role === 'ADMIN') return null;
  return PIESE_HREFS_BY_ROLE[role] ?? PIESE_HREFS_BY_ROLE.CONTABIL!;
}
