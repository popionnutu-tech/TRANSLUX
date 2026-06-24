export const dynamic = 'force-dynamic';

import { getVehicles } from './actions';
import { getDirectionOptions } from '@/lib/directions';
import VehiclesClient from './VehiclesClient';

export default async function VehiclesPage() {
  const [vehicles, directionOptions] = await Promise.all([getVehicles(), getDirectionOptions()]);
  return <VehiclesClient initialVehicles={vehicles} directionOptions={directionOptions} />;
}
