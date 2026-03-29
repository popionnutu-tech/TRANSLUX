import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard" style={{ display: 'flex', height: '100vh', position: 'relative' }}>
      <Sidebar />
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
