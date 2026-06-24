'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { issueAlert, createIssue } from '@/lib/piese';

export async function checkIssue(warehouseId: number, vehicleId: number | null, partId: number) {
  requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR');
  return issueAlert(warehouseId, vehicleId, partId);
}

export async function submitIssue(payload: { warehouse_id: number; vehicle_id: number | null; mechanic_id: number | null; breakdown_reason_id: number | null; part_id: number; qty: number }) {
  requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR');
  if (!payload.part_id || !payload.qty || payload.qty <= 0) throw new Error('Alege piesa și cantitatea');
  const r = await createIssue(payload);
  return { ok: true, shortages: r.shortages };
}
