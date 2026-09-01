export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { getFlota } from './actions';
import FlotaClient from './FlotaClient';

export default async function FlotaPage() {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane/flota')) redirect('/login');
  const data = await getFlota();
  return <FlotaClient {...data} />;
}
