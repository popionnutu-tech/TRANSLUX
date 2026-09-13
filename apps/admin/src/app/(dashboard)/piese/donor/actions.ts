'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { assertWarehouseAllowed, userWarehouseId } from '@/lib/piese-access';
import { donorIntake, usedValueHint } from '@/lib/piese-ops';
import { autorFor } from '@/lib/audit';

// Intrarea pieselor б/у e o INTRARE în depozit, deci aceleași roluri ca recepția: depozitar, gestionar, admin.
// Vânzătorul nu bagă marfă în stoc.
const DONOR_ROLES = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'] as const;

// Plafon de sanity, ca la rashod și mutări: RPC-ul ține un lock pe fiecare piesă, într-o singură
// tranzacție, iar lock-ul e pe rândul din CATALOG — deci agnostic de depozit.
const MAX_LINES = 200;

export async function loadUsedHint(partId: number): Promise<number | null> {
  const session = requireRole(await verifySession(), ...DONOR_ROLES);
  // Contul se reconfirmă din BAZĂ, nu doar din token: sugestia e derivată din costul de achiziție, iar
  // `userWarehouseId` aruncă pentru un cont dezactivat. Fără asta, un cont închis azi ar fi putut extrage
  // costuri, piesă cu piesă, până expira token-ul. E memoizat pe cerere, deci nu costă un drum în plus.
  await userWarehouseId(session);
  const id = Number(partId);
  return Number.isInteger(id) && id > 0 ? usedValueHint(id) : null;
}

export async function submitDonor(payload: {
  warehouse_id: number; vehicle_id?: number | null; note?: string | null;
  lines: { part_id: number; qty: number; unit_cost: number }[];
}) {
  const session = requireRole(await verifySession(), ...DONOR_ROLES);
  await assertWarehouseAllowed(session, Number(payload.warehouse_id));

  const lines = (payload.lines || [])
    .map((l) => ({ part_id: Number(l.part_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost) }))
    .filter((l) => l.part_id);
  if (!lines.length) throw new Error('Adaugă cel puțin o piesă.');
  if (lines.length > MAX_LINES) throw new Error(`Prea multe poziții (maxim ${MAX_LINES} pe un document).`);
  // Aceleași praguri ca în RPC, ca o linie acceptată aici să nu fie refuzată acolo.
  if (lines.some((l) => !Number.isInteger(l.part_id))) throw new Error('O piesă selectată nu există în catalog.');
  if (lines.some((l) => !Number.isFinite(l.qty) || l.qty <= 0.0000001)) throw new Error('Cantitatea trebuie să fie mai mare ca 0.');
  // Zero e PERMIS: o piesă fără valoare intră cu zero. Doar negativul și NaN se resping.
  if (lines.some((l) => !Number.isFinite(l.unit_cost) || l.unit_cost < 0)) throw new Error('Valoarea nu poate fi negativă.');

  // Mașina se validează ca întreg pozitiv, nu doar se convertește: `Number(undefined)` dă NaN, care pleacă
  // spre bază ca `null` — aici asta e acceptabil (mașina e opțională), dar un `0` rătăcit ar fi fost refuzat.
  const vid = Number(payload.vehicle_id);
  const vehicle_id = Number.isInteger(vid) && vid > 0 ? vid : null;

  const r = await donorIntake({
    warehouse_id: Number(payload.warehouse_id), vehicle_id,
    note: typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim().slice(0, 500) : null,
    lines,
  }, await autorFor(session.id));

  revalidatePath('/piese/stoc');
  revalidatePath('/piese');
  return r;
}
