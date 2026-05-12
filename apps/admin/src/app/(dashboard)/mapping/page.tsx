export const dynamic = 'force-dynamic';

import { getMappings, getCrmRoutes } from './actions';
import MappingClient from './MappingClient';

export default async function MappingPage() {
  const [mappings, crmRoutes] = await Promise.all([getMappings(), getCrmRoutes()]);
  return <MappingClient mappings={mappings} crmRoutes={crmRoutes} />;
}
