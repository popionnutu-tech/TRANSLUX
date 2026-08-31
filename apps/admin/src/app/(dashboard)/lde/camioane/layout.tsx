import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { camioaneTabsForRole } from '@/lib/lde/camioane-nav';
import CamioaneNav from './CamioaneNav';

// Gardianul modulului. Fiecare pagină își reverifică sesiunea separat (tiparul LDE),
// aici doar tăiem accesul rolurilor străine și randăm filele.
export default async function CamioaneLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  if (!session) redirect('/login');
  const tabs = camioaneTabsForRole(session.role);
  if (tabs.length === 0) redirect('/login');

  // Fără container de pagină aici: paginile copil au propriul .page —
  // două containere imbricate dublau padding-ul.
  return (
    <>
      <CamioaneNav tabs={tabs} />
      {children}
    </>
  );
}
