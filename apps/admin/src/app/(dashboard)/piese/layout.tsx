export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import PieseNav from './PieseNav';
import './piese.css';

export default async function PieseLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  const ALLOWED: typeof session.role[] = ['ADMIN', 'CONTABIL', 'DEPOZITAR', 'MANAGER'];
  if (!session || !ALLOWED.includes(session.role)) redirect('/');
  return (
    <div className="piese-scope">
      <PieseNav role={session.role} />
      {children}
    </div>
  );
}
