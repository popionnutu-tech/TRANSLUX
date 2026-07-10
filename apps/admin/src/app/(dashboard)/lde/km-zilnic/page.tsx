export const dynamic = 'force-dynamic';

import { getKmPerioada } from './actions';
import KmZilnicClient from './KmZilnicClient';

export default async function LdeKmZilnicPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const data = await getKmPerioada(from, to);
  return <KmZilnicClient data={data} />;
}
