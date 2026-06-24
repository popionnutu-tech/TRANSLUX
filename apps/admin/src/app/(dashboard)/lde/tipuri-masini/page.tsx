export const dynamic = 'force-dynamic';

import { getVehicleTypes } from './actions';
import TipuriMasiniClient from './TipuriMasiniClient';

export default async function TipuriMasiniPage() {
  const types = await getVehicleTypes();
  return <TipuriMasiniClient initialTypes={types} />;
}
