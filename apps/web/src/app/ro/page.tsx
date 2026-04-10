import { HomePage } from '@/components/home-page';
import PageTracker from '@/components/PageTracker';
import { getLocalities, getPopularPrices } from '../(public)/actions';

export const dynamic = 'force-dynamic';

export default async function RoPage() {
  const [localities, popularPrices] = await Promise.all([
    getLocalities(),
    getPopularPrices(),
  ]);
  return (
    <>
      <PageTracker />
      <HomePage locale="ro" localities={localities} popularPrices={popularPrices} />
    </>
  );
}
