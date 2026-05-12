export const dynamic = 'force-dynamic';

import { getVehicles } from './actions';
import VehiclesClient from './VehiclesClient';

export default async function VehiclesPage() {
  const vehicles = await getVehicles();
  return <VehiclesClient initialVehicles={vehicles} />;
}
