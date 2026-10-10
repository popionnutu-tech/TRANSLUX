'use client';

// Mini app-ul clientului, deschis de butonul de meniu «🎫 Bilete» din botul Telegram (ION-249). Ion, 05.10: «harta cu
// bilete să fie prima, a doua bilete noi în care deja automat să fie introdus numele și prenumele… și email dacă a fost
// introdus în trecut, și ultim istoric, toate călătoriile»; «QR mare să apară doar în chat». Trei file cu bara de jos:
// 1. Biletele — fereastra «Acum» doar cu cursa din bilet și biletul micșorat jos (sau biletele viitoare, micșorate);
// 2. Bilet nou — motorul de căutare al site-ului, cu numele, telefonul și e-mailul precompletate; 3. Istoric.
// Biletele vin de la panou numai pe baza initData-ului Telegram verificat pe server; fără el — doar căutarea.

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { bileteleMeleTelegram, type StareBileteleMele } from '@/app/(public)/telegram-actions';
import type { ComandaPublica } from '@/lib/bilete-api';
import type { HomeOptions } from '@/lib/home-props';
import type { Locale } from '@/lib/i18n';
import { LINE_TEL, LINE_TEXT } from '@/lib/phone';
import {
  CHEIE_CACHE_BILETE, bileteNeincheiate, deMemorat, fereastraHartii, memorateValide, oraChisinau, parseazaContact, parseazaIstoric,
  telegramIdDinInitData, type CalatorieIstoric,
} from '@/lib/telegram-client';
import { bileteDeAratat } from '@/components/bilet/BiletCard';

// ION-275 («Telegram ultrafast» P7): «Bilet nou» (motorul de căutare) se încarcă la prima atingere a filei, nu în JS-ul de pornire.
const HomePage = dynamic(() => import('@/components/home-page').then((m) => m.HomePage), { ssr: false });

/**
 * ION-275 (P6): biletele cerute de scriptul din HTML (window.__bilete, pornit înaintea JS-ului, direct la panou). Se consumă o
 * dată; orice eșec (rețea, CORS, 5xx) → null, iar apelantul cade pe server action. 401/429 sunt răspunsuri, nu eșecuri.
 */
async function bileteTimpurii(): Promise<StareBileteleMele | null> {
  const w = window as unknown as { __bilete?: Promise<Response> | null };
  const p = w.__bilete;
  if (!p) return null;
  w.__bilete = null;
  try {
    const r = await p;
    const j = await r.json().catch(() => null) as { ok?: boolean; bilete?: unknown; contact?: unknown; istoric?: unknown; eroare?: unknown } | null;
    if (r.ok && j?.ok && Array.isArray(j.bilete)) return { ok: true, bilete: j.bilete as ComandaPublica[], contact: parseazaContact(j.contact), istoric: parseazaIstoric(j.istoric) };
    if (r.status === 401) return { ok: false, eroare: j?.eroare === 'expirat' ? 'expirat' : 'neautentificat' };
    if (r.status === 429) return { ok: false, eroare: 'prea_multe' };
    return null;
  } catch { return null; }
}

const ls = {
  get(k: string): unknown { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat / plin */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignoră */ } },
};
import { NowResults, type NowTrip } from '@/components/NowResults';
import { phoneTel, phoneText } from '@/lib/phone';
import { EcranCompletTelegram, suna } from '@/components/bilet/BiletActiuni';
import { citesteInitData } from './telegram-webapp';

const RED = '#9B1B30';
const FUNDAL = '#f1efef';
const BOT = (process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot').replace(/^@/, '');
/** Fereastra hărții se reevaluează o dată pe minut (biletul de azi trece singur din «curând» în «activă»). */
const CEAS_MS = 60_000;

type Fila = 'bilete' | 'nou' | 'istoric';
const FILE: Fila[] = ['bilete', 'nou', 'istoric'];

const TXT = {
  ro: {
    file: { bilete: 'Biletele mele', nou: 'Bilet nou', istoric: 'Istoric' },
    titlu: 'Biletele mele', incarca: 'Se încarcă biletele…', gol: 'Nu ai bilete active.', spreNou: 'Cumpără un bilet',
    faraTelegram: 'Biletele tale se văd când deschizi pagina din botul TRANSLUX din Telegram, butonul «🎫 Bilete».',
    deschideBot: 'Deschide botul în Telegram',
    expirat: 'Sesiunea Telegram a expirat. Închide fereastra și apasă din nou «🎫 Bilete».',
    indisponibil: 'Biletele nu se pot afișa acum.', reincearca: 'Încearcă din nou', ajutor: 'Ajutor:',
    istoricTitlu: 'Istoric', istoricGol: 'Încă nu ai călătorii.', locuri: (n: number) => (n === 1 ? '1 loc' : `${n} locuri`),
    stari: { activ: 'Activ', efectuata: 'Efectuată', anulata: 'Anulată', returnata: 'Returnată', verificare: 'Fără bilet — banii se întorc' },
  },
  ru: {
    file: { bilete: 'Мои билеты', nou: 'Новый билет', istoric: 'История' },
    titlu: 'Мои билеты', incarca: 'Загружаем билеты…', gol: 'Активных билетов нет.', spreNou: 'Купить билет',
    faraTelegram: 'Ваши билеты видны, когда страница открыта из бота TRANSLUX в Telegram, кнопка «🎫 Билеты».',
    deschideBot: 'Открыть бот в Telegram',
    expirat: 'Сессия Telegram истекла. Закройте окно и снова нажмите «🎫 Билеты».',
    indisponibil: 'Билеты сейчас недоступны.', reincearca: 'Повторить', ajutor: 'Помощь:',
    istoricTitlu: 'История', istoricGol: 'Поездок пока нет.', locuri: (n: number) => (n === 1 ? '1 место' : `${n} места`),
    stari: { activ: 'Активен', efectuata: 'Совершена', anulata: 'Отменена', returnata: 'Возвращена', verificare: 'Без билета — деньги вернутся' },
  },
} as const;

type Ecran = { tip: 'pornire' } | { tip: 'fara_telegram' } | { tip: 'incarca' } | { tip: 'gata'; stare: StareBileteleMele };

/** «Azi 15:35», «Mâine 06:00», «mar., 14.10 06:00» — ziua cursei pe biletul micșorat (ora Chișinăului). */
function ziCursa(tripDate: string, locale: Locale, azi: string, maine: string): string {
  const fmt = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  if (tripDate === fmt(Date.now())) return azi;
  if (tripDate === fmt(Date.now() + 86_400_000)) return maine;
  const [y, m, d] = tripDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'ro-RO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function TelegramClientApp({ locale, options }: { locale: Locale; options: HomeOptions }) {
  const tx = TXT[locale];
  const [initData, setInitData] = useState('');
  const [ecran, setEcran] = useState<Ecran>({ tip: 'pornire' });
  const [acum, setAcum] = useState(() => Date.now());
  const [fila, setFila] = useState<Fila>('bilete');
  // «Bilet nou» se montează la prima vizită și rămâne montat (căutarea nu se pierde la schimbarea filei).
  const [nouVazut, setNouVazut] = useState(false);

  const incarca = useCallback(async (date: string, pornire = false) => {
    const tgId = telegramIdDinInitData(date);
    const cheie = tgId ? CHEIE_CACHE_BILETE(tgId) : null;
    // SWR (P7): biletele acestui cont din cache (≤ 12 h, doar câmpurile cardului) apar imediat; răspunsul le înlocuiește.
    const memorate = cheie ? ls.get(cheie) : null;
    if (pornire && memorateValide(memorate, tgId, Date.now())) {
      setEcran({ tip: 'gata', stare: { ok: true, bilete: memorate.bilete as ComandaPublica[], contact: null, istoric: [] } });
    } else {
      setEcran({ tip: 'incarca' });
    }
    const stare = (pornire ? await bileteTimpurii() : null)
      ?? await bileteleMeleTelegram(date).catch((): StareBileteleMele => ({ ok: false, eroare: 'indisponibil' }));
    if (cheie && tgId) {
      if (stare.ok) ls.set(cheie, deMemorat(tgId, stare.bilete, Date.now()));
      else if (stare.eroare === 'neautentificat' || stare.eroare === 'expirat') ls.del(cheie);
    }
    // Panoul indisponibil, dar avem lista din cache: rămâne pe ecran (mai bine veche decât eroare).
    if (!stare.ok && stare.eroare === 'indisponibil' && pornire && memorateValide(memorate, tgId, Date.now())) return;
    setEcran({ tip: 'gata', stare });
  }, []);

  // Biletele se cer doar cu initData din fragmentul pus de Telegram; ecranul complet îl face EcranCompletTelegram.
  useEffect(() => {
    const date = citesteInitData();
    setInitData(date);
    if (!date) { setEcran({ tip: 'fara_telegram' }); setFila('nou'); setNouVazut(true); return; }
    void incarca(date, true);
  }, [incarca]);

  useEffect(() => {
    const t = setInterval(() => setAcum(Date.now()), CEAS_MS);
    return () => clearInterval(t);
  }, []);

  const alege = (f: Fila) => { setFila(f); if (f === 'nou') setNouVazut(true); window.scrollTo(0, 0); };
  const contact = ecran.tip === 'gata' && ecran.stare.ok ? ecran.stare.contact : null;

  return (
    <div lang={locale} className="tg-app" style={{ ['--bg' as string]: FUNDAL }}>
      <style>{`
.tg-app{min-height:100vh;font-family:var(--font-main),Roboto,system-ui,sans-serif;color:#231A1C}
.tg-fila{min-height:100vh;background:var(--bg);box-sizing:border-box;
  padding:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 96px)}
.tg-cauta{padding-top:calc(max(env(safe-area-inset-top,0px),var(--tg-safe-area-inset-top,0px)) + var(--tg-content-safe-area-inset-top,0px));padding-bottom:calc(env(safe-area-inset-bottom,0px) + 72px)}
.tg-col{max-width:520px;margin:0 auto;display:grid;gap:16px}
.tg-buton{min-height:48px;padding:0 16px;border-radius:12px;border:none;background:${RED};color:#fff;font:700 16px var(--font-main),Roboto,sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.tg-nota{margin:0;padding:12px 14px;border-radius:14px;background:#fff;color:#555;font-size:14px;line-height:1.45}
.tg-bara{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-template-columns:repeat(3,1fr);background:rgba(255,255,255,.96);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid rgba(155,27,48,.15);box-shadow:0 -4px 20px rgba(155,27,48,.06);
  padding:6px 8px calc(env(safe-area-inset-bottom,0px) + 6px)}
.tg-tab{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:52px;justify-content:center;border:none;background:none;cursor:pointer;
  color:rgba(35,26,28,.5);font:700 11.5px var(--font-main),Roboto,sans-serif;border-radius:14px}
.tg-tab[aria-selected="true"]{color:${RED};background:rgba(155,27,48,.08)}
.tg-ist{background:#fff;border-radius:18px;overflow:hidden}
.tg-ist-rand{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #F1E8EA}
.tg-ist-rand:last-child{border-bottom:none}
.tg-ist-data{flex-shrink:0;width:54px;text-align:center;font-weight:800;color:${RED};line-height:1.1}
.tg-ist-data small{display:block;font-size:11px;font-weight:600;color:#8A7B7F}
.tg-ist-info{flex:1;min-width:0;display:grid;gap:2px}
.tg-ist-info b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tg-ist-info span{font-size:12.5px;color:#6B5B5F}
.tg-ist-stare{flex-shrink:0;font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px}
`}</style>
      <EcranCompletTelegram />

      {fila === 'bilete' && <FilaBilete ecran={ecran} acum={acum} locale={locale} onNou={() => alege('nou')} onReincearca={() => initData && void incarca(initData)} />}

      {fila === 'istoric' && (
        <div className="tg-fila">
          <div className="tg-col">
            <Antet titlu={`🕘 ${tx.istoricTitlu}`} />
            <Istoric ecran={ecran} acum={acum} locale={locale} />
            <Ajutor locale={locale} />
          </div>
        </div>
      )}

      {nouVazut && (
        <div className="tg-cauta" style={{ display: fila === 'nou' ? 'block' : 'none' }}>
          <HomePage locale={locale} options={options} telegram={{ contact }} />
        </div>
      )}

      <nav className="tg-bara" role="tablist" aria-label="TRANSLUX">
        {FILE.map((f) => (
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

/** Iconițele barei de jos: bilet cu punct pe hartă, lupă, ceas (linie, ca pe site). */
function IconFila({ fila }: { fila: Fila }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (fila === 'bilete') return <svg {...p}><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2.5" /></svg>;
  if (fila === 'nou') return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

/** Stările comune (încărcare, fără Telegram, erori); null = datele sunt aici. */
function StareComuna({ ecran, locale, onReincearca }: { ecran: Ecran; locale: Locale; onReincearca?: () => void }) {
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
  if (stare.ok) return null;
  if (stare.eroare === 'expirat' || stare.eroare === 'neautentificat') return <p className="tg-nota" role="alert">{stare.eroare === 'expirat' ? tx.expirat : tx.faraTelegram}</p>;
  return (
    <div className="tg-nota" role="alert" style={{ display: 'grid', gap: 10 }}>
      <span>{tx.indisponibil}</span>
      {onReincearca && <button type="button" className="tg-buton" onClick={onReincearca}>{tx.reincearca}</button>}
    </div>
  );
}

/**
 * Fila 1 «Biletele mele»: cursa de azi (în fereastra hărții) = fereastra «Acum» de pe site doar cu cursa din bilet și
 * biletul micșorat jos; altfel biletele viitoare, micșorate, fără hartă.
 */
function FilaBilete({ ecran, acum, locale, onNou, onReincearca }: { ecran: Ecran; acum: number; locale: Locale; onNou: () => void; onReincearca: () => void }) {
  const tx = TXT[locale];
  const comun = <StareComuna ecran={ecran} locale={locale} onReincearca={onReincearca} />;
  // ION-252: biletul cu cursa încheiată (sosirea + 30 min) trece în «Istoric» și nu mai stă aici.
  const bilete = ecran.tip === 'gata' && ecran.stare.ok
    ? bileteNeincheiate(ecran.stare.bilete, acum).filter((c) => c.status === 'platita' && bileteDeAratat(c).length > 0)
    : null;
  const azi = bilete?.find((c) => ['curand', 'activa'].includes(fereastraHartii(c, acum)));
  if (azi) {
    const plecare = oraChisinau(azi.departure_at);
    return <NowResults key={azi.cod} from={azi.from_name} to={azi.to_name} fromValue={azi.from_name} toValue={azi.to_name} locale={locale}
      onClose={() => {}} incorporat plecareMea={plecare} doarCursa={{ departure: plecare, routeId: azi.ruta?.id ?? null }}
      panou={(t) => <BiletMini comanda={azi} cursa={t} locale={locale} />} />;
  }
  return (
    <div className="tg-fila">
      <div className="tg-col">
        <Antet titlu={`🎫 ${tx.titlu}`} />
        {bilete === null ? comun : bilete.length === 0 ? (
          <div className="tg-nota" style={{ display: 'grid', gap: 10 }}>
            <span>{tx.gol}</span>
            <button type="button" className="tg-buton" onClick={onNou}>{tx.spreNou}</button>
          </div>
        ) : bilete.map((c) => <BiletMini key={c.cod} comanda={c} cursa={null} locale={locale} aziHarta={false} />)}
        <Ajutor locale={locale} />
      </div>
    </div>
  );
}

/** Fila 3 «Istoric»: toate călătoriile contului, cele mai noi întâi — data, ruta, locurile, suma, starea. */
function Istoric({ ecran, acum, locale }: { ecran: Ecran; acum: number; locale: Locale }) {
  const tx = TXT[locale];
  if (!(ecran.tip === 'gata' && ecran.stare.ok)) return <StareComuna ecran={ecran} locale={locale} />;
  const lista: CalatorieIstoric[] = ecran.stare.istoric;
  if (lista.length === 0) return <p className="tg-nota">{tx.istoricGol}</p>;
  // ION-252: «Activ» cât cursa nu s-a încheiat (și după plecare, până la sosire + 30 min), apoi «Efectuată».
  const neincheiate = new Set(bileteNeincheiate(ecran.stare.bilete, acum).map((b) => b.cod));
  const stareDe = (c: CalatorieIstoric): { text: string; fundal: string; culoare: string } => {
    if (c.status === 'anulata') return { text: tx.stari.anulata, fundal: '#F6ECEE', culoare: RED };
    if (c.status === 'returnata') return { text: tx.stari.returnata, fundal: '#F6ECEE', culoare: RED };
    if (c.status === 'platita_fara_bilet') return { text: tx.stari.verificare, fundal: '#FFF4DA', culoare: '#8a6d00' };
    if (neincheiate.has(c.cod) || Date.parse(c.departure_at) > acum) return { text: tx.stari.activ, fundal: '#e3f3e8', culoare: '#1b7f3b' };
    return { text: tx.stari.efectuata, fundal: '#ececec', culoare: '#555' };
  };
  const loc = locale === 'ru' ? 'ru-RU' : 'ro-RO';
  return (
    <div className="tg-ist">
      {lista.map((c) => {
        const d = new Date(c.departure_at);
        const st = stareDe(c);
        return (
          <div key={c.cod} className="tg-ist-rand">
            <div className="tg-ist-data">
              {d.toLocaleDateString(loc, { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit' })}
              <small>{d.toLocaleDateString(loc, { timeZone: 'Europe/Chisinau', year: 'numeric' })}</small>
            </div>
            <div className="tg-ist-info">
              <b>{c.from_name} → {c.to_name}</b>
              <span>{oraChisinau(c.departure_at)} · {tx.locuri(c.seats)} · {Math.round(c.total)} MDL</span>
            </div>
            <span className="tg-ist-stare" style={{ background: st.fundal, color: st.culoare }}>{st.text}</span>
          </div>
        );
      })}
    </div>
  );
}

const TXT_MINI = {
  ro: { aici: 'Autobuzul e la oprirea ta', vine: (m: number, ora: string) => `Vine în ${m} min · ${ora}`, nuEPeDrum: 'Autobuzul încă nu e pe drum', inDrum: (spre: string) => `În drum spre ${spre}`, locul: 'Locul', suna: 'Sună șoferul', apasaSuna: 'Apasă ca să suni', azi: 'Azi', maine: 'Mâine', sofer: 'șofer', astept: 'Mașina și șoferul apar după ce dispecerul face graficul', anulat: 'Cursa a fost anulată — sună la +373 60 401 010' },
  ru: { aici: 'Автобус на вашей остановке', vine: (m: number, ora: string) => `Будет через ${m} мин · ${ora}`, nuEPeDrum: 'Автобус ещё не в пути', inDrum: (spre: string) => `В пути в ${spre}`, locul: 'Место', suna: 'Позвонить водителю', apasaSuna: 'Нажмите, чтобы позвонить', azi: 'Сегодня', maine: 'Завтра', sofer: 'водитель', astept: 'Автобус и водитель появятся, когда диспетчер составит график', anulat: 'Рейс отменён — звоните +373 60 401 010' },
} as const;

/**
 * Biletul micșorat din partea de jos a hărții (ION-249, Ion 05.10: «biletul cu QR, minimizat, cu datele mașinii, stilat»):
 * ruta și orele, când vine autobuzul la oprirea omului, șoferul, mașina și apelul, locul și QR-ul mic (QR-ul mare e doar
 * în chat — Ion, 05.10). Pe biletul altei zile, în locul stării stă ziua cursei.
 */
function BiletMini({ comanda: c, cursa, locale, aziHarta = true }: { comanda: ComandaPublica; cursa: NowTrip | null; locale: Locale; aziHarta?: boolean }) {
  const tx = TXT_MINI[locale];
  const b = bileteDeAratat(c)[0];
  // După plecare (autobuzul a trecut de oprirea omului) — «În drum spre …», nu «încă nu e pe drum».
  const plecat = Date.parse(c.departure_at) <= Date.now();
  const stare = !aziHarta ? ziCursa(c.trip_date, locale, tx.azi, tx.maine)
    : cursa?.plecata || (!cursa && plecat) ? tx.inDrum(c.to_name)
    : !cursa ? tx.nuEPeDrum : cursa.at_stop?.mine ? tx.aici : tx.vine(Math.max(0, cursa.eta_min ?? cursa.minutes_until), cursa.eta ?? cursa.departure);
  // Echipajul cursei (migr. 538, Ion 08.10): din comandă, după bifa dispecerului; harta dă doar poziția autobuzului.
  const e = c.echipaj;
  const masina = e?.stare === 'gata' ? [e.placa, e.sofer ? `${tx.sofer} ${e.sofer}` : null].filter(Boolean).join(' · ')
    : !e && cursa ? [cursa.driver, cursa.plate].filter(Boolean).join(' · ') : '';
  const notaEchipaj = e?.stare === 'astept' ? tx.astept : e?.stare === 'anulat' ? tx.anulat : null;
  const telefon = e ? e.telefon : cursa?.phone ?? null;
  return (
    <div className="tg-mini">
      <style>{`
.tg-mini{background:#fff;border-radius:22px;box-shadow:0 12px 32px rgba(40,10,18,.18);overflow:hidden;font-family:var(--font-main),Roboto,sans-serif;color:#231A1C}
.tg-mini-sus{display:flex;align-items:center;gap:12px;padding:14px 14px 12px 18px;background:${RED};color:#fff}
.tg-mini-ore{flex:1;min-width:0}
.tg-mini-ore b{font-size:22px;font-weight:800;letter-spacing:-.3px}
.tg-mini-ore span{display:block;font-size:13px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tg-mini-stare{font-size:14px;font-weight:700;background:rgba(255,255,255,.18);border-radius:999px;padding:6px 10px;white-space:nowrap}
.tg-mini-jos{display:flex;align-items:center;gap:12px;padding:12px 14px 14px 18px}
.tg-mini-date{flex:1;min-width:0;display:grid;gap:3px;font-size:13px;color:#6B5B5F}
.tg-mini-date strong{font-size:15px;color:#231A1C}
.tg-mini-suna-nota{display:block;margin-top:4px;font-size:12px;color:#888;text-decoration:underline}
.tg-mini-suna{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:7px 12px;border-radius:999px;background:#e3f3e8;color:#1b7f3b;font-weight:700;font-size:15px;text-decoration:none}
.tg-mini-qr{flex-shrink:0;width:84px;height:84px;border-radius:12px;border:1px solid #F1E8EA;padding:4px;background:#fff}
.tg-mini-qr svg{width:100%;height:100%;display:block}
`}</style>
      <div>
        <div className="tg-mini-sus">
          <div className="tg-mini-ore">
            <b>{oraChisinau(c.departure_at)} → {c.sosire ?? '—:—'}</b>
            <span>{c.from_name} → {c.to_name}</span>
          </div>
          <span className="tg-mini-stare">{stare}</span>
        </div>
        <div className="tg-mini-jos">
          <div className="tg-mini-date">
            {masina && <strong>🚌 {masina}</strong>}
            {notaEchipaj && <span>{notaEchipaj}</span>}
            {b && <span>{b.loc_nr != null ? <>{tx.locul} {b.loc_nr} · </> : null}{c.passenger_name}</span>}
            {telefon && <a className="tg-mini-suna" href={phoneTel(telefon)}
              onClick={(ev) => { if (suna(phoneTel(telefon).replace(/\D/g, ''))) ev.preventDefault(); }}>📞 {phoneText(telefon)}</a>}
            {telefon && <a className="tg-mini-suna-nota" href={phoneTel(telefon)}
              onClick={(ev) => { if (suna(phoneTel(telefon).replace(/\D/g, ''))) ev.preventDefault(); }}>{tx.apasaSuna}</a>}
          </div>
          {/* SVG-ul QR vine de la panou, generat din codul biletului (nu din text de la utilizator). */}
          {b && <div className="tg-mini-qr" aria-label="QR" dangerouslySetInnerHTML={{ __html: b.qr_svg }} />}
        </div>
      </div>
    </div>
  );
}
