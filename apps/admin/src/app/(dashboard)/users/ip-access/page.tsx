import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { listIpsByRole, getMyCurrentIp } from './actions';
import { IpAccessClient } from './IpAccessClient';

export default async function IpAccessPage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/');

  const [rulesByRole, myIp] = await Promise.all([
    listIpsByRole(),
    getMyCurrentIp(),
  ]);

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontStyle: 'italic', color: '#9B1B30', marginBottom: 8 }}>
        Acces IP — Roluri de oficiu
      </h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
        Aici controlezi de la ce adrese IP pot intra angajații care lucrează doar din oficiu.
        Dacă lista pentru un rol e <strong>goală</strong> — fără restricție (orice IP).
        Dacă lista are cel puțin un IP — <strong>doar acele IP-uri</strong> sunt permise.
      </p>

      <IpAccessClient initialRulesByRole={rulesByRole} myIp={myIp} />
    </div>
  );
}
