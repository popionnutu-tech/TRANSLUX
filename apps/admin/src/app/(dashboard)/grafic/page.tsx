export const dynamic = 'force-dynamic';

import { verifySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getActiveDrivers, getActiveVehicles, getReturRouteOptions, getAssignmentDates } from './actions';
import GraficClient from './GraficClient';

export default async function GraficPage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN' && session.role !== 'GRAFIC' && session.role !== 'DISPATCHER') redirect('/login');

  const readOnly = session.role === 'GRAFIC';

  const [drivers, vehicles, returRoutes, dates] = await Promise.all([
    getActiveDrivers(),
    getActiveVehicles(),
    getReturRouteOptions(),
    getAssignmentDates(),
  ]);

  return (
    <GraficClient
      drivers={drivers}
      vehicles={vehicles}
      returRoutes={returRoutes}
      dates={dates}
      readOnly={readOnly}
      role={session.role}
    />
  );
}
