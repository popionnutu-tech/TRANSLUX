export const dynamic = 'force-dynamic';

import { getExtraOrders, getDriversForSelect, getSchoolPeriods } from './actions';
import ComenziClient from './ComenziClient';

export default async function ComenziPage() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [orders, drivers, schoolPeriods] = await Promise.all([
    getExtraOrders(month),
    getDriversForSelect(),
    getSchoolPeriods(),
  ]);

  return (
    <ComenziClient
      initialMonth={month}
      initialOrders={orders}
      drivers={drivers}
      initialSchoolPeriods={schoolPeriods}
    />
  );
}
