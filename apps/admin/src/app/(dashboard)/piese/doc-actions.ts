'use server';

import { verifySession, requireRole } from '@/lib/auth';
import { canSeeCost, assertWarehouseAllowed, userWarehouseId } from '@/lib/piese-access';
import { docLines, docWarehouses } from '@/lib/piese';

// Poziţiile ORICĂRUI document din tabloul de bord (prihod, rashod, vânzare, mutare, inventar…).
//
// `docId` vine de la client, deci acţiunea NU se poate baza pe faptul că e unul dintre cele 8 documente
// afişate: fără gardă, un cont legat de un depozit ar putea enumera 1..N și citi istoricul altui depozit.
// Aceeaşi regulă ca `loadReceiptLines`: rezolvăm depozitul documentului și îl trecem prin gardă,
// fail-closed pe document inexistent.
//
// Costul se filtrează pe SERVER (canSeeCost), nu în interfaţă — service-role trece peste RLS.
export async function loadDocLines(docId: number) {
  const session = requireRole(await verifySession(), 'ADMIN', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER', 'GESTIONAR');
  const wh = await docWarehouses(Number(docId));
  if (!wh) throw new Error('Document inexistent');
  // La mutare, documentul „aparţine" ambelor capete: contul legat de oricare dintre ele are dreptul să-l vadă.
  const bound = await userWarehouseId(session);
  if (bound != null && bound !== wh.from && bound !== wh.to) {
    throw new Error('Nu ai acces la acest document (e al altui depozit)');
  }
  if (bound == null) await assertWarehouseAllowed(session, wh.from); // conturile nelegate: gardă inertă, păstrată explicit
  return docLines(Number(docId), canSeeCost(session.role));
}
