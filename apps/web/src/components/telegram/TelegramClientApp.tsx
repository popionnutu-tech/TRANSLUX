'use client';

// Mini app-ul clientului, deschis de butonul de meniu «🎫 Bilete» din botul Telegram (ION-249, Ion 05.10: «1. pe full
// ecran 2. harta cu unde este șoferul meu 3. căutare noi bilete»). Fără antetul și subsolul site-ului. Biletele vin de la
// panou numai pe baza initData-ului Telegram verificat pe server; fără el — doar căutarea, nimic personal.

import { useCallback, useEffect, useState } from 'react';
import { bileteleMeleTelegram, type StareBileteleMele } from '@/app/(public)/telegram-actions';
import type { ComandaPublica } from '@/lib/bilete-api';
import type { HomeOptions } from '@/lib/home-props';
import type { Locale } from '@/lib/i18n';
import { LINE_TEL, LINE_TEXT } from '@/lib/phone';
import { fereastraHartii, oraChisinau } from '@/lib/telegram-client';
import { BILET_CARD_CSS, BiletCard, bileteDeAratat } from '@/components/bilet/BiletCard';
import { CautaBiletNou } from './CautaBiletNou';
import { HartaAutobuzului } from './HartaAutobuzului';
import { EcranCompletTelegram } from '@/components/bilet/BiletActiuni';
import { citesteInitData } from './telegram-webapp';

const RED = '#9B1B30';
const FUNDAL = '#f1efef';
const BOT = (process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot').replace(/^@/, '');
/** Fereastra hărții se reevaluează o dată pe minut (biletul de azi trece singur din «curând» în «activă»). */
const CEAS_MS = 60_000;

const TXT = {
  ro: {
    titlu: 'Biletele mele', incarca: 'Se încarcă biletele…', gol: 'Nu ai bilete active. Caută mai jos un bilet nou.',
    hartaMaiTarziu: 'Harta apare în ziua cursei, cu o oră înainte de plecare.',
    faraBilet: 'Plata a sosit după expirarea comenzii. Dispecerul o verifică și te sună.',
    faraTelegram: 'Biletele tale se văd când deschizi pagina din botul TRANSLUX din Telegram, butonul «🎫 Bilete».',
    deschideBot: 'Deschide botul în Telegram',
    expirat: 'Sesiunea Telegram a expirat. Închide fereastra și apasă din nou «🎫 Bilete».',
    indisponibil: 'Biletele nu se pot afișa acum.', reincearca: 'Încearcă din nou',
    arata: 'Arată codul QR șoferului la urcare. Fiecare cod e un loc.', ajutor: 'Ajutor:',
  },
  ru: {
    titlu: 'Мои билеты', incarca: 'Загружаем билеты…', gol: 'Активных билетов нет. Найдите новый билет ниже.',
    hartaMaiTarziu: 'Карта появится в день поездки, за час до отправления.',
    faraBilet: 'Оплата пришла после истечения заказа. Диспетчер проверит её и позвонит вам.',
    faraTelegram: 'Ваши билеты видны, когда страница открыта из бота TRANSLUX в Telegram, кнопка «🎫 Билеты».',
    deschideBot: 'Открыть бот в Telegram',
    expirat: 'Сессия Telegram истекла. Закройте окно и снова нажмите «🎫 Билеты».',
    indisponibil: 'Билеты сейчас недоступны.', reincearca: 'Повторить',
    arata: 'Покажите QR-код водителю при посадке. Каждый код — одно место.', ajutor: 'Помощь:',
  },
} as const;

type Ecran = { tip: 'pornire' } | { tip: 'fara_telegram' } | { tip: 'incarca' } | { tip: 'gata'; stare: StareBileteleMele };

export function TelegramClientApp({ locale, options }: { locale: Locale; options: HomeOptions }) {
  const tx = TXT[locale];
  const [initData, setInitData] = useState('');
  const [ecran, setEcran] = useState<Ecran>({ tip: 'pornire' });
  const [acum, setAcum] = useState(() => Date.now());

  const incarca = useCallback(async (date: string) => {
    setEcran({ tip: 'incarca' });
    const stare = await bileteleMeleTelegram(date).catch((): StareBileteleMele => ({ ok: false, eroare: 'indisponibil' }));
    setEcran({ tip: 'gata', stare });
  }, []);

  // Biletele se cer doar cu initData din fragmentul pus de Telegram; ecranul complet îl face EcranCompletTelegram.
  useEffect(() => {
    const date = citesteInitData();
    setInitData(date);
    if (!date) { setEcran({ tip: 'fara_telegram' }); return; }
    void incarca(date);
  }, [incarca]);

  useEffect(() => {
    const t = setInterval(() => setAcum(Date.now()), CEAS_MS);
    return () => clearInterval(t);
  }, []);

  const contact = ecran.tip === 'gata' && ecran.stare.ok ? ecran.stare.contact : null;

  return (
    <div lang={locale} className="tg-app" style={{ ['--bg' as string]: FUNDAL }}>
      <style>{`
${BILET_CARD_CSS}
.tg-app{min-height:100vh;background:var(--bg);font-family:var(--font-opensans),Open Sans,system-ui,sans-serif;color:#231A1C;
  padding:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 24px);box-sizing:border-box}
.tg-col{max-width:520px;margin:0 auto;display:grid;gap:18px}
.tg-buton{min-height:48px;padding:0 16px;border-radius:12px;border:none;background:${RED};color:#fff;font:700 16px var(--font-opensans),Open Sans,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.tg-nota{margin:0;padding:12px 14px;border-radius:14px;background:#fff;color:#555;font-size:14px;line-height:1.45}
`}</style>
      <EcranCompletTelegram />
      <div className="tg-col">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span aria-label="TRANSLUX" style={{
            display: 'inline-block', height: 24, aspectRatio: '1318/192', backgroundColor: RED,
            WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
            maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
          }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🎫 {tx.titlu}</h1>
        </header>

        <BileteleMele ecran={ecran} acum={acum} locale={locale} onReincearca={() => initData && void incarca(initData)} />

        <CautaBiletNou locale={locale} options={options} contact={contact} />

        <p style={{ margin: 0, fontSize: 13, color: '#777', textAlign: 'center' }}>
          {tx.ajutor} <a href={LINE_TEL} style={{ color: RED, fontWeight: 700 }}>{LINE_TEXT}</a>
        </p>
      </div>
    </div>
  );
}

function BileteleMele({ ecran, acum, locale, onReincearca }: { ecran: Ecran; acum: number; locale: Locale; onReincearca: () => void }) {
  const tx = TXT[locale];
  if (ecran.tip === 'pornire' || ecran.tip === 'incarca') return <p className="tg-nota" aria-live="polite">{tx.incarca}</p>;
  if (ecran.tip === 'fara_telegram') {
    return (
      <div className="tg-nota" style={{ display: 'grid', gap: 10 }}>
        <span>{tx.faraTelegram}</span>
        <a className="tg-buton" href={`https://t.me/${BOT}`} style={{ background: '#1b7fb0' }}>{tx.deschideBot}</a>
      </div>
    );
  }
  const { stare } = ecran;
  if (!stare.ok) {
    if (stare.eroare === 'expirat' || stare.eroare === 'neautentificat') return <p className="tg-nota" role="alert">{stare.eroare === 'expirat' ? tx.expirat : tx.faraTelegram}</p>;
    return (
      <div className="tg-nota" role="alert" style={{ display: 'grid', gap: 10 }}>
        <span>{tx.indisponibil}</span>
        <button type="button" className="tg-buton" onClick={onReincearca}>{tx.reincearca}</button>
      </div>
    );
  }
  if (stare.bilete.length === 0) return <p className="tg-nota">{tx.gol}</p>;
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {stare.bilete.map((c) => <ComandaClient key={c.cod} comanda={c} acum={acum} locale={locale} />)}
      <p style={{ margin: 0, fontSize: 13, color: '#555' }}>{tx.arata}</p>
    </div>
  );
}

/** O comandă: harta autobuzului (în fereastra ei) deasupra cardurilor cu QR, câte unul pe loc. */
function ComandaClient({ comanda: c, acum, locale }: { comanda: ComandaPublica; acum: number; locale: Locale }) {
  const tx = TXT[locale];
  const valide = bileteDeAratat(c);
  if (c.status !== 'platita' || valide.length === 0) return <p className="tg-nota">{c.from_name} → {c.to_name}: {tx.faraBilet}</p>;
  const fereastra = fereastraHartii(c, acum);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {fereastra === 'activa' && <HartaAutobuzului from={c.from_name} to={c.to_name} plecare={oraChisinau(c.departure_at)} locale={locale} />}
      {(fereastra === 'curand' || fereastra === 'alta_zi') && <p className="tg-nota">📍 {tx.hartaMaiTarziu}</p>}
      {valide.map((b) => <BiletCard key={b.nr} comanda={c} bilet={b} locale={locale} />)}
    </div>
  );
}
