import { getCachedLocalities } from '@/app/(public)/actions';
import { homeOptions } from '@/lib/home-props';
import { tileOrigin } from '@/lib/map-tiles';
import type { Locale } from '@/lib/i18n';
import { TelegramClientApp } from './TelegramClientApp';

// Pagina mini app-ului clientului (ION-249): /ro/telegram și /ru/telegram, deschise de butonul «🎫 Bilete» din bot.
// Pe server se pregătesc doar selectoarele căutării (aceleași ca pe prima pagină); biletele se cer din browser, cu
// initData-ul Telegram din fragmentul URL-ului. Fără telegram-web-app.js: ecranul complet = EcranCompletTelegram (ION-248).
//
// ION-275 («Telegram ultrafast» P6): un script mic, în HTML, pornește cererea biletelor DIRECT la panou (POST text/plain,
// initData în corp — fără preflight, fără URL) înainte ca JS-ul aplicației să se descarce; TelegramClientApp consumă
// window.__bilete. Preconnect spre panou, ca TLS-ul să fie gata.

const PANOU = (process.env.CENTRAL_HUB_URL || 'https://central-hub-md.vercel.app').replace(/\/+$/, '');

function scriptPornire(panou: string): string {
  // JSON.stringify pune adresa ca șir sigur; scriptul nu are nimic venit de la utilizator.
  return `(function(){try{var d=new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');if(!d){try{d=sessionStorage.getItem('translux_tg_init_data')}catch(e){}}if(!d)return;window.__bilete=fetch(${JSON.stringify(`${panou}/api/bilete/client/bilete`)},{method:'POST',headers:{'Content-Type':'text/plain'},body:d,cache:'no-store',credentials:'omit'});}catch(e){}})();`;
}

export async function TelegramClientPage({ locale }: { locale: Locale }) {
  // Fără bază, căutarea rămâne fără opțiuni, dar biletele (de la panou) se văd oricum.
  // Fila «Caută» = motorul de căutare de pe prima pagină a site-ului, cu aceleași selectoare (ION-249).
  const localities = await getCachedLocalities().catch(() => []);
  return (
    <>
      <link rel="preconnect" href={PANOU} />
      {/* ION-277: legătura cu serverul de plăcuțe se deschide din HTML, nu abia după montarea hărții. */}
      {tileOrigin() && <link rel="preconnect" href={tileOrigin()} />}
      <script dangerouslySetInnerHTML={{ __html: scriptPornire(PANOU) }} />
      <TelegramClientApp locale={locale} options={homeOptions(localities, locale)} />
    </>
  );
}
