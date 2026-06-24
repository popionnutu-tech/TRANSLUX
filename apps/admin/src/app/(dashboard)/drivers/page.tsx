export const dynamic = 'force-dynamic';

import { getDrivers } from './actions';
import { getDirectionOptions } from '@/lib/directions';
import DriversClient from './DriversClient';

export default async function DriversPage() {
  const [drivers, directionOptions] = await Promise.all([getDrivers(), getDirectionOptions()]);
  return <DriversClient initialDrivers={drivers} directionOptions={directionOptions} />;
}
