'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { createPart, updatePart, setPartLocation } from '@/lib/piese-nomenclator';
import { partLabel, getPartById, getPartLocation, partLabelInfo } from '@/lib/piese';
import { PART_WRITE_ROLES, assertWarehouseAllowed, userWarehouseId } from '@/lib/piese-access';

// Cine poate adăuga/edita o piesă în catalog: aceleași roluri care fac recepția (prihod) — depozitar,
// gestionar (depozitar intern), admin. Vânzătorul NU creează piese. Sursă unică de autorizare (server action).
function requirePartWrite() {
  return verifySession().then((s) => requireRole(s, ...PART_WRITE_ROLES)); // requireRole întoarce Session (non-null) sau aruncă
}

// Creează sau actualizează o piesă. Întoarce id + eticheta bogată ca apelantul (Prihod) s-o poată
// selecta imediat, fără un apel suplimentar de căutare. Piesa pornește cu stoc 0.
export async function savePart(data: Record<string, unknown>, id?: number): Promise<{ id: number; label: string }> {
  await requirePartWrite();
  let partId: number;
  if (id && id > 0) { await updatePart(id, data); partId = id; }
  else { partId = (await createPart(data)).id; }
  revalidatePath('/piese/catalog');
  revalidatePath('/piese/nomenclator');
  return { id: partId, label: partLabel(data) };
}

// Câmpurile editabile ale unei piese, pentru prefill în formularul de editare.
export async function loadPart(id: number): Promise<Record<string, unknown> | null> {
  await requirePartWrite();
  if (!id || id <= 0) return null;
  return (await getPartById(id)) as Record<string, unknown> | null;
}

// Locația piesei într-un depozit (SECȚIE-RAFT-POLIȚĂ + stoc minim) — pentru editarea din Catalog.
export async function loadPartLocation(partId: number, warehouseId: number): Promise<{ location_label: string; min_qty: number } | null> {
  const session = await requirePartWrite();
  if (!partId || !warehouseId) return null;
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: doar locațiile depozitului lui
  return (await getPartLocation(partId, warehouseId)) as { location_label: string; min_qty: number } | null;
}

export async function savePartLocation(partId: number, warehouseId: number, data: { location_label?: string; min_qty?: number | string }): Promise<{ ok: true }> {
  const session = await requirePartWrite();
  await assertWarehouseAllowed(session, warehouseId); // Etapa 2: nu poate seta locația/min în alt depozit
  await setPartLocation(partId, warehouseId, data);
  revalidatePath('/piese/harta');
  revalidatePath('/piese/stoc');
  return { ok: true };
}

// Datele etichetei de tipărit (denumire, marcă, cod, stoc, preț) — citire pentru orice rol al modulului Piese.
// Stocul e din depozitul contului (sau total pentru admin/cont fără depozit). NU expune costul de achiziție.
export async function partLabelData(partId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'DEPOZITAR', 'VINZATOR', 'CONTABIL', 'MANAGER', 'GESTIONAR');
  if (!partId || partId <= 0) return null;
  return partLabelInfo(partId, await userWarehouseId(session));
}
