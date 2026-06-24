export const dynamic = 'force-dynamic';

import {
  getCashFuel,
  getCashCountByVehicle,
  getVehiclesForSelect,
  getDriversForSelect,
} from './actions';
import NumerarClient from './NumerarClient';

export default async function NumerarPage() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [rows, counts, vehicles, drivers] = await Promise.all([
    getCashFuel(month),
    getCashCountByVehicle(month),
    getVehiclesForSelect(),
    getDriversForSelect(),
  ]);

  return (
    <NumerarClient
      initialMonth={month}
      initialRows={rows}
      initialCounts={counts}
      vehicles={vehicles}
      drivers={drivers}
    />
  );
}
