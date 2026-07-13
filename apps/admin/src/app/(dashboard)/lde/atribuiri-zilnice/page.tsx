import { getAtribuiriAdmin } from './actions';
import AtribuiriZilniceClient from './AtribuiriZilniceClient';

export const dynamic = 'force-dynamic';

export default async function AtribuiriZilnicePage({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  const data = await getAtribuiriAdmin(searchParams?.date);
  return <AtribuiriZilniceClient data={data} />;
}
