import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { verifySession, type Session } from './auth';
import { getSupabase } from './supabase';
import type { AdminRole } from '@translux/db';
import { SELLER_SCOPED_ROLES } from './piese-roles';

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
// Lista trăiește în piese-roles.ts (fișier fără 'server-only'), ca UI-ul din /users să afișeze comutatorul
// exact pentru rolurile pe care garda de server le consultă.
// PRIVATĂ intenționat: consumatorii externi folosesc invoiceReadFilter / invoiceWriteOwner, ca să nu existe
// două drumuri publice către aceeași regulă (unul care ține cont de sees_all_invoices, altul care nu).
function sellerScoped(role: AdminRole): boolean {
  return SELLER_SCOPED_ROLES.includes(role);
}

// Citirea UNICĂ a rândului de cont pentru drepturile care nu stau în JWT (depozit + migr. 287).
// Un singur SELECT, ca fiecare drept nou să nu adauge încă un round-trip.
//
// De ce citim ȘI `role`, ȘI `active`, deși sesiunea le-ar putea da mai ieftin: rolul din JWT e o FOTOGRAFIE
// de la login, valabilă 24h. Un cont retrogradat sau dezactivat păstrează token-ul vechi până la expirare.
// Pentru drepturi asupra documentelor fiscale asta e inacceptabil — retragerea trebuie să fie imediată,
// nu de mâine. Deci rolul efectiv pentru gărzile de aici e cel din DB, nu cel din token.
// `null` = cont inexistent, dezactivat sau eroare de DB — toți consumatorii îl tratează ca restricție maximă.
type AccountFlags = { role: AdminRole; warehouse_id: number | null; edit_window_days: number; sees_all_invoices: boolean };
// Memoizat per cerere: pe drumul de corectare a recepției îl cer ACUM doi consumatori (depozitul și fereastra),
// iar `cache` din React face ca al doilea să nu mai atingă DB-ul. Fără el, pliarea lui userWarehouseId peste
// accountFlags ar fi transformat două citiri diferite în două citiri identice, tot două.
const accountFlags = cache(async function accountFlags(session: Session): Promise<AccountFlags | null> {
  const { data, error } = await getSupabase()
    .from('admin_accounts')
    .select('role, active, warehouse_id, edit_window_days, sees_all_invoices')
    .eq('id', session.id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as AccountFlags & { active: boolean };
  if (row.active === false) return null; // dezactivat, dar cu JWT încă valid → fără drepturi
  return row;
});

// ── e-Factura: CITIRE vs SCRIERE sunt drepturi DIFERITE ──────────────────────
// Despărțirea e intenționată. `sees_all_invoices` a fost cerut ca VIZIBILITATE — dacă am fi folosit
// același filtru și la scriere, bifa ar fi dat tăcut și dreptul de a marca „trimisă la SFS" facturile
// altor vânzători, operație ireversibilă (butonul dispare după SEND) și fără legătură cu vizibilitatea.

// Rolurile care văd TOATE facturile prin natura funcției lor. LISTĂ ALBĂ, deliberat.
// De ce nu „oricine nu e vânzător": poarta de intrare (requirePieseFiscal, middleware) citește rolul din JWT,
// iar filtrul de aici îl citește din DB. Cele două pot să nu coincidă timp de 24h după o schimbare de rol.
// Cu o listă NEAGRĂ, un vânzător retrogradat (JWT zice VINZATOR → intră; DB zice DEPOZITAR → „nu e vânzător")
// ar fi primit „vede tot" — adică retrogradarea i-ar fi LĂRGIT accesul. Cu lista albă, orice rol care nu e
// explicit aici cade pe restricția maximă, indiferent de ce spun cele două surse.
const INVOICE_ALL_ROLES: AdminRole[] = ['ADMIN', 'CONTABIL'];

// CITIRE (lista din /piese/fiscal + descărcarea XML-ului UBL): `undefined` = vede toate facturile.
// FAIL-CLOSED: cont inexistent/dezactivat/eroare de DB → rămâne pe facturile proprii, nu pe toate.
export async function invoiceReadFilter(session: Session): Promise<string | undefined> {
  const flags = await accountFlags(session);
  if (!flags) return session.id;
  if (INVOICE_ALL_ROLES.includes(flags.role)) return undefined;
  // Doar rolurile scoped pot fi ridicate punctual; orice alt rol rămâne pe ale lui.
  return sellerScoped(flags.role) && flags.sees_all_invoices ? undefined : session.id;
}

// SCRIERE (marcarea SFS): `sees_all_invoices` NU contează. Doar rolurile care oricum văd tot pot atinge
// facturile altora; restul — inclusiv un rol necunoscut sau nepotrivit — rămân pe ale lor.
export async function invoiceWriteOwner(session: Session): Promise<string | undefined> {
  const flags = await accountFlags(session);
  if (!flags) return session.id;
  return INVOICE_ALL_ROLES.includes(flags.role) ? undefined : session.id;
}

// SURSĂ UNICĂ pentru „câte zile în urmă poate acest CONT să corecteze documente" (migr. 287).
// ADMIN e nelimitat; pentru restul, valoarea din cont (0 = doar ziua curentă).
// FAIL-CLOSED: cont inexistent/dezactivat/eroare de DB → 0 (doar azi), nu fereastra largă.
export async function editWindowDays(session: Session): Promise<number> {
  const flags = await accountFlags(session);
  if (!flags) return 0;
  if (flags.role === 'ADMIN') return Infinity;
  const d = Number(flags.edit_window_days);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

// SURSĂ UNICĂ: rolurile care pot adăuga/edita piese în catalog + locațiile lor (aceleași care fac recepția).
// Folosită ȘI de garda server `requirePartWrite` (part-actions.ts), ȘI de UI (`canEditParts`) — o singură listă,
// ca gardul real și afișarea butonului „Editează" să nu poată diverge.
export const PART_WRITE_ROLES: AdminRole[] = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'];

// Curățarea nomenclatoarelor de producători/mărci (migr. 317). DOAR admin: redenumirea de acolo MUTĂ
// piesele, deci e o modificare în masă a catalogului, nu editarea unui rând.
// Sursă unică: e citită și de garda din server actions, și de lista de taburi din pagină — altfel tabul
// s-ar putea randa pentru un rol care apoi primește „Acces interzis" la fiecare clic.
export const LOOKUP_ADMIN_ROLES: AdminRole[] = ['ADMIN'];
export function canEditParts(role: AdminRole): boolean {
  return PART_WRITE_ROLES.includes(role);
}

// ── Etapa 2: legarea contului de UN depozit ──────────────────────────────────
// Rolurile de depozit care se pot lega de un singur depozit — SURSĂ UNICĂ în piese-roles.ts (importabilă și din client).
export { DEPOT_BOUND_ROLES, SELLER_SCOPED_ROLES } from './piese-roles';

// SURSĂ UNICĂ pentru „de ce depozit ține contul". NULL = TOATE depozitele (ADMIN sau cont cu drepturi extinse).
// Folosită ȘI de dropdown-ul filtrat (ce depozite vede în formular), ȘI de garda de server (unde poate opera),
// ca afișarea și restricția reală să nu poată diverge.
// FAIL-CLOSED: dacă interogarea eșuează, rândul lipsește sau contul e dezactivat (cont închis, dar JWT încă
// valid 24h), NU cădem în „toate depozitele" — ARUNCĂM. Doar `warehouse_id` explicit NULL = toate.
// Rolul se ia din DB, nu din JWT: altfel un ADMIN retrogradat azi ar fi păstrat scrierea pe TOATE depozitele
// până mâine, deși `editWindowDays` (care citește DB-ul) i-ar fi aplicat deja restricția. O singură sursă.
export async function userWarehouseId(session: Session): Promise<number | null> {
  const flags = await accountFlags(session);
  if (!flags) throw new Error('Cont inexistent sau dezactivat');
  if (flags.role === 'ADMIN') return null; // adminul operează pe toate depozitele
  return flags.warehouse_id == null ? null : Number(flags.warehouse_id); // NULL explicit = toate
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
