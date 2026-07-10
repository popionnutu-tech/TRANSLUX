export const dynamic = 'force-dynamic';

import { getKmZilnic } from './actions';
import KmZilnicClient from './KmZilnicClient';

export default async function LdeKmZilnicPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const data = await getKmZilnic(date);
  return <KmZilnicClient data={data} />;
}
