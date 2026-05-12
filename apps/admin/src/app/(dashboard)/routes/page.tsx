export const dynamic = 'force-dynamic';

import { getRoutes } from './actions';
import RoutesClient from './RoutesClient';

export default async function RoutesPage() {
  const routes = await getRoutes();
  return <RoutesClient initialRoutes={routes} />;
}
