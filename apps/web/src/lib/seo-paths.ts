import type { Locale } from '@/lib/i18n';

/**
 * Căile paginilor și slug-ul, fără listele de localități (ION-204, 03.10). `lib/seo.ts` le
 * re-exportă; pagina principală (client) importă DE AICI, ca cele 13 KB de localități din
 * seo.ts să nu intre în bundle-ul de client.
 */

/** Pagina principală: RO stă la «/» (adresa indexată), RU la «/ru». */
export function homePath(locale: Locale): string {
  return locale === 'ru' ? '/ru' : '/';
}

export function routePath(locale: Locale, fromSlug: string, toSlug: string): string {
  return locale === 'ru' ? `/ru/avtobus/${fromSlug}-${toSlug}` : `/ro/autobuz/${fromSlug}-${toSlug}`;
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
