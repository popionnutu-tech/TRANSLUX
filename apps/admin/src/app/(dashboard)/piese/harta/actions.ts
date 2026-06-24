'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { locatePart } from '@/lib/piese';

export async function locate(warehouseId: number, code: string) {
  // Doar căutare/citire (localizează piesa pe hartă) — permis și CONTABIL.
  requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'DEPOZITAR', 'MANAGER');
  return locatePart(warehouseId, code);
}
