import Script from 'next/script';
import { getCachedLocalities } from '@/app/(public)/actions';
import { homeOptions } from '@/lib/home-props';
import type { Locale } from '@/lib/i18n';
import { TelegramClientApp } from './TelegramClientApp';

// Pagina mini app-ului clientului (ION-249): /ro/telegram și /ru/telegram, deschise de butonul «🎫 Bilete» din bot.
// Pe server se pregătesc doar selectoarele căutării (aceleași ca pe prima pagină); biletele se cer din browser, cu
// initData-ul Telegram. Scriptul Telegram e permis de CSP doar pe aceste căi (next.config.js).

export async function TelegramClientPage({ locale }: { locale: Locale }) {
  // Fără bază, căutarea rămâne fără opțiuni, dar biletele (de la panou) se văd oricum.
  const localities = await getCachedLocalities().catch(() => []);
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <TelegramClientApp locale={locale} options={homeOptions(localities, locale)} />
    </>
  );
}
