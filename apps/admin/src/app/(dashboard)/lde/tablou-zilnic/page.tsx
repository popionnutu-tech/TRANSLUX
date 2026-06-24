export const dynamic = 'force-dynamic';

import { getOwnerDaily } from './actions';
import OwnerDailyClient from './OwnerDailyClient';

export default async function LdeTablouZilnicPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const data = await getOwnerDaily(date);
  return <OwnerDailyClient data={data} />;
}
