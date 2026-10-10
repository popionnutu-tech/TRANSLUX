import { Roboto } from 'next/font/google';

/**
 * Roboto cu subsetul chirilic, doar pentru paginile /ru (ION-204, 03.10). Layout-ul
 * rădăcină preîncarcă latin + latin-ext (româna); layout-urile `ru/` și `(rute)/ru/` îl
 * folosesc pe acesta ca pagina rusească să aibă chirilicele de la prima randare, iar
 * pagina română să nu descarce degeaba fișierul chirilic. Aceeași familie («Roboto»,
 * font variabil 100–900), deci textul nu se schimbă — doar ce se preîncarcă.
 */
export const robotoCyrillic = Roboto({
  subsets: ['cyrillic'],
  variable: '--font-main-cyrillic',
  display: 'swap',
});
