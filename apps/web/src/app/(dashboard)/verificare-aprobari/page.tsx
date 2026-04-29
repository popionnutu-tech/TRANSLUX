export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { getPendingSubmissions } from './actions';
import ApprovalsClient from './ApprovalsClient';

export default async function VerificareAprobariPage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/login');

  const submissions = await getPendingSubmissions();

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#9B1B30', margin: '0 0 6px' }}>
        Aprobare verificări orar
      </h1>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 20px' }}>
        Verificări trimise de operatori. Aprobați pentru a aplica modificările
        în orarul real, sau respingeți.
      </p>
      <ApprovalsClient submissions={submissions} />
    </div>
  );
}
