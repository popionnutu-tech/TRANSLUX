import { getCachedLocalities, getCachedPopularPrices } from '@/app/(public)/actions';
import { homeOptions, homePopular } from '@/lib/home-props';
import { getRoutePairs, homeLinks } from '@/lib/route-pages';
import type { Locale } from '@/lib/i18n';
import { TelegramClientApp } from './TelegramClientApp';

// Pagina mini app-ului clientului (ION-249): /ro/telegram și /ru/telegram, deschise de butonul «🎫 Bilete» din bot.
// Pe server se pregătesc doar selectoarele căutării (aceleași ca pe prima pagină); biletele se cer din browser, cu
// initData-ul Telegram din fragmentul URL-ului. Fără telegram-web-app.js: ecranul complet = EcranCompletTelegram (ION-248).

export async function TelegramClientPage({ locale }: { locale: Locale }) {
  // Fără bază, căutarea rămâne fără opțiuni, dar biletele (de la panou) se văd oricum.
  // Fila «Caută» = prima pagină a site-ului, cu aceleași selectoare și «Destinații populare» (ION-249).
  const [localities, popularPrices, pairs] = await Promise.all([
    getCachedLocalities().catch(() => []),
    getCachedPopularPrices().catch(() => []),
    getRoutePairs().catch(() => []),
  ]);
  const links = homeLinks(pairs, locale);
  return (
    <TelegramClientApp locale={locale} options={homeOptions(localities, locale)}
      popular={homePopular(popularPrices, [...links.routes, ...links.localities], locale)} />
  );
}
