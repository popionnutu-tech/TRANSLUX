'use client';

// Asistentul din colțul dreapta-jos al translux.md. ION-37: chatul; ION-39: aspectul
// după macheta aprobată de Ion pe 23.09 («fa un ua ux normal la asistent») și
// «unde e autobuzul» — primul lucru pe care îl vezi, cerut așa de Ion.
//
// Widget-ul doar desenează: textul și cardurile (curse, stație, cursele de pe drum,
// autobuzul pe hartă) vin gata de la central-hub (/api/asistent-site), construite din
// bază, nu de model.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, MapPin, Maximize2, MessageCircle, MessageSquareWarning, Minimize2, Navigation, Phone, ShoppingBag, X, ArrowUp, Bus } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { parseAssistantText, type Inline } from '@/lib/assistant-text';
import type { Card, Crew } from '@/lib/assistant-cards';
import BusMap from './BusMap';
import { LINE_TEL, LINE_TEXT, phoneTel, phoneText } from '@/lib/phone';

const ENDPOINT = process.env.NEXT_PUBLIC_ASSISTANT_URL || 'https://central-hub-md.vercel.app/api/asistent-site';
const RED = '#9B1B30';
// Linia companiei, în forma internațională (lib/phone).
const STORE_KEY = 'translux_asistent_v2';
const TEASER_KEY = 'translux_asistent_teaser_closed';

const TEXT = {
  ro: {
    launcher: 'Întreabă asistentul',
    teaserName: 'Asistent TRANSLUX',
    teaser: 'Sunt asistentul care te ajută cu orice întrebare',
    title: 'Asistent TRANSLUX',
    status: 'Online · răspunde în câteva secunde',
    hello: 'Bună! Cu ce te ajut?',
    helloSub: 'Scrie liber sau alege mai jos.',
    busTitle: 'Unde e autobuzul meu?',
    busSub: 'Vezi acum unde e mașina cursei tale',
    busAsk: 'Unde e autobuzul meu?',
    tiles: [
      { key: 'trips', title: 'Curse și ore', sub: 'Orar, preț', ask: 'Vreau să găsesc o cursă' },
      { key: 'lost', title: 'Am uitat ceva', sub: 'Găsim șoferul', ask: 'Am uitat ceva în autobuz' },
      { key: 'complaint', title: 'Reclamație', sub: 'Șofer, mașină, site', ask: 'Vreau să las o reclamație' },
      { key: 'station', title: 'Stații', sub: 'Maps, Waze', ask: 'Unde e stația din Chișinău?' },
    ],
    faqTitle: 'Întrebări frecvente',
    faq: ['Pot plăti biletul online?', 'De ce a crescut prețul?'],
    teaserChips: ['Unde e autobuzul?', 'Curse de azi', 'Am uitat ceva', 'Reclamație'],
    placeholder: 'Scrie o întrebare…',
    send: 'Trimite',
    open: 'Deschide asistentul',
    minimize: 'Minimizează',
    hideTeaser: 'Ascunde invitația',
    call: 'Sună la +373 60 401 010',
    typing: 'Asistentul scrie',
    error: 'Nu am putut trimite mesajul. Verifică internetul sau sună la +373 60 401 010.',
    restart: 'Conversație nouă',
    note: 'Asistent AI · Pentru urgențe:',
    maps: 'Google Maps', waze: 'Waze', mapsPoint: 'Punctul pe Google Maps',
    reserve: 'Rezervă', noDriver: 'șofer nerepartizat', lei: 'lei',
    allTrips: (n: number) => `Toate cele ${n} de curse`,
    reserveHint: 'Sună șoferul ca să-ți rezervi locul',
    crewLabel: 'Șoferul cursei',
    callDriver: (n: string | null, p: string) => `Sună șoferul${n ? ` ${n}` : ''}, ${p}`,
    onRoad: 'Pe drum', pickTitle: 'Alege cursa ta', showWhere: 'Arată unde e',
    departedAgo: (m: number, t: string, from: string) => (m < 0 ? `ajunge la ${from} la ${t}` : m >= 60 ? `plecată de ${Math.floor(m / 60)} h ${m % 60} min` : `plecată de ${m} min`),
    pickAsk: (t: string, from: string, to: string) => `Unde e autobuzul de ${t}, ${from} → ${to}?`,
    busNear: (n: string) => `Acum lângă ${n}`, busNow: 'Poziția de acum', busAt: (t: string) => `Poziția de la ${t}`,
    busHint: 'Doar în orele cursei, după grafic',
    busLive: 'Live', busStopped: 'Oprit', busEnded: 'Cursa nu mai e pe drum.',
    mapOpen: 'Harta pe tot ecranul', mapClose: 'Închide harta mare',
    follow: {
      trips: ['După-amiază', 'Retur', 'Unde e stația?'],
      station: ['Stația din Bălți', 'Cursele de azi'],
      bus: ['Altă cursă', 'Unde e stația?'],
    },
    followAsk: { 'Altă cursă': 'Unde e autobuzul meu?' } as Record<string, string>,
  },
  ru: {
    launcher: 'Спросить ассистента',
    teaserName: 'Ассистент TRANSLUX',
    teaser: 'Я ассистент, помогу с любым вопросом',
    title: 'Ассистент TRANSLUX',
    status: 'Онлайн · отвечает за секунды',
    hello: 'Здравствуйте! Чем помочь?',
    helloSub: 'Напишите вопрос или выберите ниже.',
    busTitle: 'Где мой автобус?',
    busSub: 'Посмотрите, где сейчас машина вашего рейса',
    busAsk: 'Где мой автобус?',
    tiles: [
      { key: 'trips', title: 'Рейсы и время', sub: 'Расписание, цена', ask: 'Хочу найти рейс' },
      { key: 'lost', title: 'Забытая вещь', sub: 'Найдём водителя', ask: 'Забыл(а) вещь в автобусе' },
      { key: 'complaint', title: 'Жалоба', sub: 'Водитель, машина, сайт', ask: 'Хочу оставить жалобу' },
      { key: 'station', title: 'Станции', sub: 'Maps, Waze', ask: 'Где станция в Кишинёве?' },
    ],
    faqTitle: 'Частые вопросы',
    faq: ['Можно оплатить билет онлайн?', 'Почему выросла цена?'],
    teaserChips: ['Где автобус?', 'Рейсы на сегодня', 'Забытая вещь', 'Жалоба'],
    placeholder: 'Напишите вопрос…',
    send: 'Отправить',
    open: 'Открыть ассистента',
    minimize: 'Свернуть',
    hideTeaser: 'Скрыть приглашение',
    call: 'Позвонить +373 60 401 010',
    typing: 'Ассистент пишет',
    error: 'Не удалось отправить сообщение. Проверьте интернет или позвоните +373 60 401 010.',
    restart: 'Новый разговор',
    note: 'AI-ассистент · Срочно:',
    maps: 'Google Maps', waze: 'Waze', mapsPoint: 'Точка на Google Maps',
    reserve: 'Бронь', noDriver: 'водитель не назначен', lei: 'лей',
    allTrips: (n: number) => `Все ${n} рейсов`,
    reserveHint: 'Позвоните водителю, чтобы забронировать место',
    crewLabel: 'Водитель рейса',
    callDriver: (n: string | null, p: string) => `Позвонить водителю${n ? ` ${n}` : ''}, ${p}`,
    onRoad: 'В пути', pickTitle: 'Выберите свой рейс', showWhere: 'Показать, где он',
    departedAgo: (m: number, t: string, from: string) => (m < 0 ? `будет в ${from} в ${t}` : m >= 60 ? `в пути ${Math.floor(m / 60)} ч ${m % 60} мин` : `в пути ${m} мин`),
    pickAsk: (t: string, from: string, to: string) => `Где автобус рейса ${t}, ${from} → ${to}?`,
    busNear: (n: string) => `Сейчас возле ${n}`, busNow: 'Позиция сейчас', busAt: (t: string) => `Позиция на ${t}`,
    busHint: 'Только в часы рейса, по графику',
    busLive: 'Live', busStopped: 'Остановлено', busEnded: 'Рейс больше не в пути.',
    mapOpen: 'Карта на весь экран', mapClose: 'Закрыть большую карту',
    follow: {
      trips: ['После обеда', 'Обратно', 'Где станция?'],
      station: ['Станция в Бельцах', 'Рейсы на сегодня'],
      bus: ['Другой рейс', 'Где станция?'],
    },
    followAsk: { 'Другой рейс': 'Где мой автобус?' } as Record<string, string>,
  },
} as const;

type T = (typeof TEXT)[Locale];
interface Msg { role: 'user' | 'assistant'; text: string; cards?: Card[] }
interface Saved { conversationId: string | null; messages: Msg[] }

function load(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch { return null; }
}
function save(s: Saved) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* merge și fără stocare */ }
}

const telHref = phoneTel;

function InlineParts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold') return <strong key={i}>{p.text}</strong>;
        if (p.kind === 'link') return <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" style={{ color: RED, wordBreak: 'break-all' }}>{p.label}</a>;
        if (p.kind === 'tel') return <a key={i} href={p.href} style={{ color: RED, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.label}</a>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function BotText({ text, i }: { text: string; i: T }) {
  return (
    <>
      {parseAssistantText(text).map((b, k) => {
        if (b.kind === 'map') {
          return (
            <a key={k} href={b.href} target="_blank" rel="noopener noreferrer" className="asst-btn-soft" style={{ marginTop: 6 }}>
              {b.provider === 'google' ? <MapPin size={16} /> : <Navigation size={16} />} {b.provider === 'google' ? i.maps : i.waze}
            </a>
          );
        }
        if (b.kind === 'bullet') return <div key={k} style={{ display: 'flex', gap: 8 }}><span style={{ color: RED }}>•</span><span><InlineParts parts={b.parts} /></span></div>;
        return <p key={k} style={{ margin: '0 0 6px' }}><InlineParts parts={b.parts} /></p>;
      })}
    </>
  );
}

/** Mereu «+373 69 123 456» (Ion, 23.09). */
const fmtPhone = phoneText;

// Cine duce cursa, minimalist: «Ion · 651 AKD» lângă oră (Ion, 23.09).
function CrewName({ crew, i }: { crew: Crew; i: T }) {
  if (!crew.driver && !crew.plate) return <span className="asst-crew-name muted">{i.noDriver}</span>;
  return (
    <span className="asst-crew-name">
      {crew.driver}
      {crew.driver && crew.plate && <span className="asst-dot-sep">·</span>}
      {crew.plate && <span className="asst-plate">{crew.plate}</span>}
    </span>
  );
}

function CallButton({ crew, i, compact, strong }: { crew: Crew; i: T; compact?: boolean; strong?: boolean }) {
  if (!crew.phone) return null;
  const label = i.callDriver(crew.driver, fmtPhone(crew.phone));
  return (
    <a className={`asst-call ${strong ? 'strong' : ''} ${compact ? 'compact' : ''}`} href={telHref(crew.phone)}
      aria-label={label} title={label} onClick={(e) => e.stopPropagation()}>
      <Phone size={14} aria-hidden />{!compact && <span>{fmtPhone(crew.phone)}</span>}
    </a>
  );
}

function fmtDate(iso: string, locale: Locale): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'ro-RO', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

function CardView({ card, i, locale, ask, busy, live = false }: { card: Card; i: T; locale: Locale; ask: (s: string) => void; busy: boolean; live?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);

  if (card.type === 'trips') {
    return (
      <div className="asst-card">
        <div className="asst-card-head"><span>{card.from} → {card.to}</span><span>{fmtDate(card.date, locale)}</span></div>
        {card.trips.map((t) => (
          <div key={t.time} className="asst-trip">
            <span className="asst-trip-time">{t.time}</span>
            <span className="asst-crew">
              <CrewName crew={t} i={i} />
              <span className="asst-crew-sub">{t.price ? `${t.price} ${i.lei}` : ''}</span>
            </span>
            <CallButton crew={t} i={i} />
          </div>
        ))}
        {card.total > card.trips.length && (
          <button type="button" className="asst-card-foot" onClick={() => ask(`${i.allTrips(card.total)}: ${card.from} → ${card.to}`)} disabled={busy}>
            {i.allTrips(card.total)}
          </button>
        )}
        <div className="asst-card-hint">{i.reserveHint}</div>
      </div>
    );
  }

  if (card.type === 'station') {
    return (
      <div className="asst-card">
        <div style={{ padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{locale === 'ru' ? card.name_ru : card.name_ro}</div>
          <div style={{ fontSize: 14, color: '#5E5255' }}>{locale === 'ru' ? card.address_ru : card.address_ro}</div>
        </div>
        <div className="asst-two">
          <a className="asst-btn-main" href={card.maps} target="_blank" rel="noopener noreferrer"><MapPin size={17} /> {i.maps}</a>
          <a className="asst-btn-soft" href={card.waze} target="_blank" rel="noopener noreferrer"><Navigation size={17} /> {i.waze}</a>
        </div>
      </div>
    );
  }

  if (card.type === 'pick') {
    const choice = picked ?? card.trips[card.trips.length - 1]?.departure ?? null;
    return (
      <fieldset className="asst-card" style={{ margin: 0, padding: 0 }}>
        <legend className="asst-card-head" style={{ width: '100%', boxSizing: 'border-box' }}>
          <span>{card.from} → {card.to}</span>
          <span className="asst-live"><span className="asst-live-dot" />{i.onRoad}</span>
        </legend>
        {card.trips.map((t) => (
          <label key={t.departure} className={`asst-pick ${choice === t.departure ? 'on' : ''}`}>
            <input type="radio" name={`pick-${card.from}-${card.to}`} checked={choice === t.departure} onChange={() => setPicked(t.departure)} />
            <span className="asst-trip-time">{t.departure}</span>
            <span className="asst-crew">
              <CrewName crew={t} i={i} />
              <span className="asst-crew-sub">{i.departedAgo(t.minutes_ago, t.departure, card.from)}</span>
            </span>
            <CallButton crew={t} i={i} compact />
          </label>
        ))}
        <div style={{ padding: '10px 14px 14px' }}>
          <button type="button" className="asst-btn-main" style={{ width: '100%' }} disabled={busy || !choice}
            onClick={() => choice && ask(i.pickAsk(choice, card.from, card.to))}>{i.showWhere}</button>
        </div>
      </fieldset>
    );
  }

  return <BusCardView card={card} i={i} locale={locale} live={live} />;
}

type BusCard = Extract<Card, { type: 'bus' }>;
const REFRESH_MS = 60_000;

// Autobuzul: doar punctul de acum — fără viteză, direcție sau traseu (Ion, 23.09).
// Cât cardul e ultimul din chat, punctul se cere din nou o dată pe minut (cronul de
// pe VPS scrie tot o dată pe minut). Când cursa iese din orele ei, actualizarea se
// oprește și cardul spune de ce.
function BusCardView({ card: first, i, locale, live }: { card: BusCard; i: T; locale: Locale; live: boolean }) {
  const [card, setCard] = useState<BusCard>(first);
  const [ended, setEnded] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!live || ended) return;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`${ENDPOINT}/pozitie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: card.from, to: card.to, departure: card.departure }),
        });
        if (!res.ok || stop) return;
        const d = await res.json() as { live?: boolean; card?: BusCard; line_ro?: string | null; line_ru?: string | null };
        if (d.live && d.card) setCard(d.card);
        else if (d.live === false) setEnded((locale === 'ru' ? d.line_ru : d.line_ro) ?? i.busEnded);
      } catch { /* următorul minut */ }
    };
    const t = setInterval(tick, REFRESH_MS);
    return () => { stop = true; clearInterval(t); };
  }, [live, ended, card.from, card.to, card.departure, locale, i.busEnded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setExpanded(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  const where = card.near ? i.busNear(card.near) : i.busNow;
  return (
    <div className="asst-card">
      <div className="asst-card-head">
        <span>{card.departure} · {card.from} → {card.to}</span>
        {ended
          ? <span style={{ color: '#6B5E61' }}>{i.busStopped}</span>
          : <span className="asst-live"><span className="asst-live-dot pulse" />{live ? i.busLive : i.onRoad}</span>}
      </div>
      <div className={`asst-map-wrap ${expanded ? 'full' : ''}`}>
        {expanded && (
          <div className="asst-map-top">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{where}</div>
              <div style={{ fontSize: 12, color: '#6B5E61' }}>{i.busAt(card.at)} · {card.departure} {card.from} → {card.to}</div>
            </div>
            <CallButton crew={card} i={i} strong />
          </div>
        )}
        <BusMap lat={card.lat} lon={card.lon} label={where} expanded={expanded} />
        <button type="button" className="asst-map-expand" onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? i.mapClose : i.mapOpen} title={expanded ? i.mapClose : i.mapOpen}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{where}</div>
        <div style={{ fontSize: 12, color: '#6B5E61', whiteSpace: 'nowrap' }}>{i.busAt(card.at)}</div>
      </div>
      {ended && <div className="asst-card-hint" style={{ paddingBottom: 10 }}>{ended}</div>}
      {(card.driver || card.plate || card.phone) && (
        <div className="asst-crew-box">
          <span className="asst-crew">
            <CrewName crew={card} i={i} />
            <span className="asst-crew-sub">{i.crewLabel}</span>
          </span>
          <CallButton crew={card} i={i} strong />
        </div>
      )}
      <div style={{ padding: '0 14px 14px' }}>
        <a className="asst-btn-soft" style={{ width: '100%' }} href={card.maps} target="_blank" rel="noopener noreferrer"><MapPin size={17} /> {i.mapsPoint}</a>
      </div>
    </div>
  );
}

const TILE_ICONS = { trips: Clock, lost: ShoppingBag, complaint: MessageSquareWarning, station: MapPin } as const;

export default function AssistantWidget({ locale }: { locale: Locale }) {
  const i = TEXT[locale];
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const s = load();
    if (s) { setMessages(s.messages); setConversationId(s.conversationId); }
    loaded.current = true;
    let closed = false;
    try { closed = localStorage.getItem(TEASER_KEY) === '1'; } catch { /* nimic */ }
    if (closed) return;
    const t = setTimeout(() => setTeaser(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { if (loaded.current) save({ conversationId, messages }); }, [conversationId, messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const closeTeaser = () => {
    setTeaser(false);
    try { localStorage.setItem(TEASER_KEY, '1'); } catch { /* nimic */ }
  };

  async function send(text: string) {
    const message = text.trim().slice(0, 1000);
    if (!message || busy) return;
    setOpen(true);
    closeTeaser();
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation_id: conversationId, locale }),
      });
      const data = await res.json().catch(() => null) as { reply?: string; cards?: Card[]; conversation_id?: string | null } | null;
      if (data && 'conversation_id' in data) setConversationId(data.conversation_id ?? null);
      setMessages((m) => [...m, { role: 'assistant', text: data?.reply || i.error, cards: Array.isArray(data?.cards) ? data!.cards : undefined }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: i.error }]);
    } finally {
      setBusy(false);
    }
  }

  const followFor = (m: Msg): readonly string[] => {
    const last = m.cards?.[m.cards.length - 1];
    if (!last) return [];
    if (last.type === 'trips') return i.follow.trips;
    if (last.type === 'station') return i.follow.station;
    if (last.type === 'bus') return i.follow.bus;
    return [];
  };
  const lastIdx = messages.length - 1;
  // Doar ultimul card cu autobuzul se actualizează singur; cele vechi rămân cum au fost.
  const lastBusIdx = messages.reduce((acc, m, k) => (m.cards?.some((c) => c.type === 'bus') ? k : acc), -1);

  return (
    <>
      <style>{CSS}</style>

      {!open && teaser && (
        <div className="asst-teaser" role="status">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className="asst-avatar sm" aria-hidden>T</span>
            <button type="button" className="asst-teaser-text" onClick={() => setOpen(true)}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6B5E61' }}>{i.teaserName}</span>
              <span>{i.teaser}</span>
            </button>
            <button type="button" className="asst-x" onClick={closeTeaser} aria-label={i.hideTeaser}><X size={16} /></button>
          </div>
          <div className="asst-chips">
            {i.teaserChips.map((c, k) => (
              <button key={c} type="button" className={`asst-chip ${k === 0 ? 'hot' : ''}`}
                onClick={() => send(k === 0 ? i.busAsk : c)}>
                {k === 0 && <span className="asst-live-dot light" />}{c}
              </button>
            ))}
          </div>
        </div>
      )}

      {!open && (
        <button type="button" className="asst-launcher" onClick={() => setOpen(true)} aria-label={i.open}>
          <MessageCircle size={22} aria-hidden /> <span className="asst-launcher-label">{i.launcher}</span>
        </button>
      )}

      {open && (
        <section className="asst-panel" role="dialog" aria-label={i.title}>
          <header className="asst-head">
            <span className="asst-avatar" aria-hidden>T<span className="asst-avatar-dot" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="asst-title">{i.title}</div>
              <div className="asst-sub">{i.status}</div>
            </div>
            <a href={LINE_TEL} className="asst-icon" aria-label={i.call} title={i.call}><Phone size={19} /></a>
            <button type="button" className="asst-icon" onClick={() => setOpen(false)} aria-label={i.minimize}><ChevronDown size={22} /></button>
          </header>

          <div className="asst-list" ref={listRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="asst-home">
                <div>
                  <div className="asst-hello">{i.hello}</div>
                  <div className="asst-hello-sub">{i.helloSub}</div>
                </div>
                <button type="button" className="asst-hero" onClick={() => send(i.busAsk)}>
                  <span className="asst-hero-icon"><Bus size={22} /><span className="asst-hero-dot" /></span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="asst-hero-title">{i.busTitle}</span>
                    <span className="asst-hero-sub">{i.busSub}</span>
                  </span>
                  <ChevronRight size={18} />
                </button>
                <div className="asst-tiles">
                  {i.tiles.map((t) => {
                    const Icon = TILE_ICONS[t.key as keyof typeof TILE_ICONS];
                    return (
                      <button key={t.key} type="button" className="asst-tile" onClick={() => send(t.ask)}>
                        <span className="asst-tile-icon"><Icon size={18} /></span>
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span className="asst-tile-title">{t.title}</span>
                          <span className="asst-tile-sub">{t.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="asst-label">{i.faqTitle}</div>
                  {i.faq.map((q) => (
                    <button key={q} type="button" className="asst-faq" onClick={() => send(q)}>{q}<ChevronRight size={16} color={RED} /></button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, k) => (
                <div key={k} className="asst-row">
                  <div className={`asst-msg ${m.role === 'user' ? 'asst-me' : 'asst-bot'}`}>
                    {m.role === 'user' ? m.text : <BotText text={m.text} i={i} />}
                  </div>
                  {m.cards?.map((c, ci) => <CardView key={ci} card={c} i={i} locale={locale} ask={send} busy={busy} live={k === lastBusIdx} />)}
                  {k === lastIdx && m.role === 'assistant' && !busy && followFor(m).length > 0 && (
                    <div className="asst-chips">
                      {followFor(m).map((c) => (
                        <button key={c} type="button" className="asst-chip" onClick={() => send(i.followAsk[c] ?? c)}>{c}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {busy && <div className="asst-msg asst-bot asst-typing" aria-label={i.typing}><span /><span /><span /></div>}
          </div>

          <div className="asst-compose">
            <form className="asst-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <label htmlFor="asst-q" className="asst-vh">{i.placeholder}</label>
              <input id="asst-q" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                placeholder={i.placeholder} maxLength={1000} autoComplete="off" />
              <button type="submit" disabled={busy || !input.trim()} aria-label={i.send}><ArrowUp size={18} /></button>
            </form>
            <div className="asst-foot">
              <span>{i.note} <a href={LINE_TEL}>{LINE_TEXT}</a></span>
              {messages.length > 0 && <button type="button" onClick={() => { setMessages([]); setConversationId(null); }}>{i.restart}</button>}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// Culorile și proporțiile machetei aprobate (claude.ai artifact TFJi4ceHQQ5mdgKqnvk92g).
const CSS = `
.asst-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.asst-launcher{position:fixed;right:24px;bottom:24px;z-index:45;height:56px;padding:0 22px 0 18px;border:none;border-radius:999px;cursor:pointer;
  background:${RED};color:#fff;display:flex;align-items:center;gap:10px;font:700 15px var(--font-opensans),Open Sans,sans-serif;
  box-shadow:0 12px 32px rgba(155,27,48,.35);transition:transform .18s ease}
.asst-launcher:hover{transform:translateY(-2px)}
.asst-teaser{position:fixed;right:24px;bottom:96px;z-index:45;width:320px;box-sizing:border-box;padding:16px;background:#fff;border:1px solid #EADFE1;
  border-radius:18px 18px 6px 18px;box-shadow:0 16px 48px rgba(90,20,35,.16);display:flex;flex-direction:column;gap:12px;animation:asst-in .35s ease;
  font-family:var(--font-opensans),Open Sans,sans-serif}
.asst-teaser-text{flex:1;display:flex;flex-direction:column;gap:2px;background:none;border:none;padding:0;text-align:left;cursor:pointer;
  font:600 15px/1.4 var(--font-opensans),Open Sans,sans-serif;color:#231A1C}
.asst-x{width:28px;height:28px;border:none;background:transparent;color:#8A7D80;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center}
@keyframes asst-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.asst-avatar{position:relative;width:40px;height:40px;flex-shrink:0;border-radius:50%;background:${RED};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px}
.asst-avatar.sm{width:36px;height:36px;font-size:15px}
.asst-avatar-dot{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;background:#2E9E62;border:2px solid #fff}
.asst-panel{position:fixed;right:24px;bottom:24px;z-index:60;width:400px;height:min(680px,calc(100vh - 48px));display:flex;flex-direction:column;
  background:#FBF8F6;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(90,20,35,.22);animation:asst-in .25s ease;
  font-family:var(--font-opensans),Open Sans,sans-serif;color:#231A1C}
.asst-head{display:flex;align-items:center;gap:12px;padding:14px 10px 14px 16px;background:#fff;border-bottom:1px solid #EFE6E8}
.asst-title{font-weight:700;font-size:15px}
.asst-sub{font-size:12px;color:#5E5255;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asst-icon{width:44px;height:44px;border-radius:12px;border:none;background:transparent;color:#5E5255;cursor:pointer;display:flex;align-items:center;justify-content:center}
.asst-icon:hover{background:#F4E8EA;color:${RED}}
.asst-list{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.asst-home{display:flex;flex-direction:column;gap:14px}
.asst-hello{font-size:20px;font-weight:700;line-height:1.3}
.asst-hello-sub{font-size:14px;color:#5E5255;margin-top:4px}
.asst-hero{display:flex;align-items:center;gap:14px;padding:16px;background:${RED};border:none;border-radius:16px;text-align:left;cursor:pointer;
  color:#fff;box-shadow:0 8px 24px rgba(155,27,48,.25);font-family:inherit}
.asst-hero:hover{background:#8a1829}
.asst-hero-icon{position:relative;width:44px;height:44px;flex-shrink:0;border-radius:12px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}
.asst-hero-dot{position:absolute;right:-3px;top:-3px;width:12px;height:12px;border-radius:50%;background:#7CE3A2;border:2px solid ${RED}}
.asst-hero-title{font-size:16px;font-weight:700}
.asst-hero-sub{font-size:13px;line-height:1.4;color:#F6DCE1}
.asst-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.asst-tile{display:flex;align-items:center;gap:10px;padding:12px;background:#fff;border:1px solid #EFE6E8;border-radius:14px;text-align:left;cursor:pointer;font-family:inherit}
.asst-tile:hover{border-color:#D9C7CB}
.asst-tile-icon{width:34px;height:34px;flex-shrink:0;border-radius:10px;background:#F4E8EA;color:${RED};display:flex;align-items:center;justify-content:center}
.asst-tile-title{font-size:14px;font-weight:700;color:#231A1C}
.asst-tile-sub{font-size:12px;color:#6B5E61;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asst-label{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6B5E61}
.asst-faq{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;background:#fff;border:1px solid #EFE6E8;border-radius:12px;
  font:14px var(--font-opensans),Open Sans,sans-serif;color:#231A1C;cursor:pointer;text-align:left}
.asst-row{display:flex;flex-direction:column;gap:8px}
.asst-msg{max-width:86%;padding:10px 14px;font-size:14px;line-height:1.45;word-wrap:break-word}
.asst-bot{align-self:flex-start;background:#fff;border:1px solid #EFE6E8;border-radius:18px 18px 18px 4px}
.asst-bot p:last-child{margin-bottom:0!important}
.asst-me{align-self:flex-end;background:${RED};color:#fff;border-radius:18px 18px 4px 18px;white-space:pre-wrap}
.asst-card{align-self:stretch;margin-right:24px;background:#fff;border:1px solid #EFE6E8;border-radius:16px;overflow:hidden}
.asst-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;background:#F7EFF1;font-size:12px;font-weight:700;color:#7A1526}
.asst-card-foot{display:block;width:100%;padding:11px 14px;border:none;border-top:1px solid #F2EAEC;background:#fff;color:${RED};font:700 13px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
.asst-card-hint{padding:0 14px 10px;font-size:11px;color:#6B5E61}
.asst-trip{display:flex;align-items:center;gap:12px;padding:10px 10px 10px 14px;border-top:1px solid #F2EAEC}
.asst-trip-time{font-size:18px;font-weight:700;width:58px;flex-shrink:0}
.asst-trip-meta{flex:1;font-size:13px;color:#5E5255}
.asst-btn-pill{padding:8px 12px;border-radius:10px;background:#F4E8EA;color:#7A1526;font-size:13px;font-weight:700;text-decoration:none}
.asst-btn-pill:hover{background:#EBD6DA}
.asst-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px 14px 14px}
.asst-btn-main,.asst-btn-soft{display:flex;align-items:center;justify-content:center;gap:8px;height:44px;box-sizing:border-box;border-radius:12px;border:none;
  font:700 14px var(--font-opensans),Open Sans,sans-serif;text-decoration:none;cursor:pointer}
.asst-btn-main{background:${RED};color:#fff}
.asst-btn-main:disabled{opacity:.5;cursor:default}
.asst-btn-soft{background:#F4E8EA;color:#7A1526}
.asst-live{display:flex;align-items:center;gap:6px;color:#1F7A4D}
.asst-live-dot{width:8px;height:8px;border-radius:50%;background:#2E9E62;display:inline-block}
.asst-live-dot.light{background:#7CE3A2;width:7px;height:7px}
.asst-crew{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.asst-crew-name{font-size:13px;font-weight:600;color:#231A1C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asst-crew-name.muted{font-weight:400;color:#8A7D80;font-size:12px}
.asst-dot-sep{margin:0 5px;font-weight:400;color:#8A7D80}
.asst-plate{font-family:var(--font-mono),ui-monospace,monospace;font-size:12px;font-weight:500;color:#5E5255}
.asst-crew-sub{font-size:12px;color:#6B5E61}
.asst-crew-box{display:flex;align-items:center;gap:10px;margin:0 14px 10px;padding:10px 10px 10px 12px;border:1px solid #EFE6E8;border-radius:12px}
.asst-call{display:flex;align-items:center;gap:6px;flex-shrink:0;padding:8px 10px;border-radius:10px;background:#F4E8EA;color:#7A1526;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}
.asst-call:hover{background:#EBD6DA}
.asst-call.strong{background:;color:#fff}
.asst-call.compact{width:36px;height:36px;padding:0;justify-content:center}
.asst-pick{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid #F2EAEC;cursor:pointer}
.asst-pick.on{background:#F7EFF1}
.asst-pick input{width:18px;height:18px;margin:0;accent-color:${RED}}
.asst-map{position:relative;height:170px;overflow:hidden;background:#EFEAE3}
.asst-map img{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none}
.asst-map-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:50%;background:${RED};border:3px solid #fff;
  box-shadow:0 0 0 8px rgba(155,27,48,.18);color:#fff;display:flex;align-items:center;justify-content:center}
.asst-map-attr{position:absolute;right:4px;bottom:3px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.85);font-size:10px;color:#5E5255}
.asst-map-wrap{position:relative;height:200px;background:#EFEAE3}
.asst-map-wrap .asst-lf{position:absolute;inset:0;isolation:isolate;font-family:var(--font-opensans),Open Sans,sans-serif}
.asst-map-wrap.full{position:fixed;inset:0;z-index:90;height:auto;display:flex;flex-direction:column;background:#fff}
.asst-map-wrap.full .asst-lf{position:relative;inset:auto;flex:1}
.asst-map-top{display:flex;align-items:center;justify-content:space-between;gap:12px;height:64px;box-sizing:border-box;padding:10px 64px 10px 16px;border-bottom:1px solid #EFE6E8;font-size:15px}
.asst-map-expand{position:absolute;right:10px;top:10px;z-index:1000;width:38px;height:38px;border-radius:10px;border:none;background:#fff;color:#231A1C;
  box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;display:flex;align-items:center;justify-content:center}
.asst-map-wrap.full .asst-map-expand{top:13px;right:14px;box-shadow:none;background:#F4E8EA;color:#7A1526}
.asst-lf-icon{background:none!important;border:none!important}
.asst-lf-pin{width:32px;height:32px;border-radius:50%;background:#9B1B30;border:3px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 8px rgba(155,27,48,.18),0 3px 8px rgba(0,0,0,.25);animation:asst-pin 2.4s ease-out infinite}
@keyframes asst-pin{0%{box-shadow:0 0 0 0 rgba(155,27,48,.35),0 3px 8px rgba(0,0,0,.25)}70%{box-shadow:0 0 0 16px rgba(155,27,48,0),0 3px 8px rgba(0,0,0,.25)}100%{box-shadow:0 0 0 0 rgba(155,27,48,0),0 3px 8px rgba(0,0,0,.25)}}
.asst-live-dot.pulse{animation:asst-dot 2s infinite}
@keyframes asst-dot{0%{box-shadow:0 0 0 0 rgba(46,158,98,.6)}70%{box-shadow:0 0 0 6px rgba(46,158,98,0)}100%{box-shadow:0 0 0 0 rgba(46,158,98,0)}}
.asst-chips{display:flex;flex-wrap:wrap;gap:6px}
.asst-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #E3D6D9;background:#fff;color:#7A1526;border-radius:999px;padding:8px 12px;
  font:600 13px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
.asst-chip:hover{background:#F7EFF1}
.asst-chip.hot{border:none;background:${RED};color:#fff;font-weight:700}
.asst-typing{display:flex;gap:4px;padding:13px 14px}
.asst-typing span{width:7px;height:7px;border-radius:50%;background:${RED};opacity:.35;animation:asst-blink 1.2s infinite}
.asst-typing span:nth-child(2){animation-delay:.2s}.asst-typing span:nth-child(3){animation-delay:.4s}
@keyframes asst-blink{0%,80%,100%{opacity:.25}40%{opacity:.9}}
.asst-compose{padding:10px 12px;background:#fff;border-top:1px solid #EFE6E8;display:flex;flex-direction:column;gap:6px}
.asst-input{display:flex;align-items:center;gap:8px;padding:5px 5px 5px 16px;border:1px solid #E3D6D9;border-radius:26px;background:#FBF8F6}
.asst-input:focus-within{border-color:${RED};box-shadow:0 0 0 3px rgba(155,27,48,.12)}
.asst-input input{flex:1;min-width:0;border:none;background:transparent;font:15px var(--font-opensans),Open Sans,sans-serif;color:#231A1C;outline:none}
.asst-input button{width:40px;height:40px;flex-shrink:0;border:none;border-radius:50%;background:${RED};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
.asst-input button:disabled{background:#E3D6D9;cursor:default}
.asst-foot{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#6B5E61}
.asst-foot a{color:${RED};font-weight:600;text-decoration:none}
.asst-foot button{background:none;border:none;padding:0;color:${RED};font:600 11px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
@media (max-width:520px){
  .asst-panel{right:0;bottom:0;width:100%;height:100dvh;border-radius:0}
  .asst-launcher{right:16px;bottom:16px}
  .asst-teaser{right:16px;bottom:84px;width:calc(100vw - 32px);max-width:320px}
  .asst-input input{font-size:16px}
  .asst-compose{padding-bottom:max(10px,env(safe-area-inset-bottom))}
}
@media (max-width:380px){.asst-launcher-label{display:none}.asst-launcher{padding:0 17px}}
@media (prefers-reduced-motion:reduce){.asst-teaser,.asst-panel,.asst-lf-pin,.asst-live-dot.pulse{animation:none}}
`;
