'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { getCountSheet, submitInventory } from '@/lib/piese-ops';

export async function loadSheet(warehouseId: number) {
  requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR');
  return getCountSheet(warehouseId);
}
export async function saveInventory(warehouseId: number, counts: { part_id: number; counted_qty: number }[]) {
  requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'GESTIONAR');
  return submitInventory(warehouseId, counts);
}
