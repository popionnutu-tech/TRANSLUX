import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import { verifySession } from '@/lib/auth';
import { checkRoleIpAccess } from '@/lib/ip-access';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession();
  if (!session) redirect('/login');

  const ipCheck = await checkRoleIpAccess(session.role);
  if (!ipCheck.allowed) {
    redirect('/access-denied');
  }

  return (
    <div className="dashboard" style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      <Sidebar role={session.role} />
      <main style={{
        flex: 1,
        overflowY: 'auto',
        position: 'relative',
        zIndex: 1,
      }}>
        <ToastProvider>{children}</ToastProvider>
      </main>
    </div>
  );
}
