import { HomePage } from '@/components/home-page';
import PageTracker from '@/components/PageTracker';
import { getCachedLocalities, getCachedPopularPrices } from './(public)/actions';

export default async function RootPage() {
  const [localities, popularPrices] = await Promise.all([
    getCachedLocalities(),
    getCachedPopularPrices(),
  ]);
  return (
    <>
      <PageTracker />
      <HomePage locale="ro" localities={localities} popularPrices={popularPrices} />
    </>
  );
}
