'use client';

// Butonul «Întreabă asistentul» din colțul dreapta-jos (ION-204, 03.10). Stă în chunk-ul
// inițial al paginii, ca omul să-l vadă imediat; asistentul propriu-zis (AssistantWidget,
// cu lucide, cardurile și harta) se încarcă abia la apăsare sau când browserul are timp
// liber. Aspectul e cel al machetei din ION-39: aceleași clase, aceeași culoare, aceeași
// pictogramă (MessageCircle din lucide, desenată aici ca SVG ca să nu tragă biblioteca).

import type { Locale } from '@/lib/i18n';

const RED = '#9B1B30';

/** Cheia din localStorage pusă de asistent când omul închide invitația (nu se mai arată). */
export const TEASER_CLOSED_KEY = 'translux_asistent_teaser_closed';

const TEXT = {
  ro: { launcher: 'Întreabă asistentul', open: 'Deschide asistentul' },
  ru: { launcher: 'Спросить ассистента', open: 'Открыть ассистента' },
} as const;

export const LAUNCHER_CSS = `
.asst-launcher{position:fixed;right:24px;bottom:24px;z-index:45;height:56px;padding:0 22px 0 18px;border:none;border-radius:999px;cursor:pointer;
  background:${RED};color:#fff;display:flex;align-items:center;gap:10px;font:700 15px var(--font-opensans),Open Sans,sans-serif;
  box-shadow:0 12px 32px rgba(155,27,48,.35);transition:transform .18s ease}
.asst-launcher:hover{transform:translateY(-2px)}
@media (max-width:520px){.asst-launcher{right:16px;bottom:16px}}
@media (max-width:380px){.asst-launcher-label{display:none}.asst-launcher{padding:0 17px}}
`;

export function AssistantLauncher({ locale, onClick }: { locale: Locale; onClick: () => void }) {
  const i = TEXT[locale];
  return (
    <>
      <style>{LAUNCHER_CSS}</style>
      <button type="button" className="asst-launcher" onClick={onClick} aria-label={i.open}>
        <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
        </svg>
        {' '}<span className="asst-launcher-label">{i.launcher}</span>
      </button>
    </>
  );
}
