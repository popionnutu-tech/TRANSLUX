/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef } from 'react';
import ShaderBackground from '@/components/ui/shader-background';
import { RainbowButton } from '@/components/ui/rainbow-borders-button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { RouteResults } from '@/components/ui/route-results';
import { type Locale, t } from '@/lib/i18n';

const popularRoutes = [
  { route: 'CHIȘINĂU - BĂLȚI', price: '40 LEI' },
  { route: 'CHIȘINĂU - EDINEȚ', price: '70 LEI' },
  { route: 'CHIȘINĂU - SÎNGEREI', price: '50 LEI' },
  { route: 'CHIȘINĂU - OCNIȚA', price: '85 LEI' },
  { route: 'CHIȘINĂU - OTACI', price: '85 LEI' },
  { route: 'CHIȘINĂU - BRICENI', price: '80 LEI' },
  { route: 'CHIȘINĂU - CUPCINI', price: '90 LEI' },
  { route: 'CHIȘINĂU - LIPCANI', price: '92 LEI' },
  { route: 'CHIȘINĂU - CORJEUȚI', price: '80 LEI' },
  { route: 'CHIȘINĂU - GRIMĂNCĂUȚI', price: '83 LEI' },
  { route: 'CHIȘINĂU - CRIVA', price: '100 LEI' },
  { route: 'CHIȘINĂU - LARGA', price: '80 LEI' },
];

export function HomePage({ locale }: { locale: Locale }) {
  const [showResults, setShowResults] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const i = t(locale);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromRef.current?.value && toRef.current?.value && selectedTime) {
      setShowResults(true);
    }
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative', fontFamily: 'var(--font-opensans), Open Sans, sans-serif' }}>

      <ShaderBackground />

      <div style={{ position: 'relative', zIndex: 1 }}>

        <header className="site-header">
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
          justifyContent: 'center', minHeight: 'calc(100vh - 68px)',
          padding: '0 20px', paddingBottom: '10vh',
        }}>
          <div style={{
            width: '100%', maxWidth: 760,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(6px)',
            borderRadius: 20, padding: '36px 32px 28px',
          }}>
              <h1 style={{
                color: '#9B1B30', fontSize: 26, fontStyle: 'italic', textAlign: 'center',
                fontFamily: 'var(--font-playfair), Playfair Display, Georgia, serif', margin: '0 0 24px',
                fontWeight: 400, letterSpacing: 1, textShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}>
                {i.hero}
              </h1>
              <form onSubmit={handleSearch} className="hero-form" style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              }}>
            <div style={{ position: 'relative', flex: '1 1 0', width: 0 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none', zIndex: 1 }}>📍</span>
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', zIndex: 1, color: 'rgba(155,27,48,0.35)' }}>ˬ</span>
              <input ref={fromRef} name="dela" placeholder={i.from} autoComplete="off" required className="hero-input" style={{
                width: '100%', height: 44, border: 'none', borderRadius: 10,
                padding: '0 28px 0 32px', fontSize: 13, background: 'rgba(255,255,255,0.92)',
                outline: 'none', fontStyle: 'italic',
                color: '#6E0E14', boxShadow: 'none', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              }} />
            </div>

            <button type="button" className="hero-swap" style={{
              flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9B1B30', fontSize: 16,
            }} aria-label={i.swap}>⇄</button>

            <div style={{ position: 'relative', flex: '1 1 0', width: 0 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none', zIndex: 1 }}>📍</span>
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', zIndex: 1, color: 'rgba(155,27,48,0.35)' }}>ˬ</span>
              <input ref={toRef} name="spre" placeholder={i.to} autoComplete="off" required className="hero-input" style={{
                width: '100%', height: 44, border: 'none', borderRadius: 10,
                padding: '0 28px 0 32px', fontSize: 13, background: 'rgba(255,255,255,0.92)',
                outline: 'none', fontStyle: 'italic',
                color: '#6E0E14', boxShadow: 'none', fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              }} />
            </div>

            <DateTimePicker
              name="data"
              locale={locale}
              onChange={(_date, time) => setSelectedTime(time)}
            />

            <RainbowButton label={i.search} />
          </form>
          </div>

          <div style={{
            width: '100%', maxWidth: 760, marginTop: 32,
            background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(6px)',
            borderRadius: 20, padding: '28px 32px',
          }}>
            <h2 style={{
              color: '#9B1B30', fontSize: 18, fontStyle: 'italic', textAlign: 'center',
              fontFamily: 'var(--font-playfair), Playfair Display, Georgia, serif',
              margin: '0 0 20px', fontWeight: 400, letterSpacing: 1,
            }}>
              {i.popular}
            </h2>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '2px 50px', maxWidth: 540, margin: '0 auto',
            }}>
              {popularRoutes.map((r) => (
                <div key={r.route} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid rgba(155,27,48,0.1)',
                }}>
                  <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}>
                    {r.route}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9B1B30', marginLeft: 8, whiteSpace: 'nowrap', fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}>
                    {r.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </section>

        <footer style={{ borderTop: '3px solid #9B1B30' }}>
          <div style={{
            maxWidth: 700, margin: '0 auto', padding: '20px 20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexWrap: 'wrap', gap: 20,
          }}>
            <div>
              <span style={{
                display: 'inline-block', height: 22, aspectRatio: '1318/192',
                backgroundColor: '#9B1B30',
                WebkitMaskImage: 'url(/translux-logo-red.png)',
                WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
                maskImage: 'url(/translux-logo-red.png)',
                maskSize: 'contain', maskRepeat: 'no-repeat',
              }} />
              <p style={{ fontSize: 13, color: '#555', margin: '6px 0 2px' }}>
                <a href="tel:+37360401010" style={{ color: '#555', textDecoration: 'none' }}>+373 60 40 10 10</a>
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
                <a href="#" aria-label="Facebook" style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #9B1B30', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none', background: 'transparent' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="#" aria-label="Instagram" style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #9B1B30', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none', background: 'transparent' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                </a>
                <a href="#" aria-label="TikTok" style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #9B1B30', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B1B30', textDecoration: 'none', background: 'transparent' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.52a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.3z"/></svg>
                </a>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9B1B30' }}>●● mastercard</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#1A1F71' }}>VISA</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', padding: '0 20px 12px' }}>
            <a href="#" style={{ color: '#9B1B30', fontSize: 12, textDecoration: 'none' }}>▲</a>
          </div>
        </footer>

      </div>

      {/* ══ FLOATING LANG TOGGLE ══ */}
      <div style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 3,
        display: 'flex', gap: 4, background: 'rgba(155,27,48,0.15)', backdropFilter: 'blur(8px)',
        borderRadius: 8, padding: 3,
      }}>
        <a href="/ro" style={{
          color: '#9B1B30', fontWeight: 700, fontSize: 12, letterSpacing: 1,
          textDecoration: 'none', padding: '4px 8px', borderRadius: 6,
          background: locale === 'ro' ? 'rgba(155,27,48,0.12)' : 'transparent',
        }}>RO</a>
        <a href="/ru" style={{
          color: locale === 'ru' ? '#9B1B30' : 'rgba(155,27,48,0.4)', fontWeight: 700, fontSize: 12, letterSpacing: 1,
          textDecoration: 'none', padding: '4px 8px', borderRadius: 6,
          background: locale === 'ru' ? 'rgba(155,27,48,0.12)' : 'transparent',
        }}>RU</a>
      </div>

      {showResults && (
        <RouteResults
          from={fromRef.current?.value || "Chișinău"}
          to={toRef.current?.value || "Bălți"}
          selectedTime={selectedTime}
          locale={locale}
          onClose={() => setShowResults(false)}
        />
      )}

    </div>
  );
}
