'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import type { AdminRole } from '@translux/db';
import {
  createWarehouse, updateWarehouse,
  createGroup, updateGroup,
  createSupplier, updateSupplier,
  createClient, updateClient,
  createMechanic, updateMechanic,
  createReason, updateReason,
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
