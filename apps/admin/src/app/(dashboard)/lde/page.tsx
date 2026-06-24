export const dynamic = 'force-dynamic';

import { getLdeOverview } from './actions';
import LdeOverviewClient from './LdeOverviewClient';

export default async function LdePage() {
  const data = await getLdeOverview();
  return <LdeOverviewClient data={data} />;
}
