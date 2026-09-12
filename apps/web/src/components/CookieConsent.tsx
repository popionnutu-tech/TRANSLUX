'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { CONSENT_OPEN_EVENT, readConsent, writeConsent } from '@/lib/consent';

const TEXT = {
  ro: {
    title: 'Cookie-uri și date personale',
    body:
      'Acest site folosește doar cookie-uri strict necesare. Nu folosim cookie-uri de urmărire sau publicitate, iar statistica vizitelor este anonimă, fără identificatori.',
    privacy: 'Politica de confidențialitate',
    cookies: 'Politica cookie',
    ok: 'Am înțeles',
  },
  ru: {
    title: 'Cookie и персональные данные',
    body:
      'Сайт использует только строго необходимые cookie. Мы не применяем отслеживающие или рекламные cookie, а статистика посещений анонимна, без идентификаторов.',
    privacy: 'Политика конфиденциальности',
    cookies: 'Политика cookie',
    ok: 'Понятно',
  },
} as const;

/**
 * Notificarea GDPR / cookie a site-ului public (Legea 195/2024). Un singur
 * buton, fiindcă nu există nimic de refuzat — vezi `lib/consent.ts`.
 * Se redeschide din footer prin `openConsentSettings()`.
 */
export default function CookieConsent({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const t = TEXT[locale];

  useEffect(() => {
    if (!readConsent()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  const accept = () => {
    writeConsent(null);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t.title}
      className="cookie-banner"
      style={{
        position: 'fixed', left: 16, bottom: 16, zIndex: 40,
        width: 'min(440px, calc(100vw - 32px))',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(155,27,48,0.15)', borderRadius: 14,
        boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
        padding: '16px 18px',
        fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
        color: '#333',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: '#9B1B30', marginBottom: 6 }}>{t.title}</div>
      <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 10px' }}>{t.body}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <a href={`/${locale}/confidentialitate`} style={{ color: '#9B1B30', textDecoration: 'underline' }}>{t.privacy}</a>
          <a href={`/${locale}/cookies`} style={{ color: '#9B1B30', textDecoration: 'underline' }}>{t.cookies}</a>
        </div>
        <button
          type="button"
          onClick={accept}
          style={{
            background: '#9B1B30', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t.ok}
        </button>
      </div>
    </div>
  );
}
