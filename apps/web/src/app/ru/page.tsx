import { HomePage } from '@/components/home-page';
import PageTracker from '@/components/PageTracker';
import { getLocalities, getPopularPrices } from '../(public)/actions';

export const dynamic = 'force-dynamic';

export default async function RuPage() {
  const [localities, popularPrices] = await Promise.all([
    getLocalities(),
    getPopularPrices(),
  ]);
  return (
    <>
      <PageTracker />
      <HomePage locale="ru" localities={localities} popularPrices={popularPrices} />
    </>
  );
}
