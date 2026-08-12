export const dynamic = 'force-dynamic';

import { verifySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUzineTabs, getSaptamana } from './actions';
import GraficUzineClient from './GraficUzineClient';

export default async function GraficUzinePage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN' && session.role !== 'UZINE') redirect('/login');

  const uzine = await getUzineTabs();
  const first = uzine[0]?.id ?? null;
  const initial = first ? await getSaptamana(first) : null;

  return <GraficUzineClient uzine={uzine} initialUzina={first} initial={initial} />;
}
