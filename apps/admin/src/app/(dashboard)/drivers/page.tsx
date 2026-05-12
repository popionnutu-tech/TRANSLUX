export const dynamic = 'force-dynamic';

import { getDrivers } from './actions';
import DriversClient from './DriversClient';

export default async function DriversPage() {
  const drivers = await getDrivers();
  return <DriversClient initialDrivers={drivers} />;
}
