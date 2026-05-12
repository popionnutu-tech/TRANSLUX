import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';

export default async function RootPage() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  switch (session.role) {
    case 'GRAFIC':
    case 'DISPATCHER':
      redirect('/grafic');
    case 'OPERATOR_CAMERE':
    case 'ADMIN_CAMERE':
    case 'EVALUATOR_INCASARI':
      redirect('/numarare');
    default:
      redirect('/grafic');
  }
}
