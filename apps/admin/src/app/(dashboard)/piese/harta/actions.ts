'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { locatePart, groupPlacements } from '@/lib/piese';

export async function locate(warehouseId: number, code: string) {
  // Doar căutare/citire (localizează piesa pe hartă) — permis și CONTABIL.
  requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER', 'GESTIONAR');
  return locatePart(warehouseId, code);
}

// Unde stă o grupă întreagă în depozit (pentru evidențierea pe hartă). Doar citire, aceleași roluri.
export async function locateGroup(warehouseId: number, groupId: number) {
  requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER', 'GESTIONAR');
  return groupPlacements(Number(warehouseId), Number(groupId));
}
