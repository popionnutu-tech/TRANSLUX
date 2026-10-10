"use client";

import * as React from "react";
import type { TripResult } from "@/app/(public)/actions";
import { BiletCursa } from "./bilet-cursa";
import type { ContactPrecompletat } from "@/lib/telegram-client";
import { track } from "@/lib/track";
import { BuyTicketForm } from "./buy-ticket-form";
import type { CumparareSalvata } from "@/lib/cumparare-salvata";

interface RouteResultsProps {
  from: string;
  /** Numele RO ale opririlor (valorile selectoarelor), pentru comanda de bilet. */
  fromRo?: string;
  toRo?: string;
  to: string;
  trips: TripResult[];
  selectedTime: string | null;
  locale?: "ro" | "ru";
  onClose: () => void;
  /** ION-249: în mini app-ul Telegram, numele și telefonul din ultima comandă a contului precompletează formularul. */
  contact?: ContactPrecompletat | null;
  /** Plată eșuată reluată: formularul cursei se deschide direct, la plată. */
  reluare?: CumparareSalvata | null;
  /** Ziua căutată (YYYY-MM-DD); fără ea — ziua primei curse. */
  zi?: string | null;
  /** Antetul B2 (Ion, 11.10.2026): banda cu ziua dinainte / ziua aleasă / ziua de după caută din nou. */
  onZi?: (zi: string) => void;
  /** ⇄ în antet: același drum invers, aceeași zi. */
  onInverseaza?: () => void;
  /** Creionul: înapoi la formularul de căutare. */
  onEditeaza?: () => void;
  /** Căutarea pentru altă zi / alt sens e în curs — lista se estompează. */
  seIncarca?: boolean;
}

const ZILE_SCURTE = { ro: ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"], ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] };
const LUNI_SCURTE = {
  ro: ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sept", "oct", "nov", "dec"],
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
};

function plusZile(zi: string, n: number): string {
  const d = new Date(`${zi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** «Mar 13 oct» — formatul datei de la FlixBus (Ion, 11.10.2026). */
function ziScurta(zi: string, locale: "ro" | "ru"): string {
  const d = new Date(`${zi}T12:00:00Z`);
  return `${ZILE_SCURTE[locale][d.getUTCDay()]} ${d.getUTCDate()} ${LUNI_SCURTE[locale][d.getUTCMonth()]}`;
}

function azi(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RouteResults({ from, to, fromRo = "", toRo = "", trips, selectedTime, locale = "ro", onClose, contact = null, reluare = null, zi = null, onZi, onInverseaza, onEditeaza, seIncarca = false }: RouteResultsProps) {
  const [cumpara, setCumpara] = React.useState<number | null>(reluare ? 0 : null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const selectedRef = React.useRef<HTMLDivElement>(null);

  const selectedIdx = React.useMemo(() => {
    if (!selectedTime || trips.length === 0) return 0;
    const sel = timeToMinutes(selectedTime);
    let best = 0;
    let bestDiff = Infinity;
    trips.forEach((t, i) => {
      const diff = Math.abs(timeToMinutes(t.time) - sel);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }, [selectedTime, trips]);

  React.useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const el = selectedRef.current;
      const wrap = scrollRef.current;
      const cardH = el.offsetHeight + 1;
      wrap.scrollTop = el.offsetTop - cardH * 2;
    }
  }, [selectedIdx]);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Data cursei în antet (ION-238): omul vede ziua înainte să plătească.
  const dataCursei = React.useMemo(() => {
    const d = zi ?? trips[0]?.trip_date;
    if (!d) return null;
    const t = new Date(`${d}T12:00:00Z`);
    return t.toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }, [zi, trips, locale]);
  const ziua = zi ?? trips[0]?.trip_date ?? null;

  // Semnul «mai sunt curse dedesubt» (Ion, 09.10.2026: «să fie un semn de scroll în jos pentru mai multe, și rutele de
  // mai jos lângă scroll să fie mai transparente, și desktop și mobile»): val care decolorează jos + butonul «↓».
  const [maiJos, setMaiJos] = React.useState(false);
  const verificaJos = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMaiJos(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
  }, []);
  React.useEffect(() => {
    verificaJos();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", verificaJos, { passive: true });
    window.addEventListener("resize", verificaJos);
    const t = window.setTimeout(verificaJos, 300);
    return () => { el.removeEventListener("scroll", verificaJos); window.removeEventListener("resize", verificaJos); window.clearTimeout(t); };
  }, [verificaJos, trips.length, cumpara]);
  const coboara = () => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ top: Math.round(el.clientHeight * 0.75), behavior: "smooth" });
  };

  // Prețul comun al zilei în antet, dacă toate cursele au același preț (de obicei da).
  const preturi = [...new Set(trips.filter((t) => t.price > 0).map((t) => t.price))];
  const ales = cumpara !== null ? trips[cumpara] : null;
  const tx = locale === "ru"
    ? { curse: (n: number) => `${n} рейсов`, niciuna: "Рейсы не найдены", fara: "Нет прямых рейсов между этими пунктами", bilet: "Онлайн-билет", inapoi: "Назад к рейсам", maiMulte: "Ещё рейсы ниже", inchide: "Закрыть", invers: "Обратное направление", editeaza: "Изменить поиск", zile: "Выбор дня" }
    : { curse: (n: number) => `${n} curse`, niciuna: "Nu s-au găsit curse", fara: "Nu există curse directe între aceste puncte", bilet: "Bilet online", inapoi: "Înapoi la curse", maiMulte: "Mai multe curse mai jos", inchide: "Închide", invers: "Sensul invers", editeaza: "Schimbă căutarea", zile: "Alege ziua" };
  // Banda zilelor: ziua dinainte (doar dacă nu e în trecut), ziua aleasă, ziua de după.
  const zileBanda = ziua && onZi && !ales ? [plusZile(ziua, -1), ziua, plusZile(ziua, 1)] : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 99,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        .route-results-scroll { max-height: 64vh; }
        .route-results-scroll.cumpara { max-height: 72vh; }
        .rr-btn { width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,0.16); color: #fff; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; padding: 0; }
        .rr-btn:focus-visible, .rr-zi:focus-visible, .rr-inv:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .rr-inv { width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.55); background: transparent; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; padding: 0; transition: transform .2s ease; }
        .rr-inv:active { transform: rotate(180deg); }
        .rr-loc { font-size: 21px; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rr-zi { white-space: nowrap; font-family: inherit; font-size: 16px; font-weight: 500; color: #fff; background: transparent; border: 2px solid transparent; border-radius: 999px; padding: 6px 14px; cursor: pointer; opacity: .85; min-height: 40px; }
        .rr-zi.ales { font-weight: 700; border-color: #fff; opacity: 1; cursor: default; }
        @media (max-width: 768px) {
          .route-results-scroll { max-height: calc(100dvh - 210px); }
          .route-results-scroll.cumpara { max-height: calc(100dvh - 112px); }
          .rr-loc { font-size: 18px; }
          .rr-zi { font-size: 15px; padding: 6px 10px; }
          .route-antet.cumpara { padding: 8px 12px 28px !important; }
          .route-antet.cumpara button { width: 38px !important; height: 38px !important; }
          .route-antet.cumpara .titlu { font-size: 17px !important; }
          .route-antet.cumpara .sub { font-size: 13px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
        .route-modal-backdrop { animation: backdropIn 0.2s ease-out; }
        .route-modal-content { animation: modalIn 0.25s ease-out; }
        .bilete-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
        @media (max-width: 420px) { .bilete-grid { grid-template-columns: 1fr; gap: 12px; } }
        @keyframes saltaJos { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 4px); } }
        .mai-jos { animation: saltaJos 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .route-modal-backdrop, .route-modal-content, .mai-jos { animation: none; } .rr-inv { transition: none; } }
      `}</style>
      <div
        className="route-modal-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)" }}
      />
      <div className="route-modal-content" style={{
        position: "relative", zIndex: 1,
        width: ales ? "min(94vw, 900px)" : "min(94vw, 900px)",
        borderRadius: 22, overflow: "hidden", background: "#9B1B30",
        boxShadow: "0 24px 60px rgba(60,20,30,0.16), 0 2px 8px rgba(0,0,0,0.05)",
        fontFamily: "var(--font-main), Roboto, sans-serif", color: "#231A1C",
      }}>
        {/* Antetul B2 (Ion, 11.10.2026: «aplică B»; ca la easyBus/FlixBus): bandă vișinie cu ruta și ⇄, ziua dinainte / ziua
            aleasă / ziua de după în formatul «Mar 13 oct», lista urcă pe sub o foaie albă rotunjită. La cumpărare — «Bilet online»
            cu întoarcerea la listă. */}
        <div className={`route-antet${ales ? " cumpara" : ""}`} style={{ background: "#9B1B30", color: "#fff", padding: "12px 16px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {ales ? (
              <button type="button" className="rr-btn" onClick={() => setCumpara(null)} aria-label={tx.inapoi} style={{ fontSize: 20 }}>&larr;</button>
            ) : (
              <button type="button" className="rr-btn" onClick={onClose} aria-label={tx.inchide} style={{ fontSize: 22 }}>&times;</button>
            )}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {ales ? (
                <span className="rr-loc titlu">{tx.bilet}</span>
              ) : (
                <>
                  <span className="rr-loc titlu">{from}</span>
                  {onInverseaza ? (
                    <button type="button" className="rr-inv" onClick={onInverseaza} disabled={seIncarca} aria-label={tx.invers} title={tx.invers}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4" /></svg>
                    </button>
                  ) : (
                    <span aria-hidden="true" style={{ fontSize: 20 }}>&rarr;</span>
                  )}
                  <span className="rr-loc">{to}</span>
                </>
              )}
            </div>
            {ales ? (
              <button type="button" className="rr-btn" onClick={onClose} aria-label={tx.inchide} style={{ fontSize: 22 }}>&times;</button>
            ) : onEditeaza ? (
              <button type="button" className="rr-btn" onClick={onEditeaza} aria-label={tx.editeaza} title={tx.editeaza}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            ) : (
              <span style={{ width: 40, flexShrink: 0 }} />
            )}
          </div>
          {zileBanda && onZi && (
            <div role="group" aria-label={tx.zile} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 4, marginTop: 12 }}>
              {zileBanda.map((z, k) => (
                <div key={z} style={{ display: "flex", justifyContent: k === 0 ? "flex-start" : k === 2 ? "flex-end" : "center" }}>
                  {k === 0 && z < azi() ? null : (
                    <button type="button" className={`rr-zi${k === 1 ? " ales" : ""}`} aria-current={k === 1 ? "date" : undefined}
                      disabled={seIncarca && k !== 1} onClick={k === 1 ? undefined : () => onZi(z)}>{ziScurta(z, locale)}</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="sub" style={{ textAlign: "center", fontSize: 14, opacity: 0.88, marginTop: zileBanda ? 8 : 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {ales ? <>{from} &rarr; {to}{dataCursei ? ` · ${dataCursei}` : ""}</> : (
              <>
                {!zileBanda && dataCursei && <span>{dataCursei} · </span>}
                <span>{trips.length > 0 ? tx.curse(trips.length) : tx.niciuna}</span>
                {preturi.length === 1 && <span> · {preturi[0]} lei</span>}
              </>
            )}
          </div>
        </div>

        <div style={{ position: "relative", marginTop: -20, borderRadius: "22px 22px 0 0", overflow: "hidden", background: "#FAF6F5" }}>
        <div ref={scrollRef} className={`route-results-scroll${ales ? " cumpara" : ""}`} aria-busy={seIncarca}
          style={{ overflowY: "auto", background: "#FAF6F5", padding: ales ? "4px 0 0" : "18px 14px 20px", opacity: seIncarca ? 0.45 : 1, pointerEvents: seIncarca ? "none" : undefined, transition: "opacity .15s" }}>
          {ales && fromRo && toRo ? (
            <BuyTicketForm trip={ales} fromRo={fromRo} toRo={toRo} locale={locale} onCancel={() => setCumpara(null)} contact={contact}
              reluare={reluare && cumpara === 0 ? reluare : null} from={from} to={to} />
          ) : (
            <>
              {trips.length === 0 && (
                <div style={{ padding: 40, textAlign: "center", color: "#8A7A7D", fontSize: 14 }}>{tx.fara}</div>
              )}
              <div className="bilete-grid">
                {trips.map((trip, i) => (
                  <div key={`${trip.time}-${i}`} ref={i === selectedIdx ? selectedRef : undefined} style={{ minWidth: 0 }}>
                    <BiletCursa
                      trip={trip} locale={locale} cotor="lista" evidentiat={i === selectedIdx}
                      onCumpara={trip.sale_open && fromRo && toRo ? () => { setCumpara(i); scrollRef.current?.scrollTo({ top: 0 }); } : undefined}
                      onSuna={() => track({ event_type: 'call', mod: 'mai_tarziu', from_locality: from, to_locality: to, driver_phone: trip.phone })}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        {!ales && maiJos && (
          <>
            {/* Valul: cursele de lângă marginea de jos se văd mai transparente, deci se înțelege că lista continuă. */}
            <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 8, bottom: 0, height: 120, pointerEvents: "none", background: "linear-gradient(to bottom, rgba(250,246,245,0) 0%, rgba(250,246,245,0.75) 55%, rgba(250,246,245,0.97) 100%)" }} />
            <button type="button" onClick={coboara} className="mai-jos"
              style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 18px", borderRadius: 999, border: "none", background: "#231A1C", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 20px rgba(35,26,28,0.25)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              {tx.maiMulte}
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
