'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { getCountSheet, submitInventory } from '@/lib/piese-ops';

export async function loadSheet(warehouseId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar depozitul lui
  return getCountSheet(warehouseId);
}
export async function saveInventory(warehouseId: number, counts: { part_id: number; counted_qty: number }[]) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: nu poate inventaria alt depozit
  return submitInventory(warehouseId, counts);
}
