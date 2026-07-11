import 'server-only';
import { redirect } from 'next/navigation';
import { verifySession, type Session } from './auth';
import { getSupabase } from './supabase';
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

// SURSĂ UNICĂ: rolurile „de vânzător" văd/acționează DOAR pe facturile LOR în e-Factura (nu ale altora).
// VINZATOR (magazin) și GESTIONAR (depozitar intern care poate vinde) sunt scoped pe seller; ADMIN/CONTABIL văd toate facturile.
export function sellerScoped(role: AdminRole): boolean {
  return role === 'VINZATOR' || role === 'GESTIONAR';
}

// SURSĂ UNICĂ: rolurile care pot adăuga/edita piese în catalog + locațiile lor (aceleași care fac recepția).
// Folosită ȘI de garda server `requirePartWrite` (part-actions.ts), ȘI de UI (`canEditParts`) — o singură listă,
// ca gardul real și afișarea butonului „Editează" să nu poată diverge.
export const PART_WRITE_ROLES: AdminRole[] = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'];
export function canEditParts(role: AdminRole): boolean {
  return PART_WRITE_ROLES.includes(role);
}

// ── Etapa 2: legarea contului de UN depozit ──────────────────────────────────
// Rolurile de depozit care se pot lega de un singur depozit — SURSĂ UNICĂ în piese-roles.ts (importabilă și din client).
export { DEPOT_BOUND_ROLES } from './piese-roles';

// SURSĂ UNICĂ pentru „de ce depozit ține contul". NULL = TOATE depozitele (ADMIN sau cont cu drepturi extinse).
// Folosită ȘI de dropdown-ul filtrat (ce depozite vede în formular), ȘI de garda de server (unde poate opera),
// ca afișarea și restricția reală să nu poată diverge.
// FAIL-CLOSED: pentru un cont non-ADMIN, dacă interogarea eșuează sau rândul lipsește (cont șters, dar JWT încă
// valid 24h), NU cădem în „toate depozitele" — aruncăm. Doar `warehouse_id` explicit NULL = toate (drepturi extinse).
export async function userWarehouseId(session: Session): Promise<number | null> {
  if (session.role === 'ADMIN') return null; // adminul operează pe toate depozitele
  const { data, error } = await getSupabase()
    .from('admin_accounts')
    .select('warehouse_id')
    .eq('id', session.id)
    .maybeSingle();
  if (error) throw new Error('Nu am putut verifica depozitul contului');
  if (!data) throw new Error('Cont inexistent sau dezactivat');
  const wid = (data as { warehouse_id: number | null }).warehouse_id;
  return wid == null ? null : Number(wid); // NULL explicit = toate (drepturi extinse)
}

// Filtrează lista de depozite la ce poate vedea contul (pură, fără DB). wid=null → toate.
export function warehousesForUser<T extends { id: number | string }>(all: T[], wid: number | null): T[] {
  return wid == null ? all : all.filter((w) => Number(w.id) === wid);
}

// Gardă de server: aruncă dacă contul e legat de un depozit și încearcă să opereze pe ALTUL.
// Se cheamă în fiecare acțiune de scriere care primește un warehouse_id de la client (prihod/rashod/inventar/mutări).
export async function assertWarehouseAllowed(session: Session, warehouseId: number): Promise<void> {
  const wid = await userWarehouseId(session);
  if (wid != null && Number(warehouseId) !== wid) {
    throw new Error('Nu ai acces la acest depozit (contul tău e legat de alt depozit)');
  }
}
