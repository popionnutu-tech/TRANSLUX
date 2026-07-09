'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { createPart, updatePart } from '@/lib/piese-nomenclator';
import { partLabel, getPartById } from '@/lib/piese';

// Cine poate adăuga/edita o piesă în catalog: aceleași roluri care fac recepția (prihod) — depozitar,
// gestionar (depozitar intern), admin. Vânzătorul NU creează piese. Sursă unică de autorizare (server action).
function requirePartWrite() {
  return verifySession().then((s) => { requireRole(s, 'ADMIN', 'DEPOZITAR', 'GESTIONAR'); return s; });
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
