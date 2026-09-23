'use client';

// Asistentul din colțul dreapta-jos al translux.md (ION-37). Cererea clientului:
// «în colțul drept de jos al paginii, cu un text bubble unde spune „sunt asistent
// care te ajută cu orice întrebare" (ca să atragă atenția)».
//
// Widget-ul doar desenează: modelul, tool-urile și istoria stau pe central-hub
// (/api/asistent-site), lângă tool-urile liniei 060401010.

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Phone, Send, X, MapPin, Navigation } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { parseAssistantText, type Inline } from '@/lib/assistant-text';

const ENDPOINT = process.env.NEXT_PUBLIC_ASSISTANT_URL || 'https://central-hub-md.vercel.app/api/asistent-site';
const RED = '#9B1B30';
const LINE_TEL = 'tel:+37360401010';
const STORE_KEY = 'translux_asistent_v1';
const TEASER_KEY = 'translux_asistent_teaser_closed';

const TEXT = {
  ro: {
    teaser: 'Sunt asistentul care te ajută cu orice întrebare',
    title: 'Asistent TRANSLUX',
    subtitle: 'Curse, lucruri uitate, reclamații',
    hello: 'Bună! Sunt asistentul TRANSLUX. Te ajut să găsești cursa, un lucru uitat în autobuz, să lași o reclamație sau să ajungi la stație. Ce te interesează?',
    placeholder: 'Scrie întrebarea…',
    send: 'Trimite',
    open: 'Deschide asistentul',
    close: 'Închide',
    call: 'Sună la 060 401 010',
    typing: 'Asistentul scrie',
    error: 'Nu am putut trimite mesajul. Verifică internetul sau sună la 060 401 010.',
    restart: 'Conversație nouă',
    note: 'Asistent AI. Nu scrie date de card.',
    maps: { google: 'Deschide în Google Maps', waze: 'Deschide în Waze' },
    chips: [
      'Găsește o cursă pentru mâine',
      'Am uitat ceva în autobuz',
      'Vreau să las o reclamație',
      'Unde e stația din Chișinău?',
      'Pot plăti biletul online?',
    ],
  },
  ru: {
    teaser: 'Я ассистент, помогу с любым вопросом',
    title: 'Ассистент TRANSLUX',
    subtitle: 'Рейсы, забытые вещи, жалобы',
    hello: 'Здравствуйте! Я ассистент TRANSLUX. Помогу найти рейс, забытую в автобусе вещь, оставить жалобу или добраться до станции. Что вас интересует?',
    placeholder: 'Напишите вопрос…',
    send: 'Отправить',
    open: 'Открыть ассистента',
    close: 'Закрыть',
    call: 'Позвонить 060 401 010',
    typing: 'Ассистент пишет',
    error: 'Не удалось отправить сообщение. Проверьте интернет или позвоните 060 401 010.',
    restart: 'Новый разговор',
    note: 'AI-ассистент. Не пишите данные карты.',
    maps: { google: 'Открыть в Google Maps', waze: 'Открыть в Waze' },
    chips: [
      'Найти рейс на завтра',
      'Забытая вещь в автобусе',
      'Хочу оставить жалобу',
      'Где станция в Кишинёве?',
      'Можно оплатить билет онлайн?',
    ],
  },
} as const;

interface Msg { role: 'user' | 'assistant'; text: string }
interface Saved { conversationId: string | null; messages: Msg[] }

function load(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch { return null; }
}
function save(s: Saved) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* fără stocare, merge și așa */ }
}

function InlineParts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold') return <strong key={i} style={{ fontWeight: 700 }}>{p.text}</strong>;
        if (p.kind === 'link') return <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" style={{ color: RED, wordBreak: 'break-all' }}>{p.label}</a>;
        if (p.kind === 'tel') return <a key={i} href={p.href} style={{ color: RED, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.label}</a>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function AssistantText({ text, locale }: { text: string; locale: Locale }) {
  const i = TEXT[locale];
  return (
    <>
      {parseAssistantText(text).map((b, k) => {
        if (b.kind === 'map') {
          const Icon = b.provider === 'google' ? MapPin : Navigation;
          return (
            <a key={k} href={b.href} target="_blank" rel="noopener noreferrer" className="asst-map">
              <Icon size={15} aria-hidden /> {i.maps[b.provider]}
            </a>
          );
        }
        if (b.kind === 'bullet') {
          return <div key={k} style={{ display: 'flex', gap: 8, margin: '2px 0' }}><span style={{ color: RED }}>•</span><span><InlineParts parts={b.parts} /></span></div>;
        }
        return <p key={k} style={{ margin: '0 0 6px' }}><InlineParts parts={b.parts} /></p>;
      })}
    </>
  );
}

export default function AssistantWidget({ locale }: { locale: Locale }) {
  const i = TEXT[locale];
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = load();
    if (s) { setMessages(s.messages); setConversationId(s.conversationId); }
    let closed = false;
    try { closed = localStorage.getItem(TEASER_KEY) === '1'; } catch { /* nimic */ }
    if (closed) return;
    const t = setTimeout(() => setTeaser(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { save({ conversationId, messages }); }, [conversationId, messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const closeTeaser = () => {
    setTeaser(false);
    try { localStorage.setItem(TEASER_KEY, '1'); } catch { /* nimic */ }
  };

  const openChat = () => { setOpen(true); closeTeaser(); };

  async function send(text: string) {
    const message = text.trim().slice(0, 1000);
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation_id: conversationId, locale }),
      });
      const data = await res.json().catch(() => null) as { reply?: string; conversation_id?: string | null } | null;
      if (data && 'conversation_id' in data) setConversationId(data.conversation_id ?? null);
      setMessages((m) => [...m, { role: 'assistant', text: data?.reply || i.error }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: i.error }]);
    } finally {
      setBusy(false);
    }
  }

  const restart = () => { setMessages([]); setConversationId(null); };

  return (
    <>
      <style>{CSS}</style>

      {!open && teaser && (
        <div className="asst-teaser" role="status">
          <button type="button" className="asst-teaser-text" onClick={openChat}>{i.teaser}</button>
          <button type="button" className="asst-teaser-x" onClick={closeTeaser} aria-label={i.close}><X size={14} /></button>
        </div>
      )}

      {!open && (
        <button type="button" className="asst-launcher" onClick={openChat} aria-label={i.open}>
          <MessageCircle size={26} strokeWidth={2} aria-hidden />
        </button>
      )}

      {open && (
        <section className="asst-panel" role="dialog" aria-label={i.title}>
          <header className="asst-head">
            <div className="asst-avatar" aria-hidden><MessageCircle size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="asst-title">{i.title}</div>
              <div className="asst-sub"><span className="asst-dot" />{i.subtitle}</div>
            </div>
            <a href={LINE_TEL} className="asst-icon" aria-label={i.call} title={i.call}><Phone size={18} /></a>
            <button type="button" className="asst-icon" onClick={() => setOpen(false)} aria-label={i.close}><X size={20} /></button>
          </header>

          <div className="asst-list" ref={listRef} aria-live="polite">
            <div className="asst-msg asst-bot"><AssistantText text={i.hello} locale={locale} /></div>
            {messages.length === 0 && (
              <div className="asst-chips">
                {i.chips.map((c) => <button key={c} type="button" className="asst-chip" onClick={() => send(c)}>{c}</button>)}
              </div>
            )}
            {messages.map((m, k) => (
              <div key={k} className={`asst-msg ${m.role === 'user' ? 'asst-me' : 'asst-bot'}`}>
                {m.role === 'user' ? m.text : <AssistantText text={m.text} locale={locale} />}
              </div>
            ))}
            {busy && (
              <div className="asst-msg asst-bot asst-typing" aria-label={i.typing}><span /><span /><span /></div>
            )}
          </div>

          <form className="asst-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={i.placeholder}
              rows={1}
              maxLength={1000}
              aria-label={i.placeholder}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label={i.send}><Send size={18} /></button>
          </form>
          <div className="asst-foot">
            <span>{i.note}</span>
            {messages.length > 0 && <button type="button" onClick={restart}>{i.restart}</button>}
          </div>
        </section>
      )}
    </>
  );
}

// Culorile și sticla sunt ale cardului principal al site-ului (hero-card):
// burgundiu #9B1B30, alb translucid cu blur, umbră caldă.
const CSS = `
.asst-launcher{position:fixed;right:16px;bottom:64px;z-index:45;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;
  color:#fff;background:linear-gradient(145deg,#b8243d,${RED});box-shadow:0 10px 30px rgba(155,27,48,.35),0 2px 6px rgba(0,0,0,.12);
  display:flex;align-items:center;justify-content:center;transition:transform .18s ease}
.asst-launcher:hover{transform:translateY(-2px) scale(1.04)}
.asst-launcher::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid ${RED};animation:asst-ring 2.4s ease-out infinite;pointer-events:none}
@keyframes asst-ring{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.55);opacity:0}}
.asst-teaser{position:fixed;right:84px;bottom:74px;z-index:45;display:flex;align-items:flex-start;gap:4px;max-width:250px;
  background:rgba(255,255,255,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(155,27,48,.12);
  border-radius:16px 16px 4px 16px;padding:10px 8px 10px 14px;box-shadow:0 8px 30px rgba(155,27,48,.14);animation:asst-in .35s ease}
.asst-teaser-text{background:none;border:none;padding:0;text-align:left;cursor:pointer;font:600 13.5px/1.35 var(--font-opensans),Open Sans,sans-serif;color:#3a1a20}
.asst-teaser-x{background:none;border:none;cursor:pointer;color:#999;padding:2px;line-height:0}
@keyframes asst-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.asst-panel{position:fixed;right:16px;bottom:16px;z-index:60;width:380px;height:min(600px,calc(100vh - 32px));display:flex;flex-direction:column;
  background:rgba(255,255,255,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.6);
  border-radius:22px;box-shadow:0 18px 60px rgba(155,27,48,.18),0 2px 8px rgba(0,0,0,.06);overflow:hidden;animation:asst-in .25s ease;
  font-family:var(--font-opensans),Open Sans,sans-serif}
.asst-head{display:flex;align-items:center;gap:10px;padding:14px 12px 14px 16px;color:#fff;background:linear-gradient(135deg,#b8243d,${RED} 60%,#7d1526)}
.asst-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.asst-title{font-weight:700;font-size:15px;letter-spacing:.2px}
.asst-sub{font-size:12px;opacity:.85;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asst-dot{width:7px;height:7px;border-radius:50%;background:#7CE38B;flex-shrink:0}
.asst-icon{width:36px;height:36px;border-radius:10px;border:none;background:transparent;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
.asst-icon:hover{background:rgba(255,255,255,.15)}
.asst-list{flex:1;overflow-y:auto;padding:16px 14px 8px;display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,rgba(155,27,48,.03),transparent 120px)}
.asst-msg{max-width:86%;padding:10px 13px;font-size:14px;line-height:1.45;border-radius:16px;word-wrap:break-word}
.asst-bot{align-self:flex-start;background:#fff;color:#2b2b2b;border:1px solid rgba(155,27,48,.08);border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.asst-bot p:last-child{margin-bottom:0!important}
.asst-me{align-self:flex-end;background:${RED};color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}
.asst-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 4px}
.asst-chip{border:1px solid rgba(155,27,48,.25);background:rgba(255,255,255,.8);color:${RED};border-radius:999px;padding:7px 12px;font:600 12.5px var(--font-opensans),Open Sans,sans-serif;cursor:pointer;transition:background .15s}
.asst-chip:hover{background:rgba(155,27,48,.07)}
.asst-map{display:flex;align-items:center;gap:8px;margin:6px 0 2px;padding:9px 12px;border-radius:12px;background:rgba(155,27,48,.06);color:${RED};font-weight:600;font-size:13.5px;text-decoration:none}
.asst-map:hover{background:rgba(155,27,48,.11)}
.asst-typing{display:flex;gap:4px;padding:13px 14px}
.asst-typing span{width:7px;height:7px;border-radius:50%;background:${RED};opacity:.35;animation:asst-blink 1.2s infinite}
.asst-typing span:nth-child(2){animation-delay:.2s}.asst-typing span:nth-child(3){animation-delay:.4s}
@keyframes asst-blink{0%,80%,100%{opacity:.25}40%{opacity:.9}}
.asst-form{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid rgba(155,27,48,.08);background:rgba(255,255,255,.7)}
.asst-form textarea{flex:1;resize:none;border:1px solid rgba(155,27,48,.18);border-radius:14px;padding:10px 12px;font:14px/1.4 var(--font-opensans),Open Sans,sans-serif;max-height:110px;outline:none;background:#fff;color:#222}
.asst-form textarea:focus{border-color:${RED};box-shadow:0 0 0 3px rgba(155,27,48,.12)}
.asst-form button{width:42px;height:42px;border-radius:12px;border:none;background:${RED};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.asst-form button:disabled{opacity:.4;cursor:default}
.asst-foot{display:flex;justify-content:space-between;gap:8px;padding:0 14px 10px;font-size:11px;color:#8a8a8a;background:rgba(255,255,255,.7)}
.asst-foot button{background:none;border:none;padding:0;color:${RED};font:600 11px var(--font-opensans),Open Sans,sans-serif;cursor:pointer}
@media (max-width:520px){
  .asst-panel{right:0;bottom:0;width:100%;height:100dvh;border-radius:0}
  .asst-teaser{right:82px;max-width:calc(100vw - 110px)}
  .asst-form textarea{font-size:16px}
}
@media (prefers-reduced-motion:reduce){.asst-launcher::after,.asst-teaser,.asst-panel{animation:none}}
`;
