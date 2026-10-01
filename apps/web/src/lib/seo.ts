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

/**
 * Celelalte localități active din `localities` (01.10.2026), cu pagină doar spre și dinspre
 * Chișinău (Ion, 01.10: «toate locațiile de la nord spre Chișinău și de la Chișinău spre nord»).
 * Fără opririle care nu sunt localități (Intersecția …, Petrom Rîșcani). Slug-ul poate conține «-».
 */
export const LOCALITIES: readonly MajorLocality[] = [
  { slug: 'badragii-noi', ro: 'Bădragii Noi', ru: 'Новые Бадражи' },
  { slug: 'badragii-vechi', ro: 'Bădragii Vechi', ru: 'Старые Бадражи' },
  { slug: 'banesti', ro: 'Bănești', ru: 'Банешты' },
  { slug: 'beleavinti', ro: 'Beleavinți', ru: 'Белявинцы' },
  { slug: 'bezeda', ro: 'Bezeda', ru: 'Безеда' },
  { slug: 'bilicenii-noi', ro: 'Bilicenii Noi', ru: 'Новые Биличены' },
  { slug: 'bilicenii-vechi', ro: 'Bilicenii Vechi', ru: 'Старые Биличены' },
  { slug: 'birladeni', ro: 'Bîrlădeni', ru: 'Бырладяны' },
  { slug: 'birnova', ro: 'Bîrnova', ru: 'Бырново' },
  { slug: 'bratuseni', ro: 'Brătușeni', ru: 'Братушаны' },
  { slug: 'bratusenii-noi', ro: 'Brătușenii Noi', ru: 'Новые Братушаны' },
  { slug: 'brinzeni', ro: 'Brînzeni', ru: 'Брынзены' },
  { slug: 'caracusenii-noi', ro: 'Caracușenii Noi', ru: 'Новые Каракушаны' },
  { slug: 'caracusenii-vechi', ro: 'Caracușenii Vechi', ru: 'Старые Каракушаны' },
  { slug: 'ciocilteni', ro: 'Ciocîlteni', ru: 'Чокылтяны' },
  { slug: 'colicauti', ro: 'Colicăuți', ru: 'Коликауцы' },
  { slug: 'copaceni', ro: 'Copăceni', ru: 'Копачены' },
  { slug: 'corestauti', ro: 'Corestăuți', ru: 'Корестоуцы' },
  { slug: 'corlateni', ro: 'Corlateni', ru: 'Корлатены' },
  { slug: 'corpaci', ro: 'Corpaci', ru: 'Корпачь' },
  { slug: 'coteala', ro: 'Coteala', ru: 'Котяла' },
  { slug: 'cotiujeni', ro: 'Cotiujeni', ru: 'Котюжены' },
  { slug: 'criva-vama', ro: 'Criva Vama', ru: 'Крива Таможня' },
  { slug: 'cuconestii-noi', ro: 'Cuconeștii Noi', ru: 'Новые Куконешты' },
  { slug: 'dingeni', ro: 'Dîngeni', ru: 'Дынжаны' },
  { slug: 'drepcauti', ro: 'Drepcăuți', ru: 'Дрепкауцы' },
  { slug: 'druta', ro: 'Druța', ru: 'Друца' },
  { slug: 'dumeni', ro: 'Dumeni', ru: 'Думень' },
  { slug: 'duruitoarea-noua', ro: 'Duruitoarea Nouă', ru: 'Новая Дуруитоаря' },
  { slug: 'frunza', ro: 'Frunză', ru: 'Фрунзэ' },
  { slug: 'gordinestii-noi', ro: 'Gordineștii Noi', ru: 'Новые Гординешты' },
  { slug: 'grigorauca', ro: 'Grigorăuca', ru: 'Григоровка' },
  { slug: 'grimancauti', ro: 'Grimăncăuți', ru: 'Гриманкауцы' },
  { slug: 'grimesti', ro: 'Grimești', ru: 'Гримешты' },
  { slug: 'grinauti-raia', ro: 'Grinăuți-Raia', ru: 'Гринауцы-Рая' },
  { slug: 'hadarauti', ro: 'Hădărăuți', ru: 'Ходороуцы' },
  { slug: 'halahora-de-sus', ro: 'Halahora de Sus', ru: 'Верхние Холохоры' },
  { slug: 'hancauti', ro: 'Hancăuți', ru: 'Ганкауцы' },
  { slug: 'hlina', ro: 'Hlina', ru: 'Глинка' },
  { slug: 'hlinaia', ro: 'Hlinaia', ru: 'Глиное' },
  { slug: 'larga', ro: 'Larga', ru: 'Ларга' },
  { slug: 'lencauti', ro: 'Lencăuți', ru: 'Ленкауцы' },
  { slug: 'lopatnic', ro: 'Lopatnic', ru: 'Лопатник' },
  { slug: 'magdacesti', ro: 'Măgdăcești', ru: 'Магдачешты' },
  { slug: 'mereseuca', ro: 'Mereșeuca', ru: 'Мерешовка' },
  { slug: 'mihailenii-noi', ro: 'Mihailenii Noi', ru: 'Новые Михайлены' },
  { slug: 'mihalaseni', ro: 'Mihălășeni', ru: 'Михалашаны' },
  { slug: 'ocnita-sat', ro: 'Ocnița-Sat', ru: 'Окница-Сат' },
  { slug: 'paladea', ro: 'Paladea', ru: 'Паладя' },
  { slug: 'pascani', ro: 'Pașcani', ru: 'Пашканы' },
  { slug: 'pererita', ro: 'Pererita', ru: 'Перерыта' },
  { slug: 'peresecina', ro: 'Peresecina', ru: 'Пересечино' },
  { slug: 'pirjota', ro: 'Pîrjota', ru: 'Пыржота' },
  { slug: 'prepelita', ro: 'Prepelița', ru: 'Препелица' },
  { slug: 'ratus', ro: 'Ratuș', ru: 'Ратуш' },
  { slug: 'recea', ro: 'Recea', ru: 'Реча' },
  { slug: 'ruseni', ro: 'Ruseni', ru: 'Русяны' },
  { slug: 'sirauti', ro: 'Șirăuți', ru: 'Ширеуцы' },
  { slug: 'slobotca', ro: 'Slobotca', ru: 'Слободка' },
  { slug: 'slobozia-sirauti', ro: 'Slobozia Șirăuți', ru: 'Слобозия-Ширеуцы' },
  { slug: 'stauceni', ro: 'Stăuceni', ru: 'Ставчены' },
  { slug: 'tabani', ro: 'Tabani', ru: 'Табаны' },
  { slug: 'tetcani', ro: 'Tețcani', ru: 'Тецканы' },
  { slug: 'tirnova', ro: 'Tîrnova', ru: 'Тырново' },
  { slug: 'trebisauti', ro: 'Trebisăuți', ru: 'Требисоуцы' },
  { slug: 'trinca', ro: 'Trinca', ru: 'Тринка' },
  { slug: 'valcinet', ro: 'Vălcineț', ru: 'Волчинец' },
  { slug: 'varatic', ro: 'Văratic', ru: 'Варатик' },
  { slug: 'viisoara', ro: 'Viișoara', ru: 'Виишоара' },
  { slug: 'zahareuca', ro: 'Zăhăreuca', ru: 'Захареука' },
  { slug: 'zaicani', ro: 'Zaicani', ru: 'Заиканы' },
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
export const UPCOMING: readonly MajorLocality[] = [
  { slug: 'drochia', ro: 'Drochia', ru: 'Дрокия' },
  // Ion, 01.10: «pune și Glodeni – Chișinău … în două direcții, 2 limbi». Nici Glodeni nu are opriri în orar.
  { slug: 'glodeni', ro: 'Glodeni', ru: 'Глодяны' },
];

const CHISINAU = MAJOR[0];
export const UPCOMING_PAIRS: readonly [MajorLocality, MajorLocality][] = UPCOMING.flatMap(
  (u) => [[CHISINAU, u], [u, CHISINAU]] as [MajorLocality, MajorLocality][],
);

/** O localitate cu pagină (majoră sau anunțată) după slug. */
export function pageLocalityBySlug(slug: string): MajorLocality | undefined {
  return BY_SLUG.get(slug) ?? LOCALITIES.find((l) => l.slug === slug) ?? UPCOMING.find((u) => u.slug === slug);
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

const LOCALITY_BY_SLUG = new Map(LOCALITIES.map((l) => [l.slug, l]));
const isHub = (s: string) => (HUB_SLUGS as readonly string[]).includes(s);

/**
 * Perechea are pagină: (a) două localități majore, una hub; (b) Chișinău ↔ o localitate din
 * LOCALITIES; (c) o direcție anunțată (Drochia).
 */
function pairOf(fromSlug: string, toSlug: string): { from: MajorLocality; to: MajorLocality; upcoming: boolean } | null {
  if (fromSlug === toSlug) return null;
  const up = UPCOMING_PAIRS.find(([a, b]) => a.slug === fromSlug && b.slug === toSlug);
  if (up) return { from: up[0], to: up[1], upcoming: true };
  const fromMajor = BY_SLUG.get(fromSlug);
  const toMajor = BY_SLUG.get(toSlug);
  if (fromMajor && toMajor) {
    return isHub(fromSlug) || isHub(toSlug) ? { from: fromMajor, to: toMajor, upcoming: false } : null;
  }
  if (fromSlug === 'chisinau' && LOCALITY_BY_SLUG.has(toSlug)) return { from: fromMajor!, to: LOCALITY_BY_SLUG.get(toSlug)!, upcoming: false };
  if (toSlug === 'chisinau' && LOCALITY_BY_SLUG.has(fromSlug)) return { from: LOCALITY_BY_SLUG.get(fromSlug)!, to: toMajor!, upcoming: false };
  return null;
}

/**
 * «chisinau-briceni», «ocnita-sat-chisinau» → cele două localități, dacă perechea are pagină.
 * Slug-urile pot conține «-», deci se încearcă fiecare tăietură. Se cheamă ÎNAINTE de orice
 * citire din bază: o pereche aleatorie nu ajunge la Supabase.
 */
export function parsePair(pair: string): { from: MajorLocality; to: MajorLocality; upcoming: boolean } | null {
  if (pair.length > 80) return null;
  for (let i = pair.indexOf('-'); i > 0; i = pair.indexOf('-', i + 1)) {
    const found = pairOf(pair.slice(0, i), pair.slice(i + 1));
    if (found) return found;
  }
  return null;
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
