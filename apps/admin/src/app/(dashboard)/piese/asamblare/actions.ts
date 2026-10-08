'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { autorFor } from '@/lib/audit';
import { assertWarehouseAllowed } from '@/lib/piese-access';
import { creeazaAsamblare, type ComponentaAsamblare } from '@/lib/piese-asamblare';

// Cine poate asambla: aceleași roluri ca la Donor. Operația CREEAZĂ marfă în stoc — e singura din modul,
// pe lângă Donor, cu proprietatea asta. Vânzătorul nu, el vinde.
const ASAMBLARE_ROLES = ['ADMIN', 'DEPOZITAR', 'GESTIONAR'] as const;

const RPC_ERR: Record<string, string> = {
  BAD_WAREHOUSE: 'Alege depozitul din care se iau piesele și cel în care intră produsul.',
  BAD_PART: 'Piesa aleasă nu există sau nu mai e activă.',
  BAD_QTY: 'Cantitate invalidă.',
  BAD_COST: 'Manopera trebuie să fie un număr pozitiv (sau zero).',
  NO_LINES: 'Adaugă cel puțin o componentă.',
  PRODUS_IN_COMPONENTE: 'Produsul nu poate fi și componentă a lui însuși.',
};

export async function trimiteAsamblare(p: {
  whSursa: number; whDest: number; produsId: number; produsQty: number;
  mechanicId?: number | null; manopera?: number | string | null; note?: string | null;
  componente: ComponentaAsamblare[];
}) {
  const session = requireRole(await verifySession(), ...ASAMBLARE_ROLES);
  // AMBELE depozite trec prin gardă: un cont legat de un depozit n-are voie nici să scoată din altul,
  // nici să bage în altul. A doua verificare e cea ușor de uitat — produsul intră acolo.
  await assertWarehouseAllowed(session, Number(p.whSursa));
  await assertWarehouseAllowed(session, Number(p.whDest));

  const componente = (p.componente || [])
    .filter((c) => c.part_id && Number(c.qty) > 0)
    .map((c) => ({ part_id: Number(c.part_id), qty: Number(c.qty) }));
  if (!componente.length) throw new Error('Adaugă cel puțin o componentă.');
  if (!p.produsId) throw new Error('Alege piesa care rezultă din asamblare.');

  const manopera = p.manopera === '' || p.manopera == null ? 0 : Number(p.manopera);
  if (!Number.isFinite(manopera) || manopera < 0) throw new Error('Manopera trebuie să fie un număr pozitiv (sau zero).');

  try {
    const r = await creeazaAsamblare({
      whSursa: Number(p.whSursa), whDest: Number(p.whDest),
      produsId: Number(p.produsId), produsQty: Number(p.produsQty) || 1,
      mechanicId: p.mechanicId ? Number(p.mechanicId) : null,
      manopera, note: (p.note || '').trim() || null,
      componente, userId: null,
    }, await autorFor(session.id));
    revalidatePath('/piese/asamblare');
    revalidatePath('/piese/stoc');
    return { ok: true as const, ...r };
  } catch (e: any) {
    const msg = (e?.message || '').trim();
    // `SHORTAGE` nu e o eroare tehnică: nu s-a scris nimic, iar omul trebuie să vadă ce lipsește.
    // Spre deosebire de eliberări, aici NU există „peste stoc": nu poți construi din piese pe care nu
    // le ai în mână, iar o asamblare peste stoc n-ar încurca o cantitate, ar inventa valoare.
    if (msg.includes('SHORTAGE')) {
      throw new Error('Nu ajung componentele în depozitul-sursă. Verifică stocul — la asamblare nu se poate lucra peste stoc.');
    }
    throw new Error(RPC_ERR[msg] || 'Nu am putut salva asamblarea. Reîncearcă.');
  }
}
