'use server';

import { revalidatePath } from 'next/cache';
import { verifySession, requireRole } from '@/lib/auth';
import { PART_WRITE_ROLES } from '@/lib/piese-access';
import { dubluriCatalog, unesteDubluri, ignoraDublura } from '@/lib/piese-nomenclator';
import { autorFor } from '@/lib/audit';

// Aceleași roluri ca la crearea unei piese: cine n-are voie s-o facă n-are voie nici s-o desființeze.
const poate = () => verifySession().then((s) => requireRole(s, ...PART_WRITE_ROLES));

export async function incarcaDubluri() {
  await poate();
  return dubluriCatalog(200);
}

export async function uneste(keep: number, drop: number[]) {
  const session = await poate();
  const ids = Array.from(new Set((drop || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  if (!ids.length) throw new Error('Alege cel puțin o piesă de desființat.');
  const r = await unesteDubluri(Number(keep), ids, await autorFor(session.id));
  // Catalogul și căutarea arată piese active — după unire, cele desființate trebuie să dispară de acolo.
  revalidatePath('/piese/catalog');
  revalidatePath('/piese/cautare');
  return r;
}

// „Sunt piese diferite" — grupul iese din listă, piesele rămân neatinse.
export async function marcheazaDiferite(cheie: string, motiv?: string) {
  const session = await poate();
  await ignoraDublura(String(cheie), motiv || null, await autorFor(session.id));
}
