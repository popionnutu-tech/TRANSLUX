'use client';

// «Caută bilet nou» în mini app-ul clientului (ION-249, Ion 05.10: «trebuie să fie căutare noi bilete»): de unde,
// încotro, ziua — aceeași căutare ca pe prima pagină (searchTrips), apoi aceleași rezultate cu «Cumpără bilet online»
// (RouteResults + BuyTicketForm). Numele și telefonul vin precompletate din ultima comandă a contului.

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { searchTrips, type TripResult } from '@/app/(public)/actions';
import type { HomeOptions } from '@/lib/home-props';
import { t, type Locale } from '@/lib/i18n';
import type { ContactPrecompletat } from '@/lib/telegram-client';

const RouteResults = dynamic(() => import('@/components/ui/route-results').then((m) => m.RouteResults), { ssr: false });
const MiniCalendar = dynamic(() => import('@/components/ui/mini-calendar').then((m) => m.MiniCalendar), { ssr: false });

const RED = '#9B1B30';
/** Azi, mâine, poimâine — butoanele rapide, ca în fereastra «Când pleci?» de pe prima pagină. */
const ZILE_RAPIDE = [0, 1, 2] as const;

const TXT = {
  ro: { titlu: 'Caută bilet nou', altaZi: 'Altă zi', cautare: 'Caut…', eroare: 'Căutarea nu a mers. Încearcă din nou.' },
  ru: { titlu: 'Найти новый билет', altaZi: 'Другой день', cautare: 'Ищем…', eroare: 'Поиск не удался. Попробуйте ещё раз.' },
} as const;

/** «2026-10-05» din data locală a telefonului (ca pe prima pagină). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function peste(zile: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + zile);
  return d;
}

interface Rezultate { trips: TripResult[]; from: string; to: string; fromRo: string; toRo: string }

export function CautaBiletNou({ locale, options, contact }: {
  locale: Locale; options: HomeOptions; contact: ContactPrecompletat | null;
}) {
  const i = t(locale);
  const tx = TXT[locale];
  const fromRef = useRef<HTMLSelectElement>(null);
  const toRef = useRef<HTMLSelectElement>(null);
  const [zi, setZi] = useState<Date>(() => new Date());
  const [calendar, setCalendar] = useState(false);
  const [cauta, setCauta] = useState(false);
  const [eroare, setEroare] = useState(false);
  const [rezultate, setRezultate] = useState<Rezultate | null>(null);

  const directia = () => {
    const from = fromRef.current?.value ?? '';
    const to = toRef.current?.value ?? '';
    if (!from) { fromRef.current?.reportValidity(); return null; }
    if (!to || to === from) { toRef.current?.reportValidity(); return null; }
    return {
      fromRo: from, toRo: to,
      from: fromRef.current?.selectedOptions[0]?.text || from,
      to: toRef.current?.selectedOptions[0]?.text || to,
    };
  };

  const ruleaza = async (data: Date) => {
    const d = directia();
    if (!d) return;
    setZi(data);
    setCalendar(false);
    setCauta(true);
    setEroare(false);
    try {
      setRezultate({ ...d, trips: await searchTrips(d.fromRo, d.toRo, ymd(data)) });
    } catch (e) {
      console.error('[telegram] căutarea:', e);
      setEroare(true);
    } finally {
      setCauta(false);
    }
  };

  const inverseaza = () => {
    if (!fromRef.current || !toRef.current) return;
    const de = fromRef.current.value;
    fromRef.current.value = toRef.current.value;
    toRef.current.value = de;
  };

  const optiuni = (
    <>
      {options.major.length > 0 && <optgroup label={locale === 'ru' ? 'Основные' : 'Principale'}>{options.major.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>}
      {options.minor.length > 0 && <optgroup label={locale === 'ru' ? 'Все остановки' : 'Toate stațiile'}>{options.minor.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>}
    </>
  );

  return (
    <section aria-label={tx.titlu} style={{ background: '#fff', borderRadius: 20, padding: 16, display: 'grid', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#231A1C' }}>🔎 {tx.titlu}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <select ref={fromRef} required aria-label={i.from} className="tg-select" defaultValue=""><option value="">{i.from}</option>{optiuni}</select>
          <select ref={toRef} required aria-label={i.to} className="tg-select" defaultValue=""><option value="">{i.to}</option>{optiuni}</select>
        </div>
        <button type="button" onClick={inverseaza} aria-label={i.swap} title={i.swap} style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid #e6d9dc', background: '#fff', color: RED, fontSize: 20, cursor: 'pointer' }}>⇅</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {ZILE_RAPIDE.map((k) => (
          <button key={k} type="button" disabled={cauta} onClick={() => ruleaza(peste(k))} className="tg-zi">{[i.today, i.tomorrow, i.afterTomorrow][k]}</button>
        ))}
      </div>
      <button type="button" disabled={cauta} onClick={() => setCalendar((v) => !v)} className="tg-zi" style={{ background: '#fff', color: RED }}>📅 {tx.altaZi}</button>
      {calendar && <MiniCalendar value={zi} locale={locale} onChange={(d) => ruleaza(d)} />}
      {cauta && <p aria-live="polite" style={{ margin: 0, color: '#666', fontSize: 14 }}>{tx.cautare}</p>}
      {eroare && <p role="alert" style={{ margin: 0, color: RED, fontSize: 14, fontWeight: 600 }}>{tx.eroare}</p>}
      <style>{`
.tg-select{width:100%;height:48px;border:1px solid #e6d9dc;border-radius:12px;padding:0 12px;font-size:16px;background:#fff;color:#231A1C;font-family:inherit;appearance:none}
.tg-zi{height:46px;border-radius:12px;border:1.5px solid ${RED};background:${RED};color:#fff;font:700 15px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
.tg-zi:disabled{opacity:.6;cursor:default}
`}</style>
      {rezultate && (
        <RouteResults
          from={rezultate.from} to={rezultate.to} fromRo={rezultate.fromRo} toRo={rezultate.toRo}
          trips={rezultate.trips} selectedTime={null} locale={locale} contact={contact}
          onClose={() => setRezultate(null)}
        />
      )}
    </section>
  );
}
