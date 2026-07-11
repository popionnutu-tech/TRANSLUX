'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { issueAlert, createIssue } from '@/lib/piese';

export async function checkIssue(warehouseId: number, vehicleId: number | null, partId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar depozitul lui
  return issueAlert(warehouseId, vehicleId, partId);
}

export async function submitIssue(payload: { warehouse_id: number; vehicle_id: number | null; mechanic_id: number | null; breakdown_reason_id: number | null; part_id: number; qty: number }) {
  const session = requireRole(await verifySession(), 'ADMIN', 'VINZATOR', 'GESTIONAR');
  await assertWarehouseAllowed(session, payload.warehouse_id); // Etapa 2: nu poate elibera din alt depozit
  if (!payload.part_id || !payload.qty || payload.qty <= 0) throw new Error('Alege piesa și cantitatea');
  const r = await createIssue(payload);
  return { ok: true, shortages: r.shortages };
}
