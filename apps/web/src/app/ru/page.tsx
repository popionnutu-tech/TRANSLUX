import { HomePage } from '@/components/home-page';
import { getLocalities, getActiveOffers } from '../(public)/actions';

export const dynamic = 'force-dynamic';

export default async function RuPage() {
  const [localities, offers] = await Promise.all([getLocalities(), getActiveOffers()]);
  return <HomePage locale="ru" localities={localities} offers={offers} />;
}
