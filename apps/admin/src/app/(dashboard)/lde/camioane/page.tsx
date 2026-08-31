export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';
import { getDispecerat } from './dispecerat-actions';
import DispeceratClient from './DispeceratClient';

export default async function CamioanePage() {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane')) redirect('/login');
  const { cartonase, azi } = await getDispecerat();
  return <DispeceratClient cartonase={cartonase} azi={azi} />;
}
