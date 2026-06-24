export const dynamic = 'force-dynamic';

import { getVehicleNorms, getVehicleTypes } from './actions';
import VehiculeClient from './VehiculeClient';

export default async function LdeVehiculePage() {
  const [vehicule, types] = await Promise.all([getVehicleNorms(), getVehicleTypes()]);
  return <VehiculeClient initialVehicule={vehicule} types={types} />;
}
