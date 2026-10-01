import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { OPERATOR } from '@/components/legal/legal-content';
import { getRoutePairs, getRouteTimetable, type RouteTimetable } from '@/lib/route-pages';
import { homePath, jsonLd, majorBySlug, parsePair, routePath, SITE_URL, type MajorLocality } from '@/lib/seo';

/**
 * Pagina de direcție (ION-153): «Autobuz Chișinău – Briceni: orar și preț».
 * Răspunde căutărilor din Google de tipul «autobuz Chișinău Briceni orar» /
 * «расписание автобусов Кишинёв Бричаны» cu orarul planificat și prețul de azi.
 * Cursa pe o dată anume, cu șoferul și telefonul, rămâne în căutarea de pe pagina principală.
 */

/** «1 cursă», «5 curse», «20 de curse». */
function roCurse(n: number): string {
  if (n === 1) return 'o cursă';
  const rest = n % 100;
  return rest === 0 || rest >= 20 ? `${n} de curse` : `${n} curse`;
}

/** «1 рейс», «3 рейса», «5 рейсов», «21 рейс». */
function ruReis(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return `${n} рейс`;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} рейса`;
  return `${n} рейсов`;
}

const T = {
  ro: {
    title: (a: string, b: string) => `Autobuz ${a} – ${b}: orar și preț`,
    lead: (a: string, b: string, n: number, first: string, last: string) =>
      n === 1
        ? `TRANSLUX are o cursă pe zi de la ${a} la ${b}, cu plecare la ${first}.`
        : `TRANSLUX are ${roCurse(n)} pe zi de la ${a} la ${b}: prima pleacă la ${first}, ultima la ${last}.`,
    duration: (d: string) => ` Drumul durează în jur de ${d}.`,
    price: (p: number) => ` Prețul biletului: de la ${p} lei (tariful de azi).`,
    offer: ' Pe această direcție e o ofertă activă.',
    table: 'Orarul curselor',
    dep: 'Plecare', arr: 'Sosire', dur: 'Durata', via: 'Cursa',
    cta: 'Vezi cursele pe o dată (cu șoferul și telefonul)',
    phone: 'Informații la telefon',
    note: 'Orarul se poate schimba în zilele de sărbătoare. Cursa exactă pe data aleasă, cu șoferul, telefonul și numărul mașinii, o vezi la căutare.',
    back: 'Retur',
    other: (hub: string) => `Alte direcții din ${hub}`,
    home: 'Pagina principală',
    crumbs: 'TRANSLUX',
    h: 'h', min: 'min',
    soonTitle: (a: string, b: string) => `Autobuz ${a} – ${b}`,
    soonLead: (a: string, b: string) => `TRANSLUX pregătește curse pe direcția ${a} – ${b}. Orarul și prețurile apar pe această pagină imediat ce cursele pornesc. Informații la telefon.`,
    soonDesc: (a: string, b: string) => `Autobuz ${a} – ${b}: TRANSLUX pregătește curse pe această direcție. Orarul apare aici, informații la +373 60 401 010.`,
    soonNear: 'Cea mai apropiată direcție cu curse chiar acum:',
    soonTrips: (n: number) => `${roCurse(n)} pe zi`,
    desc: (a: string, b: string, n: number, first: string, last: string, price: number | null) =>
      `Autobuz ${a} – ${b}: ${roCurse(n)} pe zi, ${n === 1 ? `plecare la ${first}` : `plecări între ${first} și ${last}`}${price ? `, bilet de la ${price} lei` : ''}. Orar actual, șoferul și telefonul cursei — TRANSLUX.`,
  },
  ru: {
    title: (a: string, b: string) => `Автобус ${a} – ${b}: расписание и цена`,
    lead: (a: string, b: string, n: number, first: string, last: string) =>
      n === 1
        ? `TRANSLUX, направление ${a} – ${b}: один рейс в день, отправление в ${first}.`
        : `TRANSLUX, направление ${a} – ${b}: ${ruReis(n)} в день, первый отправляется в ${first}, последний в ${last}.`,
    duration: (d: string) => ` В пути около ${d}.`,
    price: (p: number) => ` Цена билета: от ${p} лей (тариф на сегодня).`,
    offer: ' На этом направлении действует акция.',
    table: 'Расписание рейсов',
    dep: 'Отправление', arr: 'Прибытие', dur: 'В пути', via: 'Рейс',
    cta: 'Рейсы на выбранную дату (с водителем и телефоном)',
    phone: 'Справки по телефону',
    note: 'В праздничные дни расписание может меняться. Точный рейс на выбранную дату, с водителем, телефоном и номером машины, смотрите в поиске.',
    back: 'Обратно',
    other: (hub: string) => `Другие направления: ${hub}`,
    home: 'Главная',
    crumbs: 'TRANSLUX',
    h: 'ч', min: 'мин',
    soonTitle: (a: string, b: string) => `Автобус ${a} – ${b}`,
    soonLead: (a: string, b: string) => `TRANSLUX готовит рейсы по направлению ${a} – ${b}. Расписание и цены появятся на этой странице, как только рейсы начнут выполняться. Уточнить можно по телефону.`,
    soonDesc: (a: string, b: string) => `Автобус ${a} – ${b}: TRANSLUX готовит рейсы по этому направлению. Расписание появится здесь, справки по телефону +373 60 401 010.`,
    soonNear: 'Ближайшее направление с рейсами уже сейчас:',
    soonTrips: (n: number) => `${ruReis(n)} в день`,
    desc: (a: string, b: string, n: number, first: string, last: string, price: number | null) =>
      `Автобус ${a} – ${b}: ${ruReis(n)} в день, ${n === 1 ? `отправление в ${first}` : `отправления с ${first} до ${last}`}${price ? `, билет от ${price} лей` : ''}. Актуальное расписание, водитель и телефон рейса — TRANSLUX.`,
  },
} as const;

const nameOf = (l: MajorLocality, locale: Locale) => (locale === 'ru' ? l.ru : l.ro);

function fmtMinutes(m: number, locale: Locale): string {
  const t = T[locale];
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm} ${t.min}`;
  return mm ? `${h} ${t.h} ${mm} ${t.min}` : `${h} ${t.h}`;
}

/** Durata tipică: mediana duratelor de segment cunoscute. */
function typicalMinutes(tt: RouteTimetable): number | null {
  const d = tt.trips.map((t) => t.segmentMinutes).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : null;
}

type Loaded =
  | { kind: 'timetable'; tt: RouteTimetable }
  /** Direcție anunțată (Drochia), încă fără curse în orar. */
  | { kind: 'soon'; from: MajorLocality; to: MajorLocality };

/** Validează perechea pe lista statică ÎNAINTE de orice citire din bază. */
async function load(pair: string): Promise<Loaded> {
  const parsed = parsePair(pair);
  if (!parsed) notFound();
  const tt = await getRouteTimetable(parsed.from.slug, parsed.to.slug);
  if (tt && tt.trips.length > 0) return { kind: 'timetable', tt };
  if (parsed.upcoming) return { kind: 'soon', from: parsed.from, to: parsed.to };
  notFound();
}

function pageAlternates(locale: Locale, from: MajorLocality, to: MajorLocality) {
  return {
    canonical: routePath(locale, from.slug, to.slug),
    languages: {
      ro: routePath('ro', from.slug, to.slug),
      ru: routePath('ru', from.slug, to.slug),
      'x-default': routePath('ro', from.slug, to.slug),
    },
  };
}

export async function routeMetadata(pair: string, locale: Locale): Promise<Metadata> {
  // notFound() din load() vine și aici: metadatele se rezolvă înaintea corpului (blocant pentru roboți), deci statusul rămâne 404.
  const loaded = await load(pair);
  const t = T[locale];
  const from = loaded.kind === 'timetable' ? loaded.tt.from : loaded.from;
  const to = loaded.kind === 'timetable' ? loaded.tt.to : loaded.to;
  const a = nameOf(from, locale);
  const b = nameOf(to, locale);
  let title: string;
  let description: string;
  if (loaded.kind === 'timetable') {
    const tt = loaded.tt;
    title = t.title(a, b);
    description = t.desc(a, b, tt.trips.length, tt.trips[0].time, tt.trips[tt.trips.length - 1].time, tt.priceFrom);
  } else {
    title = t.soonTitle(a, b);
    description = t.soonDesc(a, b);
  }
  return {
    title,
    description,
    alternates: pageAlternates(locale, from, to),
    openGraph: {
      title,
      description,
      url: routePath(locale, from.slug, to.slug),
      siteName: 'TRANSLUX',
      locale: locale === 'ru' ? 'ru_MD' : 'ro_MD',
      type: 'website',
      images: ['/og.png'],
    },
  };
}

function PageHeader({ locale, from, to }: { locale: Locale; from: MajorLocality; to: MajorLocality }) {
  const otherLocale: Locale = locale === 'ro' ? 'ru' : 'ro';
  return (
    <header className="site-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 40px' }}>
      <a href={homePath(locale)} aria-label="TRANSLUX">
        <span style={{
          display: 'inline-block', height: 30, aspectRatio: '1318/192',
          backgroundColor: '#9B1B30',
          WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
          maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
        }} />
      </a>
      <a href={routePath(otherLocale, from.slug, to.slug)} className="legal-lang" hrefLang={otherLocale}>
        {otherLocale.toUpperCase()}
      </a>
    </header>
  );
}

function breadcrumbs(locale: Locale, from: MajorLocality, to: MajorLocality) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: T[locale].crumbs, item: `${SITE_URL}${homePath(locale) === '/' ? '' : homePath(locale)}` },
      { '@type': 'ListItem', position: 2, name: `${nameOf(from, locale)} – ${nameOf(to, locale)}`, item: `${SITE_URL}${routePath(locale, from.slug, to.slug)}` },
    ],
  };
}

/**
 * Direcția anunțată, fără curse încă (Ion, 01.10: Drochia «pentru viitor, dar fără rute»).
 * Nu inventează ore: spune că orarul apare aici și trimite la cea mai apropiată direcție reală.
 */
async function SoonPage({ locale, from, to }: { locale: Locale; from: MajorLocality; to: MajorLocality }) {
  const t = T[locale];
  const a = nameOf(from, locale);
  const b = nameOf(to, locale);
  const pairs = await getRoutePairs().catch(() => []);
  // Drochia e lângă Bălți: cea mai apropiată direcție reală e Chișinău ↔ Bălți, în același sens.
  const near = pairs.find((p) =>
    from.slug === 'chisinau' ? p.from.slug === 'chisinau' && p.to.slug === 'balti' : p.from.slug === 'balti' && p.to.slug === 'chisinau',
  );
  return (
    <div className="legal-page" lang={locale}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs(locale, from, to)) }} />
      <PageHeader locale={locale} from={from} to={to} />
      <main className="legal-main route-main">
        <nav className="route-crumbs" aria-label="breadcrumb">
          <a href={homePath(locale)}>{t.home}</a> / <span>{a} – {b}</span>
        </nav>
        <h1>{t.soonTitle(a, b)}</h1>
        <p className="legal-intro">{t.soonLead(a, b)}</p>
        {near && (
          <p>
            {t.soonNear}{' '}
            <a className="route-phone" style={{ fontSize: 15 }} href={routePath(locale, near.from.slug, near.to.slug)}>
              {nameOf(near.from, locale)} – {nameOf(near.to, locale)}
            </a>{' '}
            ({t.soonTrips(near.trips)})
          </p>
        )}
        <h2>{t.phone}</h2>
        <p><a className="route-phone" href={OPERATOR.phoneHref}>+373 60 401 010</a></p>
        <nav className="legal-nav route-links">
          <a href={routePath(locale, to.slug, from.slug)}>{t.back}: {b} – {a}</a>
          <a href={homePath(locale)}>{t.home}</a>
        </nav>
      </main>
    </div>
  );
}

export async function RoutePage({ pair, locale }: { pair: string; locale: Locale }) {
  const loaded = await load(pair);
  if (loaded.kind === 'soon') return <SoonPage locale={locale} from={loaded.from} to={loaded.to} />;
  const tt = loaded.tt;
  // Lista perechilor doar pentru linkurile «alte direcții»; o eroare aici nu strică pagina.
  const pairs = await getRoutePairs().catch(() => []);
  const t = T[locale];
  const a = nameOf(tt.from, locale);
  const b = nameOf(tt.to, locale);
  const n = tt.trips.length;
  const first = tt.trips[0].time;
  const last = tt.trips[n - 1].time;
  const typical = typicalMinutes(tt);

  const hasReturn = pairs.some((p) => p.from.slug === tt.to.slug && p.to.slug === tt.from.slug);
  // «Alte direcții»: din același hub spre orașele principale (satele sunt în sitemap și pe pagina principală).
  const hub = ['chisinau', 'balti'].includes(tt.from.slug) ? tt.from : tt.to;
  const others = pairs.filter((p) =>
    p.from.slug === hub.slug && !!majorBySlug(p.to.slug) && !(p.from.slug === tt.from.slug && p.to.slug === tt.to.slug),
  );

  const lead =
    t.lead(a, b, n, first, last) +
    (typical ? t.duration(fmtMinutes(typical, locale)) : '') +
    (tt.priceFrom ? t.price(tt.priceFrom) : '') +
    (tt.offerPrice ? t.offer : '');

  const crumbs = breadcrumbs(locale, tt.from, tt.to);
  const searchHref = `${homePath(locale)}?dela=${tt.from.slug}&spre=${tt.to.slug}`;

  return (
    <div className="legal-page" lang={locale}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbs) }} />
      <PageHeader locale={locale} from={tt.from} to={tt.to} />

      <main className="legal-main route-main">
        <nav className="route-crumbs" aria-label="breadcrumb">
          <a href={homePath(locale)}>{t.home}</a> / <span>{a} – {b}</span>
        </nav>
        <h1>{t.title(a, b)}</h1>
        <p className="legal-intro">{lead}</p>

        <a className="route-cta" href={searchHref}>{t.cta}</a>

        <h2>{t.table}</h2>
        <table className="route-table">
          <thead>
            <tr><th>{t.dep}</th><th>{t.arr}</th><th>{t.dur}</th><th>{t.via}</th></tr>
          </thead>
          <tbody>
            {tt.trips.map((trip) => (
              <tr key={`${trip.routeId}-${trip.time}`}>
                <td className="route-time">{trip.time}</td>
                <td>{trip.arrival || '—'}</td>
                <td>{trip.segmentMinutes ? fmtMinutes(trip.segmentMinutes, locale) : '—'}</td>
                <td className="route-via">{locale === 'ru' ? trip.destination_ru : trip.destination_ro}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="route-note">{t.note}</p>

        <h2>{t.phone}</h2>
        <p><a className="route-phone" href={OPERATOR.phoneHref}>+373 60 401 010</a></p>

        {(hasReturn || others.length > 0) && (
          <nav className="legal-nav route-links">
            {hasReturn && (
              <a href={routePath(locale, tt.to.slug, tt.from.slug)}>{t.back}: {b} – {a}</a>
            )}
          </nav>
        )}
        {others.length > 0 && (
          <>
            <h2>{t.other(nameOf(hub, locale))}</h2>
            <ul className="route-others">
              {others.map((p) => (
                <li key={`${p.from.slug}-${p.to.slug}`}>
                  <a href={routePath(locale, p.from.slug, p.to.slug)}>{nameOf(p.from, locale)} – {nameOf(p.to, locale)}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
