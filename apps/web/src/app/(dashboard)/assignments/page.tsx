export const dynamic = 'force-dynamic';

import { getActiveDrivers, getActiveVehicles } from './actions';
import AssignmentsClient from './AssignmentsClient';

export default async function AssignmentsPage() {
  const [drivers, vehicles] = await Promise.all([
    getActiveDrivers(),
    getActiveVehicles(),
  ]);

  return <AssignmentsClient drivers={drivers} vehicles={vehicles} />;
}
