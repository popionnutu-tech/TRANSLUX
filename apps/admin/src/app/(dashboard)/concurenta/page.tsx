export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { getConcurentaInit } from './actions';
import ConcurentaClient from './ConcurentaClient';

// Concurența pe direcție (ION-12): cine circulă prin două puncte, din graficul ANTA + cursele noastre.
// Doar ADMIN; celelalte roluri sunt trimise pe pagina lor de start (acțiunile refuză oricum).
export default async function ConcurentaPage() {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') redirect('/');
  const init = await getConcurentaInit();
  return <ConcurentaClient init={init} />;
}
