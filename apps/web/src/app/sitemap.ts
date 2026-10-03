import type { MetadataRoute } from 'next';
import { getRoutePairs, type RoutePair } from '@/lib/route-pages';
import { routePath, SITE_URL, UPCOMING_PAIRS } from '@/lib/seo';

export const revalidate = 3600;

const abs = (path: string) => (path === '/' ? SITE_URL : `${SITE_URL}${path}`);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home: MetadataRoute.Sitemap = [
    { url: abs('/'), changeFrequency: 'daily', priority: 1, alternates: { languages: { ro: abs('/'), ru: abs('/ru') } } },
    { url: abs('/ru'), changeFrequency: 'daily', priority: 1, alternates: { languages: { ro: abs('/'), ru: abs('/ru') } } },
    ...(['confidentialitate', 'cookies', 'conditii-vanzare'] as const).flatMap((p) => [
      { url: abs(`/ro/${p}`), changeFrequency: 'yearly' as const, priority: 0.1 },
      { url: abs(`/ru/${p}`), changeFrequency: 'yearly' as const, priority: 0.1 },
    ]),
  ];

  // Fără bază (build fără env, cădere) sitemap-ul rămâne cu paginile fixe.
  let pairs: RoutePair[] = [];
  try {
    pairs = await getRoutePairs();
  } catch {
    pairs = [];
  }

  // Direcțiile anunțate (Drochia) intră și ele, cât n-au încă orar — ca Google să le știe din timp.
  const known = new Set(pairs.map((p) => `${p.from.slug}-${p.to.slug}`));
  const upcoming = UPCOMING_PAIRS.filter(([a, b]) => !known.has(`${a.slug}-${b.slug}`)).map(([from, to]) => ({ from, to }));

  const routes = [...pairs, ...upcoming].flatMap((p) => {
    const languages = { ro: abs(routePath('ro', p.from.slug, p.to.slug)), ru: abs(routePath('ru', p.from.slug, p.to.slug)) };
    const priority = p.from.slug === 'chisinau' || p.to.slug === 'chisinau' ? 0.8 : 0.6;
    return [
      { url: languages.ro, changeFrequency: 'weekly' as const, priority, alternates: { languages } },
      { url: languages.ru, changeFrequency: 'weekly' as const, priority, alternates: { languages } },
    ];
  });

  return [...home, ...routes];
}
