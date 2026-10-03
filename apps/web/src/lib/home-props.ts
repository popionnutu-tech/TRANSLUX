import type { Locale } from '@/lib/i18n';
import type { HomeLink } from '@/lib/route-pages';
import type { Locality, PopularRoutePrice } from '@/app/(public)/actions';

/**
 * Datele paginii principale, strânse pe server la minimul de care are nevoie clientul
 * (ION-204, 03.10). Până acum `localities` pleca întreagă în RSC payload (id, is_major,
 * sort_order, ambele nume) și se sorta în browser; acum pleacă doar valoarea și eticheta,
 * gata sortate. La fel «Destinații populare»: numele în limba paginii și linkul gata ales.
 */

/** O opțiune a selectoarelor: `v` = numele RO (cheia căutării), `l` = eticheta în limba paginii. */
export interface LocalityOption {
  v: string;
  l: string;
}

export interface HomeOptions {
  major: LocalityOption[];
  minor: LocalityOption[];
}

export interface HomePopular {
  name: string;
  price: number;
  /** Pagina de direcție (ION-153), doar dacă perechea are una. */
  href?: string;
}

export function homeOptions(localities: Locality[], locale: Locale): HomeOptions {
  const name = (l: Locality) => (locale === 'ru' ? l.name_ru : l.name_ro);
  const opt = (l: Locality): LocalityOption => ({ v: l.name_ro, l: name(l) });
  return {
    major: localities.filter((l) => l.is_major).sort((a, b) => b.sort_order - a.sort_order).map(opt),
    minor: localities.filter((l) => !l.is_major).sort((a, b) => name(a).localeCompare(name(b), locale)).map(opt),
  };
}

export function homePopular(prices: PopularRoutePrice[], links: HomeLink[], locale: Locale): HomePopular[] {
  const hrefs = new Map(links.map((r) => [r.key, r.href]));
  return prices.map((r) => {
    // Link doar spre o pagină de direcție care există (perechea e în getRoutePairs).
    const href = r.from_slug && r.to_slug ? hrefs.get(`${r.from_slug}-${r.to_slug}`) : undefined;
    const name = locale === 'ru' ? `${r.from_ru} - ${r.to_ru}` : `${r.from_ro} - ${r.to_ro}`;
    return href ? { name, price: r.price, href } : { name, price: r.price };
  });
}
