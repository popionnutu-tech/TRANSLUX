import { HomePage } from '@/components/home-page';
import PageTracker from '@/components/PageTracker';
import { getCachedLocalities, getCachedPopularPrices } from '../(public)/actions';

export default async function RuPage() {
  const [localities, popularPrices] = await Promise.all([
    getCachedLocalities(),
    getCachedPopularPrices(),
  ]);
  return (
    <>
      <PageTracker />
      <HomePage locale="ru" localities={localities} popularPrices={popularPrices} />
    </>
  );
}
