export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { getParc } from './actions';
import ParcClient from './ParcClient';
import { getLdeSoferi, getLdeUzine } from './_soferi/actions';
import LdeSoferiClient from './_soferi/LdeSoferiClient';

export default async function ParcPage() {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'UZINE')) redirect('/login');

  // Datele de șofer (uzina, categoria de salariu, parcarea — fosta «Șoferi LDE») sunt doar
  // pentru ADMIN (Ion, 24.09, ION-54); rolul UZINE vede Parcul ca până acum.
  const admin = session.role === 'ADMIN';
  const [data, soferi, uzine] = await Promise.all([
    getParc(),
    admin ? getLdeSoferi() : Promise.resolve(null),
    admin ? getLdeUzine() : Promise.resolve(null),
  ]);
  return (
    <>
      <ParcClient data={data} />
      {admin && soferi && uzine && <LdeSoferiClient initialSoferi={soferi} uzine={uzine} />}
    </>
  );
}
