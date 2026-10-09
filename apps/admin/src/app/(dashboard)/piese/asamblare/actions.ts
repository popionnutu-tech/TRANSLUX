'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { autorFor } from '@/lib/audit';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import {
  deschideAsamblare, adaugaComponenta, inchideAsamblare, anuleazaAsamblare,
  asamblariInLucru, componenteAsamblare,
} from '@/lib/piese-asamblare';

// Cine poate asambla: aceleași roluri ca la Donor. Operația creează marfă în stoc — e singura din modul,
// pe lângă Donor, cu proprietatea asta. Vânzătorul nu, el vinde.
const ASAMBLARE_ROLES = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'] as const;

const RPC_ERR: Record<string, string> = {
  BAD_WAREHOUSE: 'Alege depozitul din care se iau piesele și cel în care intră produsul.',
  BAD_PART: 'Piesa aleasă nu există sau nu mai e activă.',
  BAD_QTY: 'Cantitate invalidă.',
  BAD_COST: 'Manopera trebuie să fie un număr pozitiv (sau zero).',
  NO_LINES: 'Nu poți închide o asamblare fără nicio componentă.',
  NO_DOC: 'Asamblarea nu există.',
  DOC_INCHIS: 'Asamblarea e deja închisă sau anulată.',
  PRODUS_IN_COMPONENTE: 'Produsul nu poate fi și componentă a lui însuși.',
};

const traduce = (e: any) => {
  const m = (e?.message || '').trim();
  if (m.includes('SHORTAGE')) {
    return new Error('Nu ajunge marfa în depozit. Dacă o iei totuși — bifează „continuă cu minus".');
  }
  return new Error(RPC_ERR[m] || 'Operația n-a reușit. Reîncearcă.');
};

export async function deschide(p: {
  whSursa: number; whDest: number; produsId: number; produsQty: number;
  mechanicId?: number | null; note?: string | null;
}) {
  const session = requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  // AMBELE depozite trec prin gardă: și cel din care se scoate, și cel în care intră produsul.
  await assertWarehouseAllowed(session, Number(p.whSursa));
  await assertWarehouseAllowed(session, Number(p.whDest));
  if (!p.produsId) throw new Error('Alege piesa care rezultă din asamblare.');
  try {
    const id = await deschideAsamblare({
      whSursa: Number(p.whSursa), whDest: Number(p.whDest),
      produsId: Number(p.produsId), produsQty: Number(p.produsQty) || 1,
      mechanicId: p.mechanicId ? Number(p.mechanicId) : null,
      note: (p.note || '').trim() || null,
    }, await autorFor(session.id));
    revalidatePath('/piese/asamblare');
    return { ok: true as const, docId: id };
  } catch (e) { throw traduce(e); }
}

export async function adauga(docId: number, partId: number, qty: number, pesteStoc = false) {
  const session = requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  if (!partId || !(Number(qty) > 0)) throw new Error('Alege piesa și pune o cantitate.');
  try {
    const r = await adaugaComponenta(Number(docId), Number(partId), Number(qty), !!pesteStoc, await autorFor(session.id));
    revalidatePath('/piese/asamblare'); revalidatePath('/piese/stoc');
    return { ok: true as const, ...r };
  } catch (e) { throw traduce(e); }
}

export async function inchide(docId: number, manopera: number | string | null) {
  const session = requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  const m = manopera === '' || manopera == null ? 0 : Number(manopera);
  if (!Number.isFinite(m) || m < 0) throw new Error('Manopera trebuie să fie un număr pozitiv (sau zero).');
  try {
    const r = await inchideAsamblare(Number(docId), m, await autorFor(session.id));
    revalidatePath('/piese/asamblare'); revalidatePath('/piese/stoc');
    return { ok: true as const, ...r };
  } catch (e) { throw traduce(e); }
}

export async function anuleaza(docId: number) {
  const session = requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  try {
    const r = await anuleazaAsamblare(Number(docId), await autorFor(session.id));
    revalidatePath('/piese/asamblare'); revalidatePath('/piese/stoc');
    return { ok: true as const, ...r };
  } catch (e) { throw traduce(e); }
}

export async function incarcaInLucru() {
  requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  return asamblariInLucru();
}

export async function incarcaComponente(docId: number) {
  requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  return componenteAsamblare(Number(docId));
}
