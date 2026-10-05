'use client';

// «Unde e autobuzul meu» în mini app-ul clientului (ION-249), cu regulile ION-37/39 ale asistentului: doar mașina cursei
// de pe bilet, doar în orele cursei după grafic, fără viteză și fără traseu — un singur punct, cerut o dată pe minut de
// la /api/asistent-site/pozitie (aceeași poartă ca în chatul site-ului). Harta e BusMap-ul asistentului.

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Card } from '@/lib/assistant-cards';
import type { Locale } from '@/lib/i18n';
import { phoneTel, phoneText } from '@/lib/phone';

const BusMap = dynamic(() => import('@/components/BusMap'), { ssr: false });

const ENDPOINT = process.env.NEXT_PUBLIC_ASSISTANT_URL || 'https://central-hub-md.vercel.app/api/asistent-site';
/** Cronul de pe VPS scrie poziția o dată pe minut; nu are rost să cerem mai des. */
const REIMPROSPATARE_MS = 60_000;
const RED = '#9B1B30';

type CardAutobuz = Extract<Card, { type: 'bus' }>;
type Stare = { tip: 'incarca' } | { tip: 'punct'; card: CardAutobuz } | { tip: 'fara'; text: string };

const TXT = {
  ro: {
    titlu: 'Unde e autobuzul meu', incarca: 'Caut autobuzul cursei…', langa: (n: string) => `Acum lângă ${n}`, acum: 'Poziția de acum',
    la: (t: string) => `poziția de la ${t}`, sofer: 'Șoferul cursei', suna: 'Sună', eroare: 'Poziția nu se poate citi acum. Încercăm din nou peste un minut.',
  },
  ru: {
    titlu: 'Где мой автобус', incarca: 'Ищем автобус рейса…', langa: (n: string) => `Сейчас возле ${n}`, acum: 'Позиция сейчас',
    la: (t: string) => `позиция на ${t}`, sofer: 'Водитель рейса', suna: 'Позвонить', eroare: 'Позиция сейчас недоступна. Попробуем снова через минуту.',
  },
} as const;

/** Răspunsul serverului: punctul (live) sau fraza de ce nu e (în afara orelor, fără semnal). */
function stareDinRaspuns(j: unknown, locale: Locale, implicit: string): Stare {
  const d = (j ?? {}) as { live?: boolean; card?: CardAutobuz; line_ro?: string | null; line_ru?: string | null };
  if (d.live && d.card && Number.isFinite(d.card.lat) && Number.isFinite(d.card.lon)) return { tip: 'punct', card: d.card };
  return { tip: 'fara', text: (locale === 'ru' ? d.line_ru : d.line_ro) || implicit };
}

export function HartaAutobuzului({ from, to, plecare, locale }: { from: string; to: string; plecare: string; locale: Locale }) {
  const tx = TXT[locale];
  const [stare, setStare] = useState<Stare>({ tip: 'incarca' });

  useEffect(() => {
    let viu = true;
    const q = new URLSearchParams({ from, to, departure: plecare });
    const cere = async () => {
      if (document.hidden) return;
      try {
        // GET cu query = cerere «simplă», fără preflight CORS (ION-206).
        const r = await fetch(`${ENDPOINT}/pozitie?${q}`, { cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        if (viu) setStare(r.ok ? stareDinRaspuns(j, locale, tx.eroare) : { tip: 'fara', text: tx.eroare });
      } catch {
        if (viu) setStare({ tip: 'fara', text: tx.eroare });
      }
    };
    void cere();
    const t = setInterval(cere, REIMPROSPATARE_MS);
    const laIntoarcere = () => { if (!document.hidden) void cere(); };
    document.addEventListener('visibilitychange', laIntoarcere);
    return () => { viu = false; clearInterval(t); document.removeEventListener('visibilitychange', laIntoarcere); };
  }, [from, to, plecare, locale, tx.eroare]);

  return (
    <section aria-label={tx.titlu} style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ padding: '12px 16px', fontWeight: 800, fontSize: 16, color: '#231A1C' }}>📍 {tx.titlu}</div>
      {stare.tip === 'incarca' && <p style={{ margin: 0, padding: '0 16px 14px', color: '#666', fontSize: 14 }}>{tx.incarca}</p>}
      {stare.tip === 'fara' && <p style={{ margin: 0, padding: '0 16px 14px', color: '#555', fontSize: 14, lineHeight: 1.45 }}>{stare.text}</p>}
      {stare.tip === 'punct' && <PunctAutobuz card={stare.card} locale={locale} />}
    </section>
  );
}

function PunctAutobuz({ card, locale }: { card: CardAutobuz; locale: Locale }) {
  const tx = TXT[locale];
  const unde = card.near ? tx.langa(card.near) : tx.acum;
  return (
    <>
      <div className="tg-harta"><BusMap lat={card.lat} lon={card.lon} label={unde} expanded={false} /></div>
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ fontSize: 15 }}>{unde}</b>
        <span style={{ fontSize: 12, color: '#6B5E61', whiteSpace: 'nowrap' }}>{tx.la(card.at)}</span>
      </div>
      {card.phone && (
        <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ minWidth: 0, fontSize: 14 }}>
            <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.driver ?? phoneText(card.phone)}</span>
            <span style={{ color: '#6B5E61', fontSize: 12 }}>{tx.sofer}</span>
          </span>
          {/* Mereu +373 (lib/phone): sună și din roaming. */}
          <a href={phoneTel(card.phone)} style={{ flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 12, background: '#16a34a', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            📞 {tx.suna}
          </a>
        </div>
      )}
      <style>{`
.tg-harta{position:relative;height:260px;background:#EFEAE3}
.tg-harta .asst-lf{position:absolute;inset:0;isolation:isolate}
.asst-lf-icon{background:none!important;border:none!important}
.asst-lf-pin{width:32px;height:32px;border-radius:50%;background:${RED};border:3px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 8px rgba(155,27,48,.18),0 3px 8px rgba(0,0,0,.25)}
`}</style>
    </>
  );
}
