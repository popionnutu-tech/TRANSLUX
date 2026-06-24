'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { markSfs } from '@/lib/piese-ops';

export async function sendToSfs(docId: number) {
  requireRole(await verifySession(), 'ADMIN', 'CONTABIL');
  await markSfs(docId);
  return { ok: true };
}
