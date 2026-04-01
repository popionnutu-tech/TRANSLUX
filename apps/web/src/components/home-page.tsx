'use client';

import { useState, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { ro as roLocale, ru as ruLocale } from 'date-fns/locale';
import ShaderBackground from '@/components/ui/shader-background';
import { RainbowButton } from '@/components/ui/rainbow-borders-button';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import { RouteResults } from '@/components/ui/route-results';
import { type Locale, t } from '@/lib/i18n';
import { searchTrips, type Locality, type TripResult, type ActiveOffer } from '@/app/(public)/actions';

const popularRoutes = {
  ro: [
    { route: 'CHIȘINĂU - BĂLȚI', price: '120 LEI' },
    { route: 'CHIȘINĂU - EDINEȚ', price: '184 LEI' },
    { route: 'CHIȘINĂU - SÎNGEREI', price: '95 LEI' },
    { route: 'CHIȘINĂU - OCNIȚA', price: '216 LEI' },
    { route: 'CHIȘINĂU - OTACI', price: '241 LEI' },
    { route: 'CHIȘINĂU - BRICENI', price: '215 LEI' },
    { route: 'CHIȘINĂU - CUPCINI', price: '178 LEI' },
    { route: 'CHIȘINĂU - LIPCANI', price: '237 LEI' },
    { route: 'CHIȘINĂU - CORJEUȚI', price: '228 LEI' },
    { route: 'CHIȘINĂU - GRIMĂNCĂUȚI', price: '214 LEI' },
    { route: 'CHIȘINĂU - CRIVA', price: '249 LEI' },
    { route: 'CHIȘINĂU - LARGA', price: '229 LEI' },
  ],
  ru: [
    { route: 'КИШИНЁВ - БЭЛЦЬ', price: '120 LEI' },
    { route: 'КИШИНЁВ - ЕДИНЕЦ', price: '184 LEI' },
    { route: 'КИШИНЁВ - СЫНЖЕРЕЙ', price: '95 LEI' },
    { route: 'КИШИНЁВ - ОКНИЦА', price: '216 LEI' },
    { route: 'КИШИНЁВ - ОТАЧЬ', price: '241 LEI' },
    { route: 'КИШИНЁВ - БРИЧЕНЬ', price: '215 LEI' },
    { route: 'КИШИНЁВ - КУПЧИНЬ', price: '178 LEI' },
    { route: 'КИШИНЁВ - ЛИПКАНЬ', price: '237 LEI' },
    { route: 'КИШИНЁВ - КОРЖЕУЦЬ', price: '228 LEI' },
    { route: 'КИШИНЁВ - ГРИМЭНКЭУЦЬ', price: '214 LEI' },
    { route: 'КИШИНЁВ - КРИВА', price: '249 LEI' },
    { route: 'КИШИНЁВ - ЛАРГА', price: '229 LEI' },
  ],
};

interface HomePageProps {
  locale: Locale;
  localities?: Locality[];
  offers?: ActiveOffer[];
}

export function HomePage({ locale, localities = [], offers = [] }: HomePageProps) {
  const [showResults, setShowResults] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [trips, setTrips] = useState<TripResult[]>([]);
  const [searching, setSearching] = useState(false);
  const fromRef = useRef<HTMLSelectElement>(null);
  const toRef = useRef<HTMLSelectElement>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const i = t(locale);

  const sortedLocalities = useMemo(() => {
    const major = localities.filter(l => l.is_major).sort((a, b) => b.sort_order - a.sort_order);
    const minor = localities.filter(l => !l.is_major).sort((a, b) =>
      (locale === 'ru' ? a.name_ru : a.name_ro).localeCompare(locale === 'ru' ? b.name_ru : b.name_ro)
    );
    return { major, minor };
  }, [localities, locale]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const from = fromRef.current?.value;
    const to = toRef.current?.value;
    if (!from || !to || from === to) return;

    setSearching(true);
    try {
      const results = await searchTrips(from, to, format(selectedDate, 'yyyy-MM-dd'));
      setTrips(results);
      setShowResults(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const getName = (l: Locality) => locale === 'ru' ? l.name_ru : l.name_ro;

  return (
    <div style={{ minHeight: '100vh', position: 'relative', fontFamily: 'var(--font-opensans), Open Sans, sans-serif' }}>
      <style>{`
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-card { animation: heroFadeIn 0.7s ease-out both; }
        .routes-card { animation: cardSlideUp 0.7s ease-out 0.15s both; }
        .hero-select::placeholder { color: rgba(155,27,48,0.35); }
        .hero-select:focus { box-shadow: 0 0 0 2px rgba(155,27,48,0.15) !important; outline: none; }
        .hero-swap:hover { background: rgba(155,27,48,0.08) !important; border-radius: 50%; }
        .hero-swap:active { transform: scale(0.92); }
        @media (max-width: 640px) {
          .hero-form { flex-wrap: wrap !important; }
          .hero-form > div[style] { flex: 1 1 100% !important; width: 100% !important; }
          .hero-form > .hero-swap { flex: 0 0 auto !important; width: auto !important; }
          .hero-form > .hero-date-wrap > button { width: 100% !important; justify-content: center !important; }
        }
        .route-row:hover { background: rgba(155,27,48,0.04); }
        .social-icon:hover { background: #9B1B30 !important; color: white !important; border-color: #9B1B30 !important; }
        .social-icon { transition: all 0.2s ease; }
        .lang-btn:hover { background: rgba(155,27,48,0.12) !important; }
      `}</style>

      <ShaderBackground />

      <div style={{ position: 'relative', zIndex: 1 }}>

        <header className="site-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 40px' }}>
          <a href={`/${locale}`} aria-label="TRANSLUX">
            <span className="site-logo" style={{
              display: 'inline-block', height: 36, aspectRatio: '1318/192',
              backgroundColor: '#9B1B30',
              WebkitMaskImage: 'url(/translux-logo-red.png)',
              WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
              maskImage: 'url(/translux-logo-red.png)',
              maskSize: 'contain', maskRepeat: 'no-repeat',
            }} />
          </a>
        </header>

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

            <form onSubmit={handleSearch} className="hero-form" style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            }}>
              {/* FROM */}
              <div style={{ position: 'relative', flex: '1 1 0', width: 0 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', zIndex: 1, color: '#9B1B30', opacity: 0.5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
                </span>
                <select ref={fromRef} name="dela" required className="hero-select" style={{
                  width: '100%', height: 48, border: '1px solid rgba(155,27,48,0.1)', borderRadius: 12,
                  padding: '0 16px 0 34px', fontSize: 15, background: 'rgba(255,255,255,0.85)',
                  outline: 'none', fontStyle: 'italic', appearance: 'none',
                  color: '#6E0E14', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  transition: 'box-shadow 0.2s ease', cursor: 'pointer',
                }}>
                  <option value="">{i.from}</option>
                  {sortedLocalities.major.length > 0 && (
                    <optgroup label={locale === 'ru' ? 'Основные' : 'Principale'}>
                      {sortedLocalities.major.map(l => (
                        <option key={l.id} value={l.name_ro}>{getName(l)}</option>
                      ))}
                    </optgroup>
                  )}
                  {sortedLocalities.minor.length > 0 && (
                    <optgroup label={locale === 'ru' ? 'Все остановки' : 'Toate stațiile'}>
                      {sortedLocalities.minor.map(l => (
                        <option key={l.id} value={l.name_ro}>{getName(l)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* SWAP */}
              <button type="button" className="hero-swap" style={{
                flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9B1B30', fontSize: 18,
                transition: 'transform 0.15s ease',
              }} aria-label={i.swap} onClick={() => {
                if (fromRef.current && toRef.current) {
                  const tmp = fromRef.current.value;
                  fromRef.current.value = toRef.current.value;
                  toRef.current.value = tmp;
                }
              }}>⇄</button>

              {/* TO */}
              <div style={{ position: 'relative', flex: '1 1 0', width: 0 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', zIndex: 1, color: '#9B1B30', opacity: 0.5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
                </span>
                <select ref={toRef} name="spre" required className="hero-select" style={{
                  width: '100%', height: 48, border: '1px solid rgba(155,27,48,0.1)', borderRadius: 12,
                  padding: '0 16px 0 34px', fontSize: 15, background: 'rgba(255,255,255,0.85)',
                  outline: 'none', fontStyle: 'italic', appearance: 'none',
                  color: '#6E0E14', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  transition: 'box-shadow 0.2s ease', cursor: 'pointer',
                }}>
                  <option value="">{i.to}</option>
                  {sortedLocalities.major.length > 0 && (
                    <optgroup label={locale === 'ru' ? 'Основные' : 'Principale'}>
                      {sortedLocalities.major.map(l => (
                        <option key={l.id} value={l.name_ro}>{getName(l)}</option>
                      ))}
                    </optgroup>
                  )}
                  {sortedLocalities.minor.length > 0 && (
                    <optgroup label={locale === 'ru' ? 'Все остановки' : 'Toate stațiile'}>
                      {sortedLocalities.minor.map(l => (
                        <option key={l.id} value={l.name_ro}>{getName(l)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Date picker */}
              <div ref={calRef} className="hero-date-wrap" style={{ position: 'relative', flexShrink: 0 }}>
                <button type="button" onClick={() => setCalendarOpen(!calendarOpen)} className="hero-select" style={{
                  height: 48, border: '1px solid rgba(155,27,48,0.1)', borderRadius: 12,
                  padding: '0 14px', fontSize: 14, background: 'rgba(255,255,255,0.85)',
                  outline: 'none', fontStyle: 'italic',
                  color: '#6E0E14', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {format(selectedDate, 'dd.MM.yyyy', { locale: locale === 'ru' ? ruLocale : roLocale })}
                </button>
                {calendarOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setCalendarOpen(false)} />
                    <div style={{
                      position: 'absolute', bottom: '100%', right: 0, marginBottom: 4, zIndex: 11, width: 280,
                    }}>
                      <MiniCalendar
                        value={selectedDate}
                        locale={locale}
                        onChange={(d) => { setSelectedDate(d); setCalendarOpen(false); }}
                      />
                    </div>
                  </>
                )}
              </div>

              <RainbowButton label={searching ? '...' : i.search} />
            </form>
          </div>

          {/* Popular routes card */}
          <div className="routes-card" style={{
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

            {/* Active offers banner */}
            {offers.length > 0 && (
              <div style={{ maxWidth: 520, margin: '0 auto 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {offers.map((offer, idx) => (
                  <div key={idx} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: 12,
                    background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#16a34a',
                        background: 'rgba(22,163,74,0.12)', padding: '2px 8px', borderRadius: 6,
                        fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                      }}>OFERTĂ</span>
                      <span style={{
                        fontSize: 11, color: '#333', textTransform: 'uppercase', letterSpacing: 0.8,
                        fontWeight: 600, fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                      }}>
                        {offer.from_locality} - {offer.to_locality}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, color: '#999', textDecoration: 'line-through',
                        fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                      }}>
                        {offer.original_price} LEI
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: '#16a34a',
                        fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                      }}>
                        {offer.offer_price} LEI
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0 48px', maxWidth: 520, margin: '0 auto',
            }}>
              {popularRoutes[locale].map((r) => (
                <div key={r.route} className="route-row" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 4px', borderBottom: '1px solid rgba(155,27,48,0.06)',
                  borderRadius: 4, transition: 'background 0.15s ease',
                }}>
                  <span style={{
                    fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8,
                    fontWeight: 600, fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  }}>
                    {r.route}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#9B1B30', marginLeft: 8, whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                  }}>
                    {r.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </section>

        {/* Footer */}
        <footer style={{ borderTop: '2px solid rgba(155,27,48,0.15)', background: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}>
          <div style={{
            maxWidth: 720, margin: '0 auto', padding: '24px 36px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 20,
          }}>
            <div>
              <span style={{
                display: 'inline-block', height: 20, aspectRatio: '1318/192',
                backgroundColor: '#9B1B30',
                WebkitMaskImage: 'url(/translux-logo-red.png)',
                WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
                maskImage: 'url(/translux-logo-red.png)',
                maskSize: 'contain', maskRepeat: 'no-repeat',
                opacity: 0.6,
              }} />
              <p style={{ fontSize: 13, color: '#555', margin: '6px 0 2px' }}>
                <a href="tel:+37360401010" style={{ color: '#555', textDecoration: 'none' }}>+373 60 40 10 10</a>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a href="https://www.facebook.com/TRANSPORTLUX" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="social-icon" style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid rgba(155,27,48,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none', background: 'transparent' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@translux.md" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="social-icon" style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid rgba(155,27,48,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none', background: 'transparent' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.52a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.3z"/></svg>
              </a>
            </div>
          </div>
        </footer>

      </div>

      {/* Lang toggle */}
      <div style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 3,
        display: 'flex', gap: 2, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 10, padding: 3,
        border: '1px solid rgba(155,27,48,0.1)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <a href="/ro" className="lang-btn" style={{
          color: locale === 'ro' ? '#9B1B30' : 'rgba(155,27,48,0.35)',
          fontWeight: 700, fontSize: 11, letterSpacing: 1.2,
          textDecoration: 'none', padding: '5px 10px', borderRadius: 8,
          background: locale === 'ro' ? 'rgba(155,27,48,0.08)' : 'transparent',
          fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
          transition: 'all 0.15s ease',
        }}>RO</a>
        <a href="/ru" className="lang-btn" style={{
          color: locale === 'ru' ? '#9B1B30' : 'rgba(155,27,48,0.35)',
          fontWeight: 700, fontSize: 11, letterSpacing: 1.2,
          textDecoration: 'none', padding: '5px 10px', borderRadius: 8,
          background: locale === 'ru' ? 'rgba(155,27,48,0.08)' : 'transparent',
          fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
          transition: 'all 0.15s ease',
        }}>RU</a>
      </div>

      {showResults && (
        <RouteResults
          from={fromRef.current?.selectedOptions[0]?.text || ''}
          to={toRef.current?.selectedOptions[0]?.text || ''}
          trips={trips}
          selectedTime={null}
          locale={locale}
          onClose={() => setShowResults(false)}
        />
      )}

    </div>
  );
}
