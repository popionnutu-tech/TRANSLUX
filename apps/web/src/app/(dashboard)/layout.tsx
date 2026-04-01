import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { verifySession } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  if (!session) redirect('/login');

  return (
    <div className="dashboard" style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      <Sidebar role={session.role} />
      <main style={{
        flex: 1,
        overflowY: 'auto',
        position: 'relative',
        zIndex: 1,
      }}>
        {children}
      </main>
    </div>
  );
}
