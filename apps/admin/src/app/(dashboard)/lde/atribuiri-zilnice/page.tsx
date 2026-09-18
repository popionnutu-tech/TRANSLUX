import { getAtribuiriAdmin, getGhidZilnic } from './actions';
import AtribuiriZilniceClient from './AtribuiriZilniceClient';

export const dynamic = 'force-dynamic';

export default async function AtribuiriZilnicePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const [data, ghid] = await Promise.all([getAtribuiriAdmin(date), getGhidZilnic(date)]);
  return <AtribuiriZilniceClient data={data} ghid={ghid} />;
}
