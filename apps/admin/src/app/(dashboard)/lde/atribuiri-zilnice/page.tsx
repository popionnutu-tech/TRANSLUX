import { getAtribuiriAdmin } from './actions';
import AtribuiriZilniceClient from './AtribuiriZilniceClient';

export const dynamic = 'force-dynamic';

export default async function AtribuiriZilnicePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const data = await getAtribuiriAdmin(date);
  return <AtribuiriZilniceClient data={data} />;
}
