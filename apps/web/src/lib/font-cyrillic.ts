import { Open_Sans } from 'next/font/google';

/**
 * Open Sans cu subsetul chirilic, doar pentru paginile /ru (ION-204, 03.10). Layout-ul
 * rădăcină preîncarcă latin + latin-ext (româna); layout-urile `ru/` și `(rute)/ru/` îl
 * folosesc pe acesta ca pagina rusească să aibă chirilicele de la prima randare, iar
 * pagina română să nu descarce degeaba fișierul chirilic. Aceeași familie («Open Sans»,
 * font variabil 300–800), deci textul nu se schimbă — doar ce se preîncarcă.
 */
export const openSansCyrillic = Open_Sans({
  subsets: ['cyrillic'],
  variable: '--font-opensans-cyrillic',
  display: 'swap',
});
