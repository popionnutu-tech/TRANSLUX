export const dynamic = 'force-dynamic';

import { getOffers, getLocalities } from './actions';
import OffersClient from './OffersClient';

export default async function OffersPage() {
  const [offers, localities] = await Promise.all([
    getOffers(),
    getLocalities(),
  ]);

  return <OffersClient initialOffers={offers} localities={localities} />;
}
