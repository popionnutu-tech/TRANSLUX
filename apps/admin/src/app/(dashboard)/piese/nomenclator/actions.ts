'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { auditWrite } from '@/lib/audit';
import { LOOKUP_ADMIN_ROLES } from '@/lib/piese-access';
import type { AdminRole } from '@translux/db';
import {
  createWarehouse, updateWarehouse,
  createGroup, updateGroup,
  createSupplier, updateSupplier,
  createClient, updateClient,
  createMechanic, updateMechanic,
  createReason, updateReason,
  listLookupAdmin, renameLookup, setLookupActive, type LookupKind,
} from '@/lib/piese-nomenclator';

// Autorizare centralizată pe secțiune (single source of truth pentru drepturile de editare nomenclator).
type Handler = { roles: AdminRole[]; create: (d: any) => Promise<void>; update: (id: number, d: any) => Promise<void> };
const HANDLERS: Record<string, Handler> = {
  warehouses: { roles: ['ADMIN'], create: createWarehouse, update: updateWarehouse },
  groups: { roles: ['ADMIN', 'DEPOZITAR', 'GESTIONAR'], create: createGroup, update: updateGroup },
  suppliers: { roles: ['ADMIN', 'DEPOZITAR', 'GESTIONAR'], create: createSupplier, update: updateSupplier },
  clients: { roles: ['ADMIN', 'VINZATOR', 'GESTIONAR'], create: createClient, update: updateClient },
  mechanics: { roles: ['ADMIN', 'VINZATOR', 'GESTIONAR'], create: createMechanic, update: updateMechanic },
  reasons: { roles: ['ADMIN', 'VINZATOR', 'GESTIONAR'], create: createReason, update: updateReason },
};

export async function createNomenclator(section: string, data: Record<string, unknown>) {
  const h = HANDLERS[section];
  if (!h) throw new Error('Secțiune invalidă');
  requireRole(await verifySession(), ...h.roles);
  await h.create(data);
  revalidatePath('/piese/nomenclator');
  return { ok: true };
}

export async function updateNomenclator(section: string, id: number, data: Record<string, unknown>) {
  const h = HANDLERS[section];
  if (!h) throw new Error('Secțiune invalidă');
  if (!id || id <= 0) throw new Error('ID invalid');
  requireRole(await verifySession(), ...h.roles);
  await h.update(id, data);
  revalidatePath('/piese/nomenclator');
  return { ok: true };
}

// ── Administrarea nomenclatoarelor de producători / mărci (migr. 317) ──
// Doar ADMIN. Redenumirea MUTĂ piesele — e o operațiune în masă asupra catalogului, nu o editare de rând;
// adăugarea unei valori noi rămâne deschisă tuturor celor care pot scrie o piesă (`addPartLookup`).
// Rolurile vin din `piese-access` — aceeași listă pe care o citește și pagina când decide ce taburi
// randează. Cu două constante separate, tabul s-ar fi putut randa pentru un rol care apoi primea
// „Acces interzis" la fiecare clic: ecran rupt în loc de ecran ascuns.
const KINDS = new Set(['manufacturer', 'carModel']);

function cleanKind(kind: string): LookupKind {
  if (!KINDS.has(kind)) throw new Error('Nomenclator invalid');
  return kind as LookupKind;
}

export async function loadLookupAdmin(kind: string) {
  requireRole(await verifySession(), ...LOOKUP_ADMIN_ROLES);
  return listLookupAdmin(cleanKind(kind));
}

export async function renameLookupEntry(kind: string, id: number, newName: string) {
  const session = requireRole(await verifySession(), ...LOOKUP_ADMIN_ROLES);
  const k = cleanKind(kind);
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Intrare invalidă');
  const r = await renameLookup(k, Number(id), String(newName ?? ''));
  // ÎN AFARA unui try: redenumirea s-a comis deja. Un eșec al urmei n-are voie să raporteze eșec,
  // fiindcă reîncercarea ar redenumi altceva (numele vechi nu mai există).
  await auditWrite({
    adminId: session.id, action: r.merged ? 'MERGE' : 'RENAME', entity: 'piese_lookup',
    subjectId: `${k}:${id}`, before: { denumire: r.old }, after: { denumire: r.next, piese_mutate: r.moved },
  });
  // La contopire se scrie o urmă ȘI pe intrarea SUPRAVIEȚUITOARE: prima are `subjectId` al rândului care
  // tocmai a fost șters, deci cine se întreabă „de ce are TRW brusc 16 piese?" n-ar avea de unde porni.
  if (r.merged && r.targetId != null) {
    await auditWrite({
      adminId: session.id, action: 'MERGE_IN', entity: 'piese_lookup',
      subjectId: `${k}:${r.targetId}`,
      after: { a_absorbit: r.old, piese_primite: r.moved, denumire: r.next },
    });
  }
  revalidatePath('/piese/nomenclator');
  revalidatePath('/piese/stoc');
  return r;
}

export async function toggleLookupActive(kind: string, id: number, active: boolean) {
  const session = requireRole(await verifySession(), ...LOOKUP_ADMIN_ROLES);
  const k = cleanKind(kind);
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Intrare invalidă');
  await setLookupActive(k, Number(id), active === true);
  await auditWrite({
    adminId: session.id, action: active ? 'ACTIVATE' : 'DEACTIVATE', entity: 'piese_lookup',
    subjectId: `${k}:${id}`, after: { activ: active === true },
  });
  revalidatePath('/piese/nomenclator');
  return { ok: true };
}
