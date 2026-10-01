import type { Metadata } from 'next';
import { HomePage } from '@/components/home-page';
import { HomeJsonLd } from '@/components/home-jsonld';
import PageTracker from '@/components/PageTracker';
import { getRoutePairs, homeLinks } from '@/lib/route-pages';
import { homeMetadata } from '@/lib/seo';
import { getCachedLocalities, getCachedPopularPrices } from '../(public)/actions';

export const metadata: Metadata = homeMetadata('ru');

export default async function RuPage() {
  const [localities, popularPrices, pairs] = await Promise.all([
    getCachedLocalities(),
    getCachedPopularPrices(),
    // Fără bază, pagina se randează fără linkurile spre rute (niciun link rupt) — ION-153.
    getRoutePairs().catch(() => []),
  ]);
  const links = homeLinks(pairs, 'ru');
  return (
    <>
      <PageTracker />
      <HomeJsonLd locale="ru" />
      <HomePage locale="ru" localities={localities} popularPrices={popularPrices} routeLinks={links.routes} localityLinks={links.localities} />
    </>
  );
}
