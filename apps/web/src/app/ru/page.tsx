import type { Metadata } from 'next';
import { HomePage } from '@/components/home-page';
import { HomeJsonLd } from '@/components/home-jsonld';
import PageTracker from '@/components/PageTracker';
import { getRoutePairs, homeLinks } from '@/lib/route-pages';
import { homeMetadata } from '@/lib/seo';
import { getCachedLocalities, getCachedPopularPrices } from '../(public)/actions';
import { homeOptions, homePopular } from '@/lib/home-props';

export const metadata: Metadata = homeMetadata('ru');

// ION-232: prima pagină se regenerează cel mult o dată la 15 min (înainte — la fiecare minut).
// Nu o oră: prețurile populare trec pe tariful zilei la miezul nopții, iar 15 min e întârzierea acceptată.
export const revalidate = 900;

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
      <HomePage locale="ru" options={homeOptions(localities, 'ru')} popular={homePopular(popularPrices, [...links.routes, ...links.localities], 'ru')} routeLinks={links.routes} localityLinks={links.localities} />
    </>
  );
}
