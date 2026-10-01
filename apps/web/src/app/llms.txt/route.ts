import { OPERATOR } from '@/components/legal/legal-content';
import { getRoutePairs, type RoutePair } from '@/lib/route-pages';
import { routePath, SITE_URL, UPCOMING_PAIRS } from '@/lib/seo';

/**
 * /llms.txt (ION-153): rezumatul site-ului pentru asistenții AI (ChatGPT, Perplexity, Gemini,
 * Claude) — cine e TRANSLUX, cum se ajunge la el și unde e orarul fiecărei direcții.
 * Doar fapte din bază și din legal-content; orele și prețurile stau pe paginile de direcție.
 */
export const revalidate = 3600;

const line = (p: RoutePair) =>
  `- [${p.from.ro} – ${p.to.ro}](${SITE_URL}${routePath('ro', p.from.slug, p.to.slug)}) · [${p.from.ru} – ${p.to.ru}](${SITE_URL}${routePath('ru', p.from.slug, p.to.slug)}) — ${p.trips} ${p.trips === 1 ? 'cursă' : 'curse'}/zi`;

export async function GET() {
  let pairs: RoutePair[] = [];
  try {
    pairs = await getRoutePairs();
  } catch {
    pairs = [];
  }
  const isMain = (p: RoutePair) => p.from.slug === 'chisinau' || p.to.slug === 'chisinau' || p.from.slug === 'balti' || p.to.slug === 'balti';
  const fromChisinau = pairs.filter((p) => p.from.slug === 'chisinau');
  const toChisinau = pairs.filter((p) => p.to.slug === 'chisinau');
  const balti = pairs.filter((p) => isMain(p) && p.from.slug !== 'chisinau' && p.to.slug !== 'chisinau');

  const body = `# TRANSLUX

> TRANSLUX este o companie de transport de pasageri din Republica Moldova: curse zilnice de autobuz între Chișinău și nordul Moldovei (Orhei, Sîngerei, Bălți, Rîșcani, Cupcini, Edineț, Briceni, Lipcani, Criva, Ocnița, Otaci) și satele de pe traseu. Site: ${SITE_URL} (română), ${SITE_URL}/ru (русский).

TRANSLUX — пассажирские автобусные перевозки в Молдове: ежедневные рейсы между Кишинёвом и севером Молдовы (Орхей, Сынжерей, Бельцы, Рышканы, Единец, Бричаны, Липканы, Крива, Окница, Атаки) и сёлами по маршруту.

- Telefon / телефон: +373 60 401 010 (informații / справки)
- Operator: ${OPERATOR.name}, IDNO ${OPERATOR.idno}, ${OPERATOR.address}
- E-mail: ${OPERATOR.email}
- Facebook: https://www.facebook.com/TRANSPORTLUX · TikTok: https://www.tiktok.com/@translux.md

## Cum afli cursa / Как узнать рейс

- Orarul și prețul fiecărei direcții sunt pe paginile de mai jos (se actualizează din oră în oră).
- Pe ${SITE_URL} alegi direcția și apeși «Acum» (cursele care pleacă acum, cu autobuzul pe hartă) sau «Mai târziu» (alegi data și vezi cursele, cu numele și telefonul șoferului).
- Prețul biletului se calculează după kilometri, cu tariful săptămânii; pagina fiecărei direcții arată prețul de azi.

## Din Chișinău / Из Кишинёва

${fromChisinau.map(line).join('\n')}

## Spre Chișinău / В Кишинёв

${toChisinau.map(line).join('\n')}

## Prin Bălți / Через Бельцы

${balti.map(line).join('\n')}

## În curând / Скоро

${UPCOMING_PAIRS.map(([a, b]) => `- ${a.ro} – ${b.ro} (${a.ru} – ${b.ru}): TRANSLUX pregătește curse, orarul încă nu există — ${SITE_URL}${routePath('ro', a.slug, b.slug)}`).join('\n')}

## Optional

- [Sitemap](${SITE_URL}/sitemap.xml)
- [Politica de confidențialitate](${SITE_URL}/ro/confidentialitate)
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
