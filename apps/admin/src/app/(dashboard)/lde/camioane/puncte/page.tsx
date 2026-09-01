export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { getLocuriPropuse, getPuncte } from './actions';
import PuncteClient from './PuncteClient';

export default async function PunctePage() {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane/puncte')) redirect('/login');
  const [data, locuri] = await Promise.all([getPuncte(), getLocuriPropuse()]);
  return <PuncteClient data={data} locuri={locuri} />;
}
