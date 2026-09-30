import type { Metadata } from 'next';
import { HomePage } from '@/components/home-page';
import { HomeJsonLd } from '@/components/home-jsonld';
import PageTracker from '@/components/PageTracker';
import { getRoutePairs } from '@/lib/route-pages';
import { homeMetadata, routePath } from '@/lib/seo';
import { getCachedLocalities, getCachedPopularPrices } from '../(public)/actions';

export const metadata: Metadata = homeMetadata('ru');

export default async function RuPage() {
  const [localities, popularPrices, pairs] = await Promise.all([
    getCachedLocalities(),
    getCachedPopularPrices(),
    // Fără bază, pagina se randează fără linkurile spre rute (niciun link rupt) — ION-153.
    getRoutePairs().catch(() => []),
  ]);
  const routeLinks = pairs.map((p) => ({
    key: `${p.from.slug}-${p.to.slug}`,
    href: routePath('ru', p.from.slug, p.to.slug),
    label: `${p.from.ru} – ${p.to.ru}`,
  }));
  return (
    <>
      <PageTracker />
      <HomeJsonLd locale="ru" />
      <HomePage locale="ru" localities={localities} popularPrices={popularPrices} routeLinks={routeLinks} />
    </>
  );
}
