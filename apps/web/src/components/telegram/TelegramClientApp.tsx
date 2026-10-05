'use client';

// Mini app-ul clientului, deschis de butonul de meniu «🎫 Bilete» din botul Telegram (ION-249, Ion 05.10: «1. pe full
// ecran 2. harta cu unde este șoferul meu 3. căutare noi bilete»; apoi «să fie 3 file diferite și toate ca în site, cu
// alegere jos, și designul să fie la fel»). Trei file cu bara de jos: Biletele mele · Harta · Caută bilet — fila «Caută»
// e chiar prima pagină a site-ului (HomePage în modul Telegram). Biletele vin de la panou numai pe baza initData-ului
// Telegram verificat pe server; fără el — doar căutarea, nimic personal.

import { useCallback, useEffect, useState } from 'react';
import { bileteleMeleTelegram, type StareBileteleMele } from '@/app/(public)/telegram-actions';
import type { ComandaPublica } from '@/lib/bilete-api';
import type { HomeOptions } from '@/lib/home-props';
import type { Locale } from '@/lib/i18n';
import { LINE_TEL, LINE_TEXT } from '@/lib/phone';
import { fereastraHartii, oraChisinau } from '@/lib/telegram-client';
import { BILET_CARD_CSS, BiletCard, bileteDeAratat } from '@/components/bilet/BiletCard';
import { HomePage } from '@/components/home-page';
import { NowResults, type NowTrip } from '@/components/NowResults';
import { phoneTel, phoneText } from '@/lib/phone';
import { EcranCompletTelegram } from '@/components/bilet/BiletActiuni';
import { citesteInitData } from './telegram-webapp';

const RED = '#9B1B30';
const FUNDAL = '#f1efef';
const BOT = (process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot').replace(/^@/, '');
/** Fereastra hărții se reevaluează o dată pe minut (biletul de azi trece singur din «curând» în «activă»). */
const CEAS_MS = 60_000;

type Fila = 'bilete' | 'harta' | 'cauta';

const TXT = {
  ro: {
    file: { bilete: 'Biletele mele', harta: 'Harta', cauta: 'Caută bilet' },
    hartaTitlu: 'Unde e autobuzul meu', hartaGol: 'Azi nu ai nicio cursă. Harta autobuzului apare aici în ziua cursei.',
    hartaIncheiata: 'Cursa s-a încheiat.', spreCautare: 'Caută un bilet',
    titlu: 'Biletele mele', incarca: 'Se încarcă biletele…', gol: 'Nu ai bilete active. Caută un bilet nou în fila «Caută bilet».',
    hartaMaiTarziu: 'Harta apare în ziua cursei, cu o oră înainte de plecare.',
    faraBilet: 'Plata a sosit după expirarea comenzii. Dispecerul o verifică și te sună.',
    faraTelegram: 'Biletele tale se văd când deschizi pagina din botul TRANSLUX din Telegram, butonul «🎫 Bilete».',
    deschideBot: 'Deschide botul în Telegram',
    expirat: 'Sesiunea Telegram a expirat. Închide fereastra și apasă din nou «🎫 Bilete».',
    indisponibil: 'Biletele nu se pot afișa acum.', reincearca: 'Încearcă din nou',
    arata: 'Arată codul QR șoferului la urcare. Fiecare cod e un loc.', ajutor: 'Ajutor:',
  },
  ru: {
    file: { bilete: 'Мои билеты', harta: 'Карта', cauta: 'Найти билет' },
    hartaTitlu: 'Где мой автобус', hartaGol: 'Сегодня у вас нет поездок. Карта автобуса появится здесь в день поездки.',
    hartaIncheiata: 'Поездка завершена.', spreCautare: 'Найти билет',
    titlu: 'Мои билеты', incarca: 'Загружаем билеты…', gol: 'Активных билетов нет. Найдите новый билет во вкладке «Найти билет».',
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
  const [fila, setFila] = useState<Fila>('bilete');
  // «Caută» se montează la prima vizită și rămâne montată (căutarea nu se pierde la schimbarea filei).
  const [cautaVazuta, setCautaVazuta] = useState(false);

  const incarca = useCallback(async (date: string) => {
    setEcran({ tip: 'incarca' });
    const stare = await bileteleMeleTelegram(date).catch((): StareBileteleMele => ({ ok: false, eroare: 'indisponibil' }));
    setEcran({ tip: 'gata', stare });
  }, []);

  // Biletele se cer doar cu initData din fragmentul pus de Telegram; ecranul complet îl face EcranCompletTelegram.
  useEffect(() => {
    const date = citesteInitData();
    setInitData(date);
    if (!date) { setEcran({ tip: 'fara_telegram' }); setFila('cauta'); setCautaVazuta(true); return; }
    void incarca(date);
  }, [incarca]);

  useEffect(() => {
    const t = setInterval(() => setAcum(Date.now()), CEAS_MS);
    return () => clearInterval(t);
  }, []);

  const alege = (f: Fila) => { setFila(f); if (f === 'cauta') setCautaVazuta(true); window.scrollTo(0, 0); };
  const contact = ecran.tip === 'gata' && ecran.stare.ok ? ecran.stare.contact : null;

  return (
    <div lang={locale} className="tg-app" style={{ ['--bg' as string]: FUNDAL }}>
      <style>{`
${BILET_CARD_CSS}
.tg-app{min-height:100vh;font-family:var(--font-opensans),Open Sans,system-ui,sans-serif;color:#231A1C}
.tg-fila{min-height:100vh;background:var(--bg);box-sizing:border-box;
  padding:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 96px)}
.tg-cauta{padding-top:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px));padding-bottom:calc(env(safe-area-inset-bottom,0px) + 72px)}
.tg-col{max-width:520px;margin:0 auto;display:grid;gap:18px}
.tg-buton{min-height:48px;padding:0 16px;border-radius:12px;border:none;background:${RED};color:#fff;font:700 16px var(--font-opensans),Open Sans,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.tg-nota{margin:0;padding:12px 14px;border-radius:14px;background:#fff;color:#555;font-size:14px;line-height:1.45}
.tg-bara{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-template-columns:repeat(3,1fr);background:rgba(255,255,255,.96);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid rgba(155,27,48,.15);box-shadow:0 -4px 20px rgba(155,27,48,.06);
  padding:6px 8px calc(env(safe-area-inset-bottom,0px) + 6px)}
.tg-tab{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:52px;justify-content:center;border:none;background:none;cursor:pointer;
  color:rgba(35,26,28,.5);font:700 11.5px var(--font-opensans),Open Sans,sans-serif;border-radius:14px}
.tg-tab[aria-selected="true"]{color:${RED};background:rgba(155,27,48,.08)}
`}</style>
      <EcranCompletTelegram />

      {fila === 'bilete' && (
        <div className="tg-fila">
          <div className="tg-col">
            <Antet titlu={`🎫 ${tx.titlu}`} />
            <BileteleMele ecran={ecran} acum={acum} locale={locale} onReincearca={() => initData && void incarca(initData)} />
            <Ajutor locale={locale} />
          </div>
        </div>
      )}

      {fila === 'harta' && (
        <div className="tg-fila">
          <div className="tg-col">
            <Antet titlu={`📍 ${tx.hartaTitlu}`} />
            <HartaMea ecran={ecran} acum={acum} locale={locale} onCauta={() => alege('cauta')} />
          </div>
        </div>
      )}

      {cautaVazuta && (
        <div className="tg-cauta" style={{ display: fila === 'cauta' ? 'block' : 'none' }}>
          <HomePage locale={locale} options={options} telegram={{ contact }} />
        </div>
      )}

      <nav className="tg-bara" role="tablist" aria-label="TRANSLUX">
        {(['bilete', 'harta', 'cauta'] as Fila[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={fila === f} className="tg-tab" onClick={() => alege(f)}>
            <IconFila fila={f} />
            {tx.file[f]}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Antet({ titlu }: { titlu: string }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span aria-label="TRANSLUX" style={{
        display: 'inline-block', height: 24, aspectRatio: '1318/192', backgroundColor: RED, flexShrink: 0,
        WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
        maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
      }} />
      <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, textAlign: 'right' }}>{titlu}</h1>
    </header>
  );
}

function Ajutor({ locale }: { locale: Locale }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: '#777', textAlign: 'center' }}>
      {TXT[locale].ajutor} <a href={LINE_TEL} style={{ color: RED, fontWeight: 700 }}>{LINE_TEXT}</a>
    </p>
  );
}

/** Iconițele barei de jos: bilet, punct pe hartă, lupă (linie, ca pe site). */
function IconFila({ fila }: { fila: Fila }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (fila === 'bilete') return <svg {...p}><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></svg>;
  if (fila === 'harta') return <svg {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
  return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}

/** Fila «Harta»: autobuzul fiecărei curse de azi, în fereastra ei (regulile ION-37); altfel explicația. */
function HartaMea({ ecran, acum, locale, onCauta }: { ecran: Ecran; acum: number; locale: Locale; onCauta: () => void }) {
  const tx = TXT[locale];
  if (ecran.tip === 'pornire' || ecran.tip === 'incarca') return <p className="tg-nota" aria-live="polite">{tx.incarca}</p>;
  if (ecran.tip === 'fara_telegram' || !ecran.stare.ok) return <p className="tg-nota">{tx.faraTelegram}</p>;
  // Cursa de azi încă neîncheiată (cea mai apropiată): fereastra «Acum» de pe site, cu cursa din bilet aleasă.
  const azi = ecran.stare.bilete.filter((c) => c.status === 'platita' && ['curand', 'activa'].includes(fereastraHartii(c, acum)));
  if (azi.length > 0) {
    const c = azi[0];
    const plecare = oraChisinau(c.departure_at);
    return <NowResults key={c.cod} from={c.from_name} to={c.to_name} fromValue={c.from_name} toValue={c.to_name} locale={locale}
      onClose={() => {}} incorporat plecareMea={plecare} doarCursa={{ departure: plecare, routeId: c.ruta?.id ?? null }}
      panou={(t) => <BiletMini comanda={c} cursa={t} locale={locale} />} />;
  }
  return (
    <div className="tg-nota" style={{ display: 'grid', gap: 10 }}>
      <span>{tx.hartaGol}</span>
      <button type="button" className="tg-buton" onClick={onCauta}>{tx.spreCautare}</button>
    </div>
  );
}

const TXT_MINI = {
  ro: { aici: 'Autobuzul e la oprirea ta', vine: (m: number, ora: string) => `Vine în ${m} min · ${ora}`, nuEPeDrum: 'Autobuzul încă nu e pe drum', locul: 'Locul', suna: 'Sună șoferul' },
  ru: { aici: 'Автобус на вашей остановке', vine: (m: number, ora: string) => `Будет через ${m} мин · ${ora}`, nuEPeDrum: 'Автобус ещё не в пути', locul: 'Место', suna: 'Позвонить водителю' },
} as const;

/**
 * Biletul micșorat din partea de jos a hărții (ION-249, Ion 05.10: «biletul cu QR, minimizat, cu datele mașinii, stilat»):
 * ruta și orele, când vine autobuzul la oprirea omului, șoferul, mașina și apelul, locul și QR-ul (mărit la apăsare).
 */
function BiletMini({ comanda: c, cursa, locale }: { comanda: ComandaPublica; cursa: NowTrip | null; locale: Locale }) {
  const tx = TXT_MINI[locale];
  const [mare, setMare] = useState(false);
  const b = bileteDeAratat(c)[0];
  const stare = !cursa ? tx.nuEPeDrum : cursa.at_stop?.mine ? tx.aici : tx.vine(Math.max(0, cursa.eta_min ?? cursa.minutes_until), cursa.eta ?? cursa.departure);
  const masina = cursa ? [cursa.driver, cursa.plate].filter(Boolean).join(' · ') : '';
  return (
    <div className="tg-mini">
      <style>{`
.tg-mini{background:#fff;border-radius:22px;box-shadow:0 12px 32px rgba(40,10,18,.18);overflow:hidden;font-family:var(--font-opensans),Open Sans,sans-serif;color:#231A1C}
.tg-mini-sus{display:flex;align-items:center;gap:12px;padding:14px 14px 12px 18px;background:${RED};color:#fff}
.tg-mini-ore{flex:1;min-width:0}
.tg-mini-ore b{font-size:22px;font-weight:800;letter-spacing:-.3px}
.tg-mini-ore span{display:block;font-size:13px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tg-mini-stare{font-size:14px;font-weight:700;background:rgba(255,255,255,.18);border-radius:999px;padding:6px 10px;white-space:nowrap}
.tg-mini-jos{display:flex;align-items:center;gap:12px;padding:12px 14px 14px 18px}
.tg-mini-date{flex:1;min-width:0;display:grid;gap:3px;font-size:13px;color:#6B5B5F}
.tg-mini-date strong{font-size:15px;color:#231A1C}
.tg-mini-suna{display:inline-flex;align-items:center;gap:6px;margin-top:4px;color:${RED};font-weight:700;font-size:14px;text-decoration:none}
.tg-mini-qr{flex-shrink:0;width:84px;height:84px;border-radius:12px;border:1px solid #F1E8EA;padding:4px;background:#fff;cursor:zoom-in}
.tg-mini-qr svg{width:100%;height:100%;display:block}
.tg-mini.mare .tg-mini-qr{width:min(240px,60vw);height:min(240px,60vw);cursor:zoom-out}
.tg-mini.mare .tg-mini-jos{flex-direction:column}
`}</style>
      <div className={`tg-mini${mare ? ' mare' : ''}`} style={{ boxShadow: 'none', borderRadius: 0 }}>
        <div className="tg-mini-sus">
          <div className="tg-mini-ore">
            <b>{oraChisinau(c.departure_at)} → {c.sosire ?? '—:—'}</b>
            <span>{c.from_name} → {c.to_name}</span>
          </div>
          <span className="tg-mini-stare">{stare}</span>
        </div>
        <div className="tg-mini-jos">
          <div className="tg-mini-date">
            {masina && <strong>{masina}</strong>}
            {b && <span>{tx.locul} {b.loc_nr ?? b.nr} · {c.passenger_name}</span>}
            {cursa?.phone && <a className="tg-mini-suna" href={`tel:${phoneTel(cursa.phone)}`}>📞 {phoneText(cursa.phone)}</a>}
          </div>
          {/* SVG-ul QR vine de la panou, generat din codul biletului (nu din text de la utilizator). */}
          {b && <button type="button" className="tg-mini-qr" aria-label="QR" onClick={() => setMare(!mare)} dangerouslySetInnerHTML={{ __html: b.qr_svg }} />}
        </div>
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

/** O comandă: cardurile cu QR, câte unul pe loc (harta e în fila «Harta»). */
function ComandaClient({ comanda: c, acum, locale }: { comanda: ComandaPublica; acum: number; locale: Locale }) {
  const tx = TXT[locale];
  const valide = bileteDeAratat(c);
  if (c.status !== 'platita' || valide.length === 0) return <p className="tg-nota">{c.from_name} → {c.to_name}: {tx.faraBilet}</p>;
  void acum;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {valide.map((b) => <BiletCard key={b.nr} comanda={c} bilet={b} locale={locale} />)}
    </div>
  );
}
