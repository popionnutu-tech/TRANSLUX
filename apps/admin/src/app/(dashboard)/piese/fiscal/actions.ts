'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { markSfs } from '@/lib/piese-ops';

export async function sendToSfs(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'VINZATOR');
  await markSfs(docId, session.role === 'VINZATOR' ? session.id : undefined);
  return { ok: true };
}
