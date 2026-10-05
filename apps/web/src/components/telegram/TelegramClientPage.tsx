import { getCachedLocalities } from '@/app/(public)/actions';
import { homeOptions } from '@/lib/home-props';
import type { Locale } from '@/lib/i18n';
import { TelegramClientApp } from './TelegramClientApp';

// Pagina mini app-ului clientului (ION-249): /ro/telegram și /ru/telegram, deschise de butonul «🎫 Bilete» din bot.
// Pe server se pregătesc doar selectoarele căutării (aceleași ca pe prima pagină); biletele se cer din browser, cu
// initData-ul Telegram din fragmentul URL-ului. Fără telegram-web-app.js: ecranul complet = EcranCompletTelegram (ION-248).

export async function TelegramClientPage({ locale }: { locale: Locale }) {
  // Fără bază, căutarea rămâne fără opțiuni, dar biletele (de la panou) se văd oricum.
  const localities = await getCachedLocalities().catch(() => []);
  return (
    <TelegramClientApp locale={locale} options={homeOptions(localities, locale)} />
  );
}
