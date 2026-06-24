'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { getCountSheet, submitInventory } from '@/lib/piese-ops';

export async function loadSheet(warehouseId: number) {
  requireRole(await verifySession(), 'ADMIN');
  return getCountSheet(warehouseId);
}
export async function saveInventory(warehouseId: number, counts: { part_id: number; counted_qty: number }[]) {
  requireRole(await verifySession(), 'ADMIN');
  return submitInventory(warehouseId, counts);
}
