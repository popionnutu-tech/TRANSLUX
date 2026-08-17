export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { getParc } from './actions';
import ParcClient from './ParcClient';

export default async function ParcPage() {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'UZINE')) redirect('/login');

  const data = await getParc();
  return <ParcClient data={data} />;
}
