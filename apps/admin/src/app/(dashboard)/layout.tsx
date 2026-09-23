import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import CommandPalette from '@/components/CommandPalette';
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
      {/* ⌘K din orice pagină: 72 de pagini nu se găsesc derulând un meniu de 65 de rânduri. */}
      <CommandPalette role={session.role} />
    </div>
  );
}
