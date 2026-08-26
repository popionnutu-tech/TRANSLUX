'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { DEPOT_BOUND_ROLES, SELLER_SCOPED_ROLES, MAX_EDIT_WINDOW_DAYS, EDIT_WINDOW_ROLES } from '@/lib/piese-roles';
import type { User, UserRole, InviteToken, PointEnum, AdminRole } from '@translux/db';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// ── Users ────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('users')
    .select('*')
    .order('role')
    .order('username');
  return (data || []) as User[];
}

export async function updateUserRole(id: string, role: UserRole) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase()
    .from('users')
    .update({ role })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function updateUserPoint(id: string, point: PointEnum | null) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase()
    .from('users')
    .update({ point })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function toggleUser(id: string, active: boolean) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  await getSupabase().from('users').update({ active }).eq('id', id);
  revalidatePath('/users');
}

export async function deleteUser(id: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  const { error } = await getSupabase().from('users').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

// ── Admin Accounts ──────────────────────────────────

export interface AdminAccountInfo {
  id: string;
  email: string;
  role: string;
  name: string | null;
  warehouse_id: number | null; // Etapa 2 (Piese): depozitul de care e legat contul; null = toate
  edit_window_days: number;    // migr. 287: zile în urmă în care poate corecta documente (0 = doar azi)
  sees_all_invoices: boolean;  // migr. 287: vede toate facturile în e-Factura, nu doar ale lui
}

export async function getAdminAccounts(): Promise<AdminAccountInfo[]> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') return [];
  const { data } = await getSupabase()
    .from('admin_accounts')
    .select('id, email, role, name, warehouse_id, edit_window_days, sees_all_invoices')
    .order('role')
    .order('email');
  return (data || []) as AdminAccountInfo[];
}

// Etapa 2: leagă (sau dezleagă) un cont de un depozit. Doar ADMIN. warehouseId=null → toate depozitele.
export async function updateAdminWarehouse(id: string, warehouseId: number | null): Promise<void> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') throw new Error('Acces interzis');
  const db = getSupabase();
  // Defense-in-depth: doar rolurile de depozit (DEPOT_BOUND_ROLES) pot fi legate; pentru celelalte, warehouse_id nu are efect
  // (userWarehouseId le tratează oricum ca „toate"), deci refuzăm setarea ca să nu rămână date derutante în DB.
  const { data: acc } = await db.from('admin_accounts').select('role').eq('id', id).maybeSingle();
  if (!acc) throw new Error('Cont inexistent');
  const isBound = DEPOT_BOUND_ROLES.includes((acc as { role: AdminRole }).role);
  const value = warehouseId == null || Number.isNaN(Number(warehouseId)) ? null : Number(warehouseId);
  if (value != null && !isBound) throw new Error('Doar conturile de depozit pot fi legate de un depozit');
  const { error } = await db.from('admin_accounts').update({ warehouse_id: value }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

const VALID_ADMIN_ROLES = ['ADMIN', 'DISPATCHER', 'GRAFIC', 'UZINE', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER', 'GESTIONAR'];

// Schimbă rolul unui cont administrativ (ex. acces lărgit pe durata testării, apoi restrâns). Doar ADMIN.
// ATENȚIE: rolul e purtat de JWT-ul de sesiune (24h, vezi lib/auth.ts) — contul afectat trebuie să se
// re-autentifice ca noul rol să intre în vigoare; până atunci middleware-ul îl vede tot cu rolul vechi.
export async function updateAdminRole(id: string, role: string): Promise<void> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') throw new Error('Acces interzis');
  if (!VALID_ADMIN_ROLES.includes(role)) throw new Error('Rol invalid');

  const db = getSupabase();
  const { data: acc } = await db.from('admin_accounts').select('role').eq('id', id).maybeSingle();
  if (!acc) throw new Error('Cont inexistent');
  const current = (acc as { role: AdminRole }).role;
  if (current === role) return;

  // Nu lăsăm sistemul fără administrator (acoperă și auto-retrogradarea propriului cont).
  if (current === 'ADMIN') {
    const { count } = await db
      .from('admin_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN')
      .eq('active', true);
    if ((count ?? 0) <= 1) throw new Error('Nu poți schimba rolul ultimului administrator');
  }

  // Legarea de depozit are sens doar pentru DEPOT_BOUND_ROLES. La ieșirea din ele curățăm warehouse_id,
  // ca să nu rămână în DB o valoare fără efect (userWarehouseId o ignoră oricum) dar derutantă la citire.
  const patch: { role: string; warehouse_id?: null; sees_all_invoices?: false; edit_window_days?: 0 } = { role };
  if (!DEPOT_BOUND_ROLES.includes(role as AdminRole)) patch.warehouse_id = null;
  // Migr. 282: drepturile fine se resetează NECONDIȚIONAT la orice schimbare de rol.
  // Nu doar când rolul-țintă e nepotrivit — altfel traseul GESTIONAR(30 zile) → CONTABIL → GESTIONAR
  // readuce fereastra intactă, fără ca cineva s-o rebifeze. Un drept acordat punctual, pentru un rol anume,
  // nu supraviețuiește rolului pentru care a fost dat; adminul îl reacordă explicit dacă mai e nevoie.
  patch.sees_all_invoices = false;
  patch.edit_window_days = 0;


  const { error } = await db.from('admin_accounts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

// Migr. 282 — fereastra de corecție a documentelor, PER CONT. Doar ADMIN.
// Lărgirea e punctuală (un om, pe durata implementării), nu o slăbire a rolului pentru toți cei care îl poartă.
// Plafon 0..MAX_EDIT_WINDOW_DAYS, oglindind constrângerea din DB (admin_accounts_edit_window_days_ck), ca UI-ul să dea
// un mesaj clar în loc să lase baza să arunce.
export async function updateAdminEditWindow(id: string, days: number): Promise<void> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') throw new Error('Acces interzis');
  const d = Math.trunc(Number(days));
  if (!Number.isFinite(d) || d < 0 || d > MAX_EDIT_WINDOW_DAYS) throw new Error(`Fereastra trebuie să fie între 0 și ${MAX_EDIT_WINDOW_DAYS} de zile`);
  const db = getSupabase();
  const { data: acc } = await db.from('admin_accounts').select('role').eq('id', id).maybeSingle();
  if (!acc) throw new Error('Cont inexistent'); // altfel UPDATE-ul pe 0 rânduri ar raporta fals „salvat"
  // Ca la depozit și la vizibilitatea facturilor: refuzăm setarea pe un rol unde n-are efect, ca să nu rămână
  // în DB o stare latentă care s-ar activa la o viitoare rotație de rol. Doar rolurile care chiar corectează
  // recepții (RECEIPT_ROLES din prihod/actions.ts, fără ADMIN care e nelimitat prin cod) au fereastră.
  const accRole = (acc as { role: AdminRole }).role;
  if (d > 0 && !EDIT_WINDOW_ROLES.includes(accRole)) throw new Error('Doar depozitarul și gestionarul corectează recepții; pentru restul fereastra n-are efect');
  const { error } = await db.from('admin_accounts').update({ edit_window_days: d }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

// Migr. 282 — vizibilitatea facturilor în e-Factura, PER CONT. Doar ADMIN.
// Contează doar pentru rolurile scoped pe seller (VINZATOR/GESTIONAR); ADMIN și CONTABIL văd oricum toate.
export async function updateAdminInvoiceVisibility(id: string, seesAll: boolean): Promise<void> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') throw new Error('Acces interzis');
  const db = getSupabase();
  const { data: acc } = await db.from('admin_accounts').select('role').eq('id', id).maybeSingle();
  if (!acc) throw new Error('Cont inexistent');
  // Ca la depozit: refuzăm setarea pe un rol unde n-are efect, ca să nu rămână în DB o stare latentă
  // care s-ar activa la o viitoare schimbare de rol.
  const isScoped = SELLER_SCOPED_ROLES.includes((acc as { role: AdminRole }).role);
  if (seesAll && !isScoped) throw new Error('Doar vânzătorul și gestionarul sunt limitați la facturile lor; pentru restul nu are efect');
  const { error } = await db.from('admin_accounts').update({ sees_all_invoices: !!seesAll }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/users');
}

export async function createAdminAccount(email: string, password: string, role: string): Promise<void> {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') throw new Error('Acces interzis');

  email = (email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email invalid');
  if (!password || password.length < 6) throw new Error('Parola trebuie să aibă minim 6 caractere');
  if (!VALID_ADMIN_ROLES.includes(role)) throw new Error('Rol invalid');

  const db = getSupabase();
  const { data: existing } = await db.from('admin_accounts').select('id').eq('email', email).maybeSingle();
  if (existing) throw new Error('Există deja un cont cu acest email');

  const password_hash = await bcrypt.hash(password, 12);
  const { error } = await db.from('admin_accounts').insert({ email, password_hash, role, active: true });
  if (error) throw new Error(error.message);

  revalidatePath('/users');
}

// ── Invites ──────────────────────────────────────────

export interface InviteWithAdmin extends InviteToken {
  admin_accounts?: { email: string };
  users?: { telegram_id: number; username: string } | null;
}

export async function getInvites(): Promise<InviteWithAdmin[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('invite_tokens')
    .select('*, admin_accounts:created_by(email), users:used_by_user(telegram_id, username)')
    .order('created_at', { ascending: false });
  return (data || []) as InviteWithAdmin[];
}

export async function createInvite(point: PointEnum): Promise<{ token: string; botLink: string }> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');

  const token = crypto.randomBytes(24).toString('base64url');

  const { error } = await getSupabase().from('invite_tokens').insert({
    token,
    role: 'CONTROLLER',
    point,
    created_by: session.id,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) throw new Error(error.message);

  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxBot';
  const botLink = `https://t.me/${botUsername}?start=${token}`;

  revalidatePath('/users');
  return { token, botLink };
}

export async function deleteInvite(token: string) {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');
  if (session.role !== 'ADMIN') throw new Error('Acces interzis');
  await getSupabase().from('invite_tokens').delete().eq('token', token);
  revalidatePath('/users');
}
