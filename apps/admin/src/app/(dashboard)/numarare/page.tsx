import { verifySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import NumararePageClient from './NumararePageClient';

export const metadata = { title: 'Numărare pasageri — TRANSLUX' };
export const dynamic = 'force-dynamic';

export default async function NumararePage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  return <NumararePageClient role={session.role} />;
}
