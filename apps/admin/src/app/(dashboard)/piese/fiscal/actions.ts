'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { markSfs } from '@/lib/piese-ops';
import { sellerScoped } from '@/lib/piese-access';

export async function sendToSfs(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'VINZATOR', 'GESTIONAR');
  await markSfs(docId, sellerScoped(session.role) ? session.id : undefined);
  return { ok: true };
}
