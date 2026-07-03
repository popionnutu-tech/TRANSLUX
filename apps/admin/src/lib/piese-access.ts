import 'server-only';
import { redirect } from 'next/navigation';
import { verifySession, type Session } from './auth';
import type { AdminRole } from '@translux/db';

// Acces pe operațiunile modulului „Piese". Fiecare pagină de scriere cheamă gardul potrivit;
// rolurile fără drept sunt redirectate spre o pagină de citire (/piese/stoc, vizibilă tuturor rolurilor piese).
// Drepturile se aplică ȘI la nivel de server action (requireRole) — nav-ul doar ascunde linkuri.
async function gate(roles: AdminRole[]): Promise<Session> {
  const session = await verifySession();
  if (!session || !roles.includes(session.role)) redirect('/piese/stoc');
  return session;
}

// Intrări (prihod): depozitarul + gestionarul (depozitar intern) + admin.
export const requirePieseReceipt = () => gate(['ADMIN', 'DEPOZITAR', 'GESTIONAR']);
// Ieșiri (rashod), vânzări (magazin), mutări între depozite: vânzătorul + gestionarul + admin.
export const requirePieseIssue = () => gate(['ADMIN', 'VINZATOR', 'GESTIONAR']);
// Inventariere: și depozitar, și vânzător, + admin.
export const requirePieseInventory = () => gate(['ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR']);
// e-Factura (vede/descarcă/marchează SFS): vânzător + gestionar (fiecare doar facturile lui) + contabil + admin.
export const requirePieseFiscal = () => gate(['ADMIN', 'CONTABIL', 'VINZATOR', 'GESTIONAR']);
// Export 1C: contabil + admin.
export const requirePiese1C = () => gate(['ADMIN', 'CONTABIL']);
// Nomenclatoare (cine poate ajunge la pagină): cei care editează cel puțin o secțiune.
export const requirePieseNomenclator = () => gate(['ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR']);
// Asistent căutare piesă: citire pentru toate rolurile modulului (vânzător, depozitar, contabil, manager, admin).
export const requirePieseSearch = () => gate(['ADMIN', 'VINZATOR', 'DEPOZITAR', 'CONTABIL', 'MANAGER', 'GESTIONAR']);

// SURSĂ UNICĂ: costul de achiziție (preț plătit furnizorului, valoare/cost FIFO, profit, furnizor) e vizibil
// tuturor rolurilor modulului — MAI PUȚIN vânzătorul (VINZATOR), care vede doar prețul de vânzare, cantitatea, locația.
// Folosită de TOATE ecranele care afișează cost (tablou, stoc, magazin, rapoarte, căutare), ca regula să nu divergă.
export function canSeeCost(role: AdminRole): boolean {
  return role !== 'VINZATOR';
}
