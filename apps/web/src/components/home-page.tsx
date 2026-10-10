'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { FirmaSiPlati } from '@/components/legal/FirmaSiPlati';

const ShaderBackground = dynamic(
  () => import('@/components/ui/shader-background'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh', zIndex: 0,
        background: 'linear-gradient(135deg, #fff 0%, #f5f5f6 100%)',
      }} />
    ),
  }
);

// ION-204 (Ion, 03.10, planul «site ultrafast», punctul 3): pagina principală hidrata asistentul,
// harta, calendarul și rezultatele înainte ca formularul să meargă. Acum chunk-ul inițial are
// doar formularul; fiecare fereastră se încarcă la prima interacțiune (butonul asistentului,
// «Acum», «Mai târziu», rezultatele). Funcțiile de încărcare stau separat ca să le putem
// chema și înainte (la prima atingere a formularului), iar chunk-ul să fie deja în cache
// când omul apasă. CSS-ul Leaflet vine cu NowResults/BusMap, nu cu pagina.
const loadNowResults = () => import('@/components/NowResults').then((m) => m.NowResults);
const loadRouteResults = () => import('@/components/ui/route-results').then((m) => m.RouteResults);
const loadMiniCalendar = () => import('@/components/ui/mini-calendar').then((m) => m.MiniCalendar);
const loadAssistant = () => import('@/components/AssistantWidget');
const loadCookieConsent = () => import('@/components/CookieConsent');
const NowResults = dynamic(loadNowResults, { ssr: false });
const RouteResults = dynamic(loadRouteResults, { ssr: false });
// Tur-retur (plan 10.10): fluxul în 3 pași, încărcat doar când e nevoie.
const PromoExplicatie = dynamic(() => import('@/components/ui/promo-explicatie').then((m) => m.PromoExplicatie), { ssr: false });
const TurReturFlux = dynamic(() => import('@/components/ui/tur-retur-flux').then((m) => m.TurReturFlux), { ssr: false });
const MiniCalendar = dynamic(loadMiniCalendar, { ssr: false });
const AssistantWidget = dynamic(loadAssistant, { ssr: false });
const CookieConsent = dynamic(loadCookieConsent, { ssr: false });
import { AssistantLauncher, TEASER_CLOSED_KEY } from '@/components/assistant-launcher';
import { openConsentSettings, readConsent } from '@/lib/consent';
import { track } from '@/lib/track';
import { type Locale, t } from '@/lib/i18n';
import { homePath, slugify } from '@/lib/seo-paths';
import type { HomeOptions, HomePopular } from '@/lib/home-props';
import { searchTrips, type TripResult } from '@/app/(public)/actions';
import { perechePromo } from '@translux/db';
import type { ContactPrecompletat } from '@/lib/telegram-client';
import LogoTranslux from './logo-translux';

interface HomePageProps {
  locale: Locale;
  /** Opțiunile selectoarelor, sortate pe server (lib/home-props.ts, ION-204). */
  options?: HomeOptions;
  /** «Destinații populare», cu numele în limba paginii și linkul gata ales. */
  popular?: HomePopular[];
  /** Paginile de direcție (ION-153), randate pe server; goală când baza n-a răspuns. */
  routeLinks?: { key: string; href: string; label: string }[];
  /** Chișinău → fiecare sat din nord, cu pagină proprie (ION-153). */
  localityLinks?: { key: string; href: string; label: string }[];
  /**
   * ION-249 (Ion, 05.10: «3 file diferite și toate ca în site… designul să fie la fel»): fila «Caută» din mini app-ul
   * Telegram e chiar pagina aceasta — fără antet cu limbă, subsol, asistent și cookie-uri; cumpărarea vine cu numele
   * și telefonul contului precompletate. Lipsă = site-ul ca până acum.
   */
  telegram?: { contact: ContactPrecompletat | null };
}

/** «2026-10-03» din data locală — ce făcea date-fns `format(d, 'yyyy-MM-dd')`, fără cei ~10 KB ai lui. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EMPTY_OPTIONS: HomeOptions = { major: [], minor: [] };

export function HomePage({ locale, options = EMPTY_OPTIONS, popular = [], routeLinks = [], localityLinks = [], telegram }: HomePageProps) {
  const [showResults, setShowResults] = useState(false);
  const [toateSatele, setToateSatele] = useState(false);
  // satele care n-au deja o rută cu aceeași pagină în listă
  const satele = localityLinks.filter((l) => !routeLinks.some((r) => r.href === l.href));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Câte ture a făcut săgeata de inversare — se rotește la fiecare apăsare, ca omul să vadă că s-a schimbat.
  const [swapTurns, setSwapTurns] = useState(0);
  const [trips, setTrips] = useState<TripResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [now, setNow] = useState<{ from: string; to: string; fromLabel: string; toLabel: string } | null>(null);
  // Asistentul: montat (chunk-ul încărcat) și deschis — două lucruri diferite (ION-204).
  const [assistant, setAssistant] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Notificarea cookie: montată doar la prima vizită sau din «Setări cookie».
  const [cookie, setCookie] = useState<null | 'auto' | 'settings'>(null);
  // Tur-retur din bara de căutare (Ion, 10.10.2026: «am nevoie să fie în bara de căutare returul»): doar pe Bălți ⇄
  // Chișinău (promoția −20% la retur). Calendarul cere întâi ziua turului, apoi ziua întoarcerii (≤ 30 de zile).
  const [esteBalti, setEsteBalti] = useState(false);
  const [cuRetur, setCuRetur] = useState(false);
  const [dataRetur, setDataRetur] = useState<string | null>(null);
  // Ion, 10.10: «la data tur-retur pune același calendar ca la Mai târziu» — fereastra «Când pleci?» pentru ambele câmpuri.
  const [calPentru, setCalPentru] = useState<null | 'plecare' | 'intoarcere'>(null);
  // Plan tur-retur (10.10): numărul de pasageri se alege odată cu zilele, nu abia la plată.
  const [pasageri, setPasageri] = useState(1);
  // Ion, 10.10: «când bifez tur-retur −20% să apară alegerea datei … clientul se va pierde» — două câmpuri vizibile.
  const [ziPlecare, setZiPlecare] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); });
  const [ziIntoarcere, setZiIntoarcere] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return ymd(d); });
  const fromRef = useRef<HTMLSelectElement>(null);
  const toRef = useRef<HTMLSelectElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const warmed = useRef(false);
  const i = t(locale);

  // Prima atingere a formularului: ferestrele «Acum», calendarul și rezultatele se aduc în
  // cache, ca apăsarea de după să le deschidă pe loc.
  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    void loadNowResults(); void loadMiniCalendar(); void loadRouteResults();
  }, []);

  const openAssistant = () => { setAssistant(true); setAssistantOpen(true); };

  useEffect(() => {
    if (telegram) return; // în mini app: fără notificarea cookie și fără asistent
    if (!readConsent()) setCookie('auto');
    // Asistentul se montează și nechemat, când browserul are timp liber, ca invitația lui
    // («Sunt asistentul care te ajută…», ION-39) să apară ca până acum — dar nu pentru cine
    // a închis-o deja: acela îl primește abia la apăsare.
    let closed = false;
    try { closed = localStorage.getItem(TEASER_CLOSED_KEY) === '1'; } catch { /* nimic */ }
    if (closed) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setAssistant(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const tm = setTimeout(() => setAssistant(true), 1500);
    return () => clearTimeout(tm);
  }, []);

  /** Direcția aleasă, sau null — atunci browserul arată ce câmp lipsește. */
  const direction = () => {
    const from = fromRef.current?.value;
    const to = toRef.current?.value;
    if (!from || !to || from === to) {
      if (!from) fromRef.current?.reportValidity();
      else if (!to) toRef.current?.reportValidity();
      return null;
    }
    return { from, to };
  };

  const openNow = () => {
    const d = direction();
    if (!d) return;
    // O singură dată la deschidere; fereastra se reîmprospătează singură, reîmprospătările nu se numără (ION-102).
    track({ event_type: 'now', from_locality: d.from, to_locality: d.to });
    setNow({
      ...d,
      fromLabel: fromRef.current?.selectedOptions[0]?.text || d.from,
      toLabel: toRef.current?.selectedOptions[0]?.text || d.to,
    });
  };

  const openLater = () => {
    if (direction()) setCalendarOpen(!calendarOpen);
  };
  // Ofertele de pe prima pagină (Ion, 10.10.2026: «separat meniu între destinații populare și căutare, pe prima pagină,
  // deodată cum s-a deschis site-ul pe mobile»): un card pune Chișinău → Bălți în bară; «Tur-retur» comută și pe tur-retur.
  // Ion, 10.10: apăsarea unei promoții deschide întâi fereastra care explică reducerea; butonul ei pune perechea în bară.
  const [explicaPromo, setExplicaPromo] = useState<'tur-retur' | 'student' | null>(null);
  const inainteDe1310 = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' }) < '2026-10-13';
  const alegeOferta = (tip: 'tur-retur' | 'student') => {
    const pune = (ref: React.RefObject<HTMLSelectElement | null>, slug: string) => {
      const o = ref.current ? [...ref.current.options].find((x) => x.value && slugify(x.value) === slug) : undefined;
      if (o && ref.current) ref.current.value = o.value;
    };
    if (!fromRef.current?.value || !toRef.current?.value || !perechePromo(fromRef.current.value, toRef.current.value)) {
      pune(fromRef, 'chisinau'); pune(toRef, 'balti');
    }
    setEsteBalti(perechePromo(fromRef.current?.value || '', toRef.current?.value || ''));
    setCuRetur(tip === 'tur-retur'); setDataRetur(null);
    fromRef.current?.closest('.hero-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const verificaPerechea = () => setEsteBalti(perechePromo(fromRef.current?.value || '', toRef.current?.value || ''));
  /** Ziua aleasă în calendar (doar turul; tur-returul are câmpurile lui sub bară). */
  const alegeZi = (d: Date) => {
    if (calPentru) {
      const x = ymd(d);
      if (calPentru === 'plecare') {
        setZiPlecare(x);
        if (ziIntoarcere < x || ziIntoarcere > plusZile(x, 30)) setZiIntoarcere(plusZile(x, 2));
      } else {
        setZiIntoarcere(x < ziPlecare ? ziPlecare : x > plusZile(ziPlecare, 30) ? plusZile(ziPlecare, 30) : x);
      }
      setCalPentru(null);
      return;
    }
    setDataRetur(null); setSelectedDate(d); setCalendarOpen(false); runSearch(d);
  };
  const ziScurta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'ro-RO', { weekday: 'short', day: 'numeric', month: 'long' });
  const plusZile = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
  /** «Caută tur-retur»: ziua turului din câmpul «Plecare», ziua întoarcerii merge în formularul de cumpărare. */
  const cautaTurRetur = () => {
    if (!direction()) return;
    const ret = ziIntoarcere < ziPlecare ? ziPlecare : ziIntoarcere > plusZile(ziPlecare, 30) ? plusZile(ziPlecare, 30) : ziIntoarcere;
    setZiIntoarcere(ret); setDataRetur(ret);
    const d = new Date(`${ziPlecare}T12:00:00`);
    setSelectedDate(d); runSearch(d);
  };


  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    openLater();
  };

  const runSearch = async (date: Date) => {
    const d = direction();
    if (!d) return;
    const { from, to } = d;

    setSearching(true);
    try {
      const results = await searchTrips(from, to, ymd(date));
      setTrips(results);
      setShowResults(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Venit de pe o pagină de direcție (/ro/autobuz/…) cu ?dela=<slug>&spre=<slug>: direcția e
  // gata aleasă, omul apasă doar «Acum» sau «Mai târziu». Căutarea NU pornește singură (ION-153):
  // Googlebot rulează JS și ar scrie în search_log la fiecare link.
  // Slug-ul se potrivește cu opțiunea al cărei nume RO dă același slug (ION-204): fără lista
  // din seo.ts în browser; prinde și satele (paginile Chișinău → sat trimit la fel, ION-153).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const pick = (ref: React.RefObject<HTMLSelectElement | null>, slug: string | null) => {
      if (!slug || !ref.current) return;
      const o = [...ref.current.options].find((o) => o.value && slugify(o.value) === slug);
      if (o) ref.current.value = o.value;
    };
    pick(fromRef, q.get('dela'));
    pick(toRef, q.get('spre'));
    setEsteBalti(perechePromo(fromRef.current?.value || '', toRef.current?.value || ''));
  }, []);

  const optgroups = (
    <>
      {options.major.length > 0 && (
        <optgroup label={locale === 'ru' ? 'Основные' : 'Principale'}>
          {options.major.map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </optgroup>
      )}
      {options.minor.length > 0 && (
        <optgroup label={locale === 'ru' ? 'Все остановки' : 'Toate stațiile'}>
          {options.minor.map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <div lang={locale} style={{ minHeight: '100vh', position: 'relative', fontFamily: 'var(--font-opensans), Open Sans, sans-serif' }}>
      <ShaderBackground />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {!telegram && <header className="site-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 40px' }}>
          {/* Legăturile interne prin next/link (ION-203): navigare pe client, cu prefetch; tel: și externele rămân <a>. */}
          <Link href={homePath(locale)} aria-label="TRANSLUX">
            <LogoTranslux className="site-logo" height={36} />
          </Link>

          {/* Limba: sus, în antet (ION-39) — colțul de jos e al asistentului */}
          {!telegram && <div className="lang-toggle-3d" style={{
            display: 'flex', gap: 2,
            borderRadius: 10, padding: 3,
          }}>
            <Link href="/" hrefLang="ro" className="lang-btn" style={{
              color: locale === 'ro' ? '#9B1B30' : 'rgba(155,27,48,0.35)',
              fontWeight: 700, fontSize: 11, letterSpacing: 1.2,
              textDecoration: 'none', padding: '5px 10px', borderRadius: 8,
              background: locale === 'ro' ? 'rgba(155,27,48,0.08)' : 'transparent',
              fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              transition: 'all 0.15s ease',
            }}>RO</Link>
            <Link href="/ru" hrefLang="ru" className="lang-btn" style={{
              color: locale === 'ru' ? '#9B1B30' : 'rgba(155,27,48,0.35)',
              fontWeight: 700, fontSize: 11, letterSpacing: 1.2,
              textDecoration: 'none', padding: '5px 10px', borderRadius: 8,
              background: locale === 'ru' ? 'rgba(155,27,48,0.08)' : 'transparent',
              fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              transition: 'all 0.15s ease',
            }}>RU</Link>
          </div>}
        </header>}

        <section style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 'calc(100vh - 72px)',
          padding: '0 20px', paddingBottom: '8vh',
        }}>

          <div className="hero-card" style={{
            width: '100%', maxWidth: 720,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 24, padding: '40px 36px 32px',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 8px 40px rgba(155,27,48,0.08), 0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <h1 style={{
              color: '#9B1B30', fontSize: 28, fontStyle: 'italic', textAlign: 'center',
              fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              margin: '0 0 28px', fontWeight: 400, letterSpacing: 0.5, lineHeight: 1.3,
            }}>
              {i.hero}
            </h1>

            {/* Varianta B (Ion, 10.10.2026: «hai să încercăm B»): comutatorul «Doar tur | Tur-retur» stă deasupra orașelor,
                ca la companiile aeriene; la «Tur-retur» dispar Acum / Mai târziu și rămâne un singur buton «Caută tur-retur». */}
            {esteBalti && (
              <div className="tr-seg-sus">
                <div className="tr-seg" role="radiogroup" aria-label={locale === 'ru' ? 'Тип поездки' : 'Tipul călătoriei'}>
                  <button type="button" role="radio" aria-checked={!cuRetur} className={!cuRetur ? 'on' : ''} onClick={() => { setCuRetur(false); setDataRetur(null); }}>
                    {locale === 'ru' ? 'Только туда' : 'Doar tur'}
                  </button>
                  <button type="button" role="radio" aria-checked={cuRetur} className={cuRetur ? 'on' : ''} onClick={() => { setCuRetur(true); setDataRetur(null); }}>
                    {locale === 'ru' ? 'Туда-обратно' : 'Tur-retur'} <span className="tr-badge">−20%</span>
                  </button>
                </div>
              </div>
            )}
            <form onSubmit={handleSearch} onPointerDown={warm} onFocus={warm} className="hero-form" style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            }}>
              {/* FROM */}
              <div style={{ position: 'relative', flex: '1 1 0', width: 0 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', zIndex: 1, color: '#9B1B30', opacity: 0.5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
                </span>
                <select ref={fromRef} name="dela" required onChange={verificaPerechea} className="hero-select" style={{
                  width: '100%', height: 48, border: '1px solid rgba(155,27,48,0.1)', borderRadius: 12,
                  padding: '0 16px 0 34px', fontSize: 15, background: 'rgba(255,255,255,0.85)',
                  outline: 'none', fontStyle: 'italic', appearance: 'none',
                  color: '#6E0E14', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  transition: 'box-shadow 0.2s ease', cursor: 'pointer',
                }}>
                  <option value="">{i.from}</option>
                  {optgroups}
                </select>
              </div>

              {/* SWAP */}
              <button type="button" className="hero-swap" style={{
                flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9B1B30', fontSize: 18,
                transition: 'transform 0.15s ease',
              }} aria-label={i.swap} title={i.swap} onClick={() => {
                if (fromRef.current && toRef.current) {
                  const tmp = fromRef.current.value;
                  fromRef.current.value = toRef.current.value;
                  toRef.current.value = tmp;
                }
                setSwapTurns((n) => n + 1);
                verificaPerechea();
              }}>
                {/* Pe telefon .hero-swap-ico e rotit 90° (câmpurile stau unul sub altul). */}
                <span className="hero-swap-ico" style={{ display: 'flex' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    style={{ transform: `rotate(${swapTurns * 180}deg)`, transition: 'transform 0.3s ease' }}>
                    <path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" />
                  </svg>
                </span>
              </button>

              {/* TO */}
              <div style={{ position: 'relative', flex: '1 1 0', width: 0 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', zIndex: 1, color: '#9B1B30', opacity: 0.5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
                </span>
                <select ref={toRef} name="spre" required onChange={verificaPerechea} className="hero-select" style={{
                  width: '100%', height: 48, border: '1px solid rgba(155,27,48,0.1)', borderRadius: 12,
                  padding: '0 16px 0 34px', fontSize: 15, background: 'rgba(255,255,255,0.85)',
                  outline: 'none', fontStyle: 'italic', appearance: 'none',
                  color: '#6E0E14', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  transition: 'box-shadow 0.2s ease', cursor: 'pointer',
                }}>
                  <option value="">{i.to}</option>
                  {optgroups}
                </select>
              </div>

              {/* Acum / Mai târziu (ION-43): omul alege direcția, apoi când pleacă.
                  «Mai târziu» deschide calendarul; ziua aleasă rulează căutarea de până acum. */}
              <div ref={calRef} className="hero-actions" style={{ position: 'relative', flexShrink: 0, display: esteBalti && cuRetur ? 'none' : 'flex', gap: 8 }}>
                <button type="button" onClick={openNow} className="hero-now search-btn-3d" style={{
                  flex: '1 1 0', height: 48, borderRadius: 12, padding: '0 20px', cursor: 'pointer',
                  fontWeight: 700, fontSize: 14, fontStyle: 'italic', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <span className="hero-now-dot" />
                  {i.now}
                </button>
                <button type="button" onClick={openLater} className="hero-later" style={{
                  flex: '1 1 0', height: 48, borderRadius: 12, padding: '0 18px', cursor: 'pointer',
                  border: '1.5px solid #9B1B30', background: 'rgba(255,255,255,0.85)', color: '#9B1B30',
                  fontWeight: 700, fontSize: 14, fontStyle: 'italic', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {searching ? '...' : i.later}
                </button>
              </div>
            </form>
            {/* Tur-retur (Ion, 10.10.2026: «fă mai elegant datele pentru tur-retur»): comutator «Doar tur | Tur-retur −20%»,
                apoi un card cu cele două zile (ca pe site-urile de avion) și durata; fiecare zi deschide calendarul «Mai târziu». */}
            {esteBalti && (
              <div className="tr-wrap">
                {cuRetur && (() => {
                  const zi = (iso: string) => {
                    const d = new Date(`${iso}T12:00:00`);
                    const loc = locale === 'ru' ? 'ru-RU' : 'ro-RO';
                    return { nr: d.getDate(), luna: d.toLocaleDateString(loc, { month: 'long' }), sapt: d.toLocaleDateString(loc, { weekday: 'long' }) };
                  };
                  const zile = Math.round((Date.parse(`${ziIntoarcere}T12:00:00`) - Date.parse(`${ziPlecare}T12:00:00`)) / 86_400_000);
                  const durata = zile === 0 ? (locale === 'ru' ? 'в тот же день' : 'aceeași zi') : locale === 'ru' ? `${zile} дн.` : `${zile} ${zile === 1 ? 'zi' : 'zile'}`;
                  const jum = (k: 'plecare' | 'intoarcere', et: string, iso: string) => {
                    const z = zi(iso);
                    return (
                      <button type="button" className="tr-zi" onClick={() => setCalPentru(k)} aria-label={`${et}: ${z.sapt}, ${z.nr} ${z.luna}`}>
                        <span className="tr-et">{et}</span>
                        <span className="tr-data"><b>{z.nr}</b><span><span className="tr-luna">{z.luna}</span><span className="tr-sapt">{z.sapt}</span></span></span>
                      </button>
                    );
                  };
                  return (
                    <>
                      <div className="tr-card">
                        {jum('plecare', locale === 'ru' ? 'Туда' : 'Plecare', ziPlecare)}
                        <div className="tr-mij" aria-hidden="true">
                          <span className="tr-sag"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                          <span className="tr-dur">{durata}</span>
                        </div>
                        {jum('intoarcere', locale === 'ru' ? 'Обратно' : 'Întoarcere', ziIntoarcere)}
                      </div>
                      <div className="tr-pax">
                        <span>{locale === 'ru' ? 'Пассажиры' : 'Pasageri'}</span>
                        <div className="tr-pax-n">
                          <button type="button" aria-label="−" disabled={pasageri <= 1} onClick={() => setPasageri((n) => Math.max(1, n - 1))}>−</button>
                          <b aria-live="polite">{pasageri}</b>
                          <button type="button" aria-label="+" disabled={pasageri >= 4} onClick={() => setPasageri((n) => Math.min(4, n + 1))}>+</button>
                        </div>
                      </div>
                      <button type="button" className="tr-cauta" onClick={cautaTurRetur}>
                        {searching ? '...' : (locale === 'ru' ? 'Найти туда-обратно' : 'Caută tur-retur')}
                        <span>{locale === 'ru' ? 'обратный −20%, одна оплата' : 'returul −20%, o singură plată'}</span>
                      </button>
                    </>
                  );
                })()}
                <style>{`
.tr-wrap{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:14px;font-family:var(--font-opensans),Open Sans,sans-serif}
.tr-seg-sus{display:flex;justify-content:center;margin:0 0 12px}
.tr-seg{display:inline-flex;padding:4px;border-radius:999px;background:rgba(155,27,48,.07);gap:4px}
.tr-seg button{white-space:nowrap;border:none;background:transparent;color:#9B1B30;font:700 14px var(--font-opensans),Open Sans,sans-serif;padding:9px 18px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .15s,color .15s,box-shadow .15s}
.tr-seg button.on{background:#fff;color:#6E0E14;box-shadow:0 2px 8px rgba(155,27,48,.16)}
.tr-badge{font-size:11px;font-weight:800;color:#fff;background:#9B1B30;border-radius:999px;padding:2px 7px}
.tr-card{width:100%;max-width:520px;display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;background:#fff;border:1px solid rgba(155,27,48,.14);border-radius:18px;box-shadow:0 6px 22px rgba(155,27,48,.08);overflow:hidden}
.tr-zi{border:none;background:transparent;padding:12px 16px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:4px;font-family:inherit;transition:background .15s}
.tr-zi:hover{background:rgba(155,27,48,.04)}
.tr-zi:last-child{text-align:right;align-items:flex-end}
.tr-et{font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#9A8A8D}
.tr-data{display:flex;align-items:center;gap:8px;color:#231A1C}
.tr-zi:last-child .tr-data{flex-direction:row-reverse}
.tr-data b{font-size:30px;line-height:1;font-weight:800;color:#9B1B30}
.tr-data>span{display:flex;flex-direction:column;line-height:1.15}
.tr-zi:last-child .tr-data>span{align-items:flex-end}
.tr-luna{font-size:15px;font-weight:700}
.tr-sapt{font-size:12px;color:#8A7A7D;text-transform:capitalize}
.tr-mij{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0 6px;border-left:1px dashed rgba(155,27,48,.18);border-right:1px dashed rgba(155,27,48,.18)}
.tr-sag{width:32px;height:32px;border-radius:50%;background:#F6ECEE;color:#9B1B30;display:flex;align-items:center;justify-content:center}
.tr-dur{font-size:11px;font-weight:700;color:#8A7A7D;white-space:nowrap}
.tr-pax{width:100%;max-width:520px;display:flex;align-items:center;justify-content:space-between;padding:8px 6px 8px 16px;background:#fff;border:1px solid rgba(155,27,48,.14);border-radius:14px;font-size:14px;font-weight:700;color:#6B5B5F}
.tr-pax-n{display:flex;align-items:center;gap:10px}
.tr-pax-n button{width:38px;height:38px;border-radius:11px;border:1px solid rgba(155,27,48,.2);background:#fff;color:#9B1B30;font:700 19px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
.tr-pax-n button:disabled{color:#D6C8CB;cursor:default}
.tr-pax-n b{min-width:20px;text-align:center;font-size:18px;color:#231A1C}
.tr-cauta{width:100%;max-width:520px;min-height:52px;border:none;border-radius:14px;background:#9B1B30;color:#fff;font:800 16px var(--font-opensans),Open Sans,sans-serif;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 8px 20px rgba(155,27,48,.22);transition:filter .15s}
.tr-cauta:hover{filter:brightness(1.06)}
.tr-cauta span{font-size:12px;font-weight:600;opacity:.85}
@media (max-width:420px){.tr-seg button{padding:9px 13px;font-size:13.5px}.tr-zi{padding:10px 12px}.tr-data b{font-size:26px}.tr-luna{font-size:14px}}
`}</style>
              </div>
            )}
          </div>

          {/* Ofertele Bălți ⇄ Chișinău: între căutare și «Destinații populare», compacte ca să se vadă din primul ecran pe telefon. */}
          {!telegram && (
            <div className="of-wrap" aria-label={locale === 'ru' ? 'Скидки Бельцы ⇄ Кишинёв' : 'Reduceri Bălți ⇄ Chișinău'}>
              {/* Ion, 10.10: «încercuiește faptul că anume la cursele Bălți–Chișinău; menționează la cumpărare bilet online». */}
              {/* Ion, 10.10: «asta să fie inclus în detaliat de fiecare promoție, și apasă să afli mai mult pui pe deasupra» —
                  condițiile (doar Bălți ⇄ Chișinău, online, din 13.10) stau acum în fereastra fiecărei promoții. */}
              <p className="of-mai-mult">{locale === 'ru' ? 'Нажмите на скидку, чтобы узнать больше' : 'Apasă pe o reducere pentru a afla mai mult'}</p>
              <div className="of-grid">
                <button type="button" className="of-card tr" onClick={() => setExplicaPromo('tur-retur')}>
                  <b>−20%</b>
                  <span>{locale === 'ru' ? 'Туда-обратно' : 'Tur-retur'}</span>
                  <small>{locale === 'ru' ? 'скидка на обратный, одна оплата' : 'la retur, o singură plată'}</small>
                </button>
                <button type="button" className="of-card st" onClick={() => setExplicaPromo('student')}>
                  <b>−20%</b>
                  <span>{locale === 'ru' ? 'Студентам' : 'Studenți'}</span>
                  <small>{locale === 'ru' ? 'студенческий и паспорт, одно место, не для туда-обратно' : 'carnet și buletin, un loc, fără tur-retur'}</small>
                </button>
              </div>

              <style>{`
.of-wrap{width:100%;max-width:720px;margin-top:14px;display:flex;flex-direction:column;gap:8px;font-family:var(--font-opensans),Open Sans,sans-serif}
.of-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.of-card{all:unset;box-sizing:border-box;cursor:pointer;border-radius:18px;padding:12px 14px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;background:rgba(255,255,255,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(155,27,48,.12);box-shadow:0 6px 18px rgba(155,27,48,.07);transition:transform .15s,box-shadow .15s}
.of-card:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(155,27,48,.12)}
.of-card:focus-visible{outline:2px solid #9B1B30;outline-offset:2px}
.of-card b{grid-row:1/3;font-size:24px;font-weight:800;line-height:1;padding:8px 9px;border-radius:12px}
.of-card.tr b{background:#FDF3E1;color:#B7791F}
.of-card.st b{background:#EAF1F9;color:#2E5A88}
.of-card span{font-size:15px;font-weight:800;color:#231A1C;align-self:end}
.of-card small{font-size:12px;color:#7A6A6E;align-self:start;line-height:1.3}
.of-mai-mult{margin:0;font-size:13px;font-weight:700;color:#6B5B5F;text-align:center}
.of-nota{margin:0;font-size:13px;color:#2E5A88;background:rgba(234,241,249,.9);border-radius:12px;padding:9px 12px;text-align:center}
@media (max-width:420px){.of-card{grid-template-columns:1fr;grid-template-rows:auto;row-gap:2px;padding:11px 12px}.of-card b{grid-row:auto;justify-self:start;font-size:20px;padding:5px 8px;margin-bottom:4px}}
@media (prefers-reduced-motion:reduce){.of-card{transition:none}}
`}</style>
            </div>
          )}

          {/* Popular routes card — nu în mini app-ul Telegram (Ion: «doar motorul de căutare, nimic altul») */}
          {!telegram && <div className="routes-card" style={{
            width: '100%', maxWidth: 720, marginTop: 28,
            background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 24, padding: '24px 36px 28px',
            border: '1px solid rgba(255,255,255,0.4)',
            boxShadow: '0 4px 24px rgba(155,27,48,0.05)',
          }}>
            <h2 style={{
              color: '#9B1B30', fontSize: 17, fontStyle: 'italic', textAlign: 'center',
              fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              margin: '0 0 18px', fontWeight: 400, letterSpacing: 0.5,
            }}>
              {i.popular}
            </h2>

            <div className="popular-grid" style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: '0 48px', maxWidth: 520, margin: '0 auto',
            }}>
              {popular.map((r) => {
                // Numele și linkul (doar spre o pagină de direcție care există) vin gata de pe server (lib/home-props.ts).
                const routeName = r.name;
                const href = r.href;
                const Row = href ? 'a' : 'div';
                return (
                  <Row key={routeName} {...(href ? { href } : {})} className="route-row" style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 4px', borderBottom: '1px solid rgba(155,27,48,0.06)',
                    borderRadius: 4, transition: 'background 0.15s ease', textDecoration: 'none',
                  }}>
                    <span style={{
                      fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8,
                      fontWeight: 600, fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                    }}>
                      {routeName}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#9B1B30', marginLeft: 8, whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                    }}>
                      {r.price} LEI
                      {/* Ion, 10.10.2026: «sub prețul 150 la Bălți trebuie să fie indicat — la cumpărare online», font mic. */}
                      {href?.endsWith('/chisinau-balti') && (
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 400, letterSpacing: 0.2, textAlign: 'right', marginTop: 2 }}>
                          {locale === 'ru' ? 'при покупке онлайн' : 'la cumpărare online'}
                        </span>
                      )}
                    </span>
                  </Row>
                );
              })}
            </div>
          </div>}

          {/* Toate paginile de direcție (ION-153) și satele din nord (Ion, 01.10) într-un singur card
              (Ion, 10.10.2026: «unește toate locațiile nord și toate rutele TRANSLUX»). Rutele se văd;
              satele urmează în aceeași listă, strânse sub buton — sunt 70+, iar textul rămâne în HTML
              pentru Google. Satele fără prefetch, altfel s-ar descărca 70 de pagini la derulare (ION-203). */}
          {(routeLinks.length > 0 || satele.length > 0) && (
            <nav className={`all-routes${toateSatele ? ' sate-deschise' : ''}`} aria-label={i.allRoutes}>
              <h2>{i.allRoutes}</h2>
              <ul>
                {routeLinks.map((r) => (
                  <li key={r.key}><Link href={r.href}>{r.label}</Link></li>
                ))}
                {satele.map((r) => (
                  <li key={r.key} className="sat-nord"><Link href={r.href} prefetch={false}>{i.toLocality(r.label)}</Link></li>
                ))}
              </ul>
              {satele.length > 0 && (
                <button type="button" className="sate-toggle" aria-expanded={toateSatele} onClick={() => setToateSatele((v) => !v)}>
                  {i.allLocalities} ({satele.length}) {toateSatele ? '▴' : '▾'}
                </button>
              )}
            </nav>
          )}

        </section>

        {/* Footer */}
        {!telegram && <footer style={{ borderTop: '2px solid rgba(155,27,48,0.15)', background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}>
          <div style={{
            maxWidth: 720, margin: '0 auto', padding: '24px 36px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 20,
          }}>
            <div>
              <LogoTranslux height={20} style={{ opacity: 0.6 }} />
              <p style={{ fontSize: 13, color: '#555', margin: '6px 0 2px' }}>
                <a href="tel:+37360401010" style={{ color: '#555', textDecoration: 'none' }}>+373 60 401 010</a>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a href="https://www.facebook.com/TRANSPORTLUX" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="social-icon social-icon-3d" style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@translux.md" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="social-icon social-icon-3d" style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.52a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.3z"/></svg>
              </a>
            </div>
          </div>
          {/* Legal — Legea 195/2024: politica de confidențialitate, cookie-uri, redeschiderea notificării */}
          <div className="legal-links" style={{
            maxWidth: 720, margin: '0 auto', padding: '0 36px 18px',
            display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12,
          }}>
            <Link href={`/${locale}/confidentialitate`} style={{ color: '#777', textDecoration: 'none' }}>{i.privacy}</Link>
            <Link href={`/${locale}/cookies`} style={{ color: '#777', textDecoration: 'none' }}>{i.cookies}</Link>
            <Link href={`/${locale}/conditii-vanzare`} style={{ color: '#777', textDecoration: 'none' }}>{i.terms}</Link>
            <button type="button" onClick={() => { if (cookie) openConsentSettings(); else setCookie('settings'); }} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: '#777', fontSize: 12, fontFamily: 'inherit',
            }}>{i.cookieSettings}</button>
          </div>
          {/* ION-235: datele firmei și logourile plăților (cerințele maib). */}
          <div style={{ padding: "0 16px 18px" }}><FirmaSiPlati locale={locale} /></div>
        </footer>}

      </div>

      {cookie && <CookieConsent locale={locale} defaultOpen={cookie === 'settings'} />}

      {/* Asistentul AI (ION-37): colțul dreapta-jos, deasupra comutatorului de limbă.
          Butonul e al paginii; fereastra se încarcă la apăsare sau când browserul are timp liber (ION-204). */}
      {!assistantOpen && !telegram && <AssistantLauncher locale={locale} onClick={openAssistant} />}
      {assistant && <AssistantWidget locale={locale} open={assistantOpen} onOpenChange={setAssistantOpen} />}


      {explicaPromo && (
        <PromoExplicatie tip={explicaPromo} locale={locale} inainteDe1310={inainteDe1310}
          onAlege={() => alegeOferta(explicaPromo)} onClose={() => setExplicaPromo(null)} />
      )}

      {showResults && dataRetur && cuRetur && esteBalti && (
        <TurReturFlux
          from={fromRef.current?.selectedOptions[0]?.text || ''}
          to={toRef.current?.selectedOptions[0]?.text || ''}
          fromRo={fromRef.current?.value || ''}
          toRo={toRef.current?.value || ''}
          tripsTur={trips}
          dataRetur={dataRetur}
          pasageri={pasageri}
          locale={locale}
          onClose={() => setShowResults(false)}
          contact={telegram?.contact ?? null}
        />
      )}
      {showResults && !(dataRetur && cuRetur && esteBalti) && (
        <RouteResults
          from={fromRef.current?.selectedOptions[0]?.text || ''}
          to={toRef.current?.selectedOptions[0]?.text || ''}
          fromRo={fromRef.current?.value || ''}
          toRo={toRef.current?.value || ''}
          trips={trips}
          selectedTime={null}
          locale={locale}
          onClose={() => setShowResults(false)}
          contact={telegram?.contact ?? null}
        />
      )}

      {/* «Mai târziu» → «Când pleci?» (ION-43, Ion 23.09: «dacă apasă „Mai târziu", să ceară
          automat data»). Fereastră la rădăcina paginii: sub card, calendarul era acoperit de
          «Destinații populare» (animația fiecărui card îi face strat propriu). */}
      {(calendarOpen || calPentru) && (
        <div className="later-overlay" onClick={() => { setCalendarOpen(false); setCalPentru(null); }}>
          <div className="later-box" role="dialog" aria-modal="true" aria-label={i.when} onClick={(e) => e.stopPropagation()}>
            <div className="later-head">
              <span>{calPentru === 'intoarcere' ? (locale === 'ru' ? 'Когда возвращаетесь?' : 'Când te întorci?') : i.when}</span>
              <button type="button" className="later-close" aria-label="✕" onClick={() => { setCalendarOpen(false); setCalPentru(null); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="later-quick">
              {(calPentru === 'intoarcere' ? (locale === 'ru' ? ['В тот же день', '+1 день', '+2 дня'] : ['Aceeași zi', '+1 zi', '+2 zile']) : [i.today, i.tomorrow, i.afterTomorrow]).map((label, k) => (
                <button key={label} type="button" onClick={() => {
                  const d = calPentru === 'intoarcere' ? new Date(`${ziPlecare}T12:00:00`) : new Date(); d.setDate(d.getDate() + k);
                  alegeZi(d);
                }}>{label}</button>
              ))}
            </div>
            <MiniCalendar
              value={calPentru ? new Date(`${calPentru === 'plecare' ? ziPlecare : ziIntoarcere}T12:00:00`) : selectedDate}
              locale={locale}
              onChange={(d) => alegeZi(d)}
            />
          </div>
          <style>{`
.later-overlay{position:fixed;inset:0;z-index:60;background:rgba(40,12,18,.35);display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--font-opensans),Open Sans,sans-serif}
.later-box{width:100%;max-width:340px;background:#fff;border-radius:24px;padding:18px;box-shadow:0 30px 80px rgba(40,10,18,.3);display:flex;flex-direction:column;gap:14px}
.later-head{display:flex;align-items:center;justify-content:space-between;font-size:18px;font-weight:700;color:#231A1C}
.later-close{width:36px;height:36px;border-radius:50%;border:none;background:#F6ECEE;color:#9B1B30;display:flex;align-items:center;justify-content:center;cursor:pointer}
.later-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.later-quick button{height:44px;border-radius:12px;border:1.5px solid #9B1B30;background:#fff;color:#9B1B30;font:700 14px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
.later-quick button:first-child{background:#9B1B30;color:#fff}
.later-quick button:hover{filter:brightness(.96)}
`}</style>
        </div>
      )}

      {now && (
        <NowResults
          from={now.fromLabel}
          to={now.toLabel}
          fromValue={now.from}
          toValue={now.to}
          locale={locale}
          onClose={() => setNow(null)}
        />
      )}

    </div>
  );
}
