import type { Locale } from '@/lib/i18n';

/**
 * SEO pentru translux.md (ION-153): adresa canonică, localitățile cu pagină de direcție,
 * căile paginilor și redirectul adreselor vechi transportlux.com/…/search/<de>/<spre>.
 *
 * Fișier pur, fără bază: îl importă și middleware-ul (edge). Lista MAJOR = localitățile
 * `is_major` din `localities` (30.09.2026); numele rusești sunt cele din `localities.name_ru`.
 * O localitate nouă devine pagină abia după ce e adăugată aici.
 */

export const SITE_URL = 'https://translux.md';

export interface MajorLocality {
  slug: string;
  ro: string;
  ru: string;
}

export const MAJOR: readonly MajorLocality[] = [
  { slug: 'chisinau', ro: 'Chișinău', ru: 'Кишинёв' },
  { slug: 'balti', ro: 'Bălți', ru: 'Бельцы' },
  { slug: 'orhei', ro: 'Orhei', ru: 'Орхей' },
  { slug: 'singerei', ro: 'Sîngerei', ru: 'Сынжерей' },
  { slug: 'edinet', ro: 'Edineț', ru: 'Единец' },
  { slug: 'otaci', ro: 'Otaci', ru: 'Атаки' },
  { slug: 'briceni', ro: 'Briceni', ru: 'Бричаны' },
  { slug: 'ocnita', ro: 'Ocnița', ru: 'Окница' },
  { slug: 'lipcani', ro: 'Lipcani', ru: 'Липканы' },
  { slug: 'criva', ro: 'Criva', ru: 'Крива' },
  { slug: 'corjeuti', ro: 'Corjeuți', ru: 'Коржеуцы' },
  { slug: 'riscani', ro: 'Rîșcani', ru: 'Рышканы' },
  { slug: 'cupcini', ro: 'Cupcini', ru: 'Купчинь' },
];

/** Paginile de direcție există doar pentru perechile în care una din localități e hub. */
export const HUB_SLUGS = ['chisinau', 'balti'] as const;

const BY_SLUG = new Map(MAJOR.map((m) => [m.slug, m]));

/**
 * Direcții anunțate, încă fără curse în orar. Ion, 01.10.2026: Drochia «facem pagina pentru
 * viitor, dar fără rute». Pagina spune că orarul apare când pornesc cursele — nu inventează ore.
 * Când opririle Drochiei apar în crm_stop_fares, pagina arată singură orarul real; atunci
 * Drochia se mută în MAJOR (cu `is_major` în localities) și iese de aici.
 */
export const UPCOMING: readonly MajorLocality[] = [{ slug: 'drochia', ro: 'Drochia', ru: 'Дрокия' }];

const CHISINAU = MAJOR[0];
export const UPCOMING_PAIRS: readonly [MajorLocality, MajorLocality][] = UPCOMING.flatMap(
  (u) => [[CHISINAU, u], [u, CHISINAU]] as [MajorLocality, MajorLocality][],
);

/** O localitate cu pagină (majoră sau anunțată) după slug. */
export function pageLocalityBySlug(slug: string): MajorLocality | undefined {
  return BY_SLUG.get(slug) ?? UPCOMING.find((u) => u.slug === slug);
}

export function majorBySlug(slug: string): MajorLocality | undefined {
  return BY_SLUG.get(slug);
}

export function majorByNameRo(nameRo: string): MajorLocality | undefined {
  const s = slugify(nameRo);
  return BY_SLUG.get(s);
}

/** «Chișinău», «Chişinău» (sedilă), «CHIȘINĂU» → «chisinau». */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Pagina principală: RO stă la «/» (adresa indexată), RU la «/ru». */
export function homePath(locale: Locale): string {
  return locale === 'ru' ? '/ru' : '/';
}

export function routePath(locale: Locale, fromSlug: string, toSlug: string): string {
  return locale === 'ru' ? `/ru/avtobus/${fromSlug}-${toSlug}` : `/ro/autobuz/${fromSlug}-${toSlug}`;
}

/**
 * «chisinau-briceni» → cele două localități, dacă ambele sunt majore, diferite și una e hub.
 * Se cheamă ÎNAINTE de orice citire din bază: o pereche aleatorie nu ajunge la Supabase.
 */
export function parsePair(pair: string): { from: MajorLocality; to: MajorLocality; upcoming: boolean } | null {
  const parts = pair.split('-');
  if (parts.length !== 2) return null;
  const up = UPCOMING_PAIRS.find(([a, b]) => a.slug === parts[0] && b.slug === parts[1]);
  if (up) return { from: up[0], to: up[1], upcoming: true };
  const from = BY_SLUG.get(parts[0]);
  const to = BY_SLUG.get(parts[1]);
  if (!from || !to || from.slug === to.slug) return null;
  const isHub = (s: string) => (HUB_SLUGS as readonly string[]).includes(s);
  if (!isHub(from.slug) && !isHub(to.slug)) return null;
  return { from, to, upcoming: false };
}

/**
 * Ținta unei adrese vechi `/<lang>/search/<de>/<spre>` (transportlux.com, încă în Google).
 * Părțile vin brute din URL; o codare stricată nu are voie să dea 500 — merge pe pagina principală.
 */
export function legacySearchTarget(lang: Locale, rawFrom: string, rawTo: string): string {
  let from: string;
  let to: string;
  try {
    from = slugify(decodeURIComponent(rawFrom));
    to = slugify(decodeURIComponent(rawTo));
  } catch {
    return homePath(lang);
  }
  const pair = parsePair(`${from}-${to}`);
  return pair ? routePath(lang, pair.from.slug, pair.to.slug) : homePath(lang);
}

/** JSON-LD sigur în <script>: `<` escapat, ca un nume din bază să nu poată închide tag-ul. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const HOME_META = {
  ro: {
    title: 'TRANSLUX — autobuze Chișinău – Bălți – nordul Moldovei',
    description:
      'Autobuze TRANSLUX între Chișinău, Bălți, Edineț, Briceni, Lipcani, Criva, Ocnița și Otaci: orar, prețuri, șoferul și telefonul cursei. Vezi cursa de acum sau alege data.',
  },
  ru: {
    title: 'TRANSLUX — автобусы Кишинёв – Бельцы – север Молдовы',
    description:
      'Автобусы TRANSLUX: Кишинёв, Бельцы, Единец, Бричаны, Липканы, Крива, Окница и Атаки — расписание, цены, водитель и телефон рейса. Рейс прямо сейчас или на выбранную дату.',
  },
} as const;

/** Metadatele paginii principale; `/ro` e aceeași pagină ca `/`, deci canonical-ul ei e `/`. */
export function homeMetadata(locale: Locale) {
  const m = HOME_META[locale];
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: {
      canonical: homePath(locale),
      languages: { ro: '/', ru: '/ru', 'x-default': '/' },
    },
    openGraph: {
      title: m.title,
      description: m.description,
      url: homePath(locale),
      siteName: 'TRANSLUX',
      locale: locale === 'ru' ? 'ru_MD' : 'ro_MD',
      type: 'website' as const,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TRANSLUX' }],
    },
  };
}
