export const dynamic = 'force-dynamic';

import { getVehicleNorms, getVehicleTypes } from './actions';
import MasiniTipuriClient from './MasiniTipuriClient';

export default async function LdeVehiculePage() {
  const [vehicule, types] = await Promise.all([getVehicleNorms(), getVehicleTypes()]);
  return <MasiniTipuriClient initialVehicule={vehicule} types={types} />;
}
