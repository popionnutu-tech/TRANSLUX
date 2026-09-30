import { OPERATOR } from '@/components/legal/legal-content';
import type { Locale } from '@/lib/i18n';
import { homePath, jsonLd, SITE_URL } from '@/lib/seo';

/** Date structurate ale paginii principale (ION-153): cine e TRANSLUX și ce site are. */
export function HomeJsonLd({ locale }: { locale: Locale }) {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: OPERATOR.brand,
      legalName: OPERATOR.name,
      url: SITE_URL,
      logo: `${SITE_URL}/translux-logo-red.png`,
      telephone: '+37360401010',
      email: OPERATOR.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'str. Olimpică 3',
        addressLocality: 'Briceni',
        postalCode: 'MD-4701',
        addressCountry: 'MD',
      },
      sameAs: ['https://www.facebook.com/TRANSPORTLUX', 'https://www.tiktok.com/@translux.md'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'TRANSLUX',
      url: `${SITE_URL}${homePath(locale) === '/' ? '' : homePath(locale)}`,
      inLanguage: locale === 'ru' ? 'ru' : 'ro',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
