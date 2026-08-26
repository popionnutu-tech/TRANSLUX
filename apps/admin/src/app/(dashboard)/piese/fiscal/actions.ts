'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { markSfs } from '@/lib/piese-ops';
import { invoiceWriteOwner } from '@/lib/piese-access';

export async function sendToSfs(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'VINZATOR', 'GESTIONAR');
  // Scriere, NU citire: `sees_all_invoices` nu dă dreptul de a marca SFS facturile altora (vezi piese-access.ts).
  await markSfs(docId, await invoiceWriteOwner(session));
  return { ok: true };
}
