export const dynamic = 'force-dynamic';

import { getCombustibil } from './actions';
import CombustibilClient from './CombustibilClient';

export default async function LdeCombustibilPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const data = await getCombustibil(from, to);
  return <CombustibilClient data={data} />;
}
