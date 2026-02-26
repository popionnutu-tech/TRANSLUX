export const dynamic = 'force-dynamic';

import { getTrips, getActiveRoutes } from './actions';
import TripsClient from './TripsClient';

export default async function TripsPage() {
  const [trips, routes] = await Promise.all([getTrips(), getActiveRoutes()]);
  return <TripsClient initialTrips={trips} routes={routes} />;
}
