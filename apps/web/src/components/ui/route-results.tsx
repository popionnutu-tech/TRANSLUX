"use client";

import * as React from "react";
import { searchTrips, type TripResult } from "@/app/(public)/actions";
import { aplicaReducere } from "@translux/db";
import { BiletCursa } from "./bilet-cursa";
import type { ContactPrecompletat } from "@/lib/telegram-client";
import { track } from "@/lib/track";
import { BuyTicketForm } from "./buy-ticket-form";

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
  /** Tur-retur ales din bara de căutare: ziua întoarcerii (YYYY-MM-DD); formularul pornește cu returul bifat. */
  dataRetur?: string | null;
}

export function RouteResults({ from, to, fromRo = "", toRo = "", trips, selectedTime, locale = "ro", onClose, contact = null, dataRetur = null }: RouteResultsProps) {
  const [cumpara, setCumpara] = React.useState<number | null>(null);
  // Tur-retur pe pași (Ion, 10.10.2026: «întâi alege ruta de pe tur și vede clar data sus, apoi alege cursa pe retur și
  // vede data clar sus, apoi locul din Chișinău»; «simplificăm tur-returul la cumpărare»).
  const tr = Boolean(dataRetur);
  const [returAles, setReturAles] = React.useState<TripResult | null>(null);
  const [curseRetur, setCurseRetur] = React.useState<TripResult[] | null>(null);
  const turAles = cumpara !== null ? trips[cumpara] : null;
  React.useEffect(() => {
    if (!tr || !turAles || !dataRetur) { setCurseRetur(null); setReturAles(null); return; }
    let viu = true;
    setCurseRetur(null); setReturAles(null);
    searchTrips(toRo, fromRo, dataRetur).then((r) => {
      if (!viu) return;
      setCurseRetur((r || []).filter((t) => t.sale_open && t.crm_route_id !== turAles.crm_route_id
        && (t.trip_date > turAles.trip_date || (t.trip_date === turAles.trip_date && t.time > turAles.arrivalTime))));
    }).catch(() => viu && setCurseRetur([]));
    return () => { viu = false; };
  }, [tr, turAles, dataRetur, fromRo, toRo]);
  const pas: 1 | 2 | 3 = !tr ? (turAles ? 3 : 1) : !turAles ? 1 : !returAles ? 2 : 3;
  const ziLunga = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
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
    const d = trips[0]?.trip_date;
    if (!d) return null;
    const t = new Date(`${d}T12:00:00Z`);
    return t.toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }, [trips, locale]);

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
    ? { curse: (n: number) => `${n} рейсов`, niciuna: "Рейсы не найдены", fara: "Нет прямых рейсов между этими пунктами", bilet: "Онлайн-билет", inapoi: "Назад к рейсам", maiMulte: "Ещё рейсы ниже" }
    : { curse: (n: number) => `${n} curse`, niciuna: "Nu s-au găsit curse", fara: "Nu există curse directe între aceste puncte", bilet: "Bilet online", inapoi: "Înapoi la curse", maiMulte: "Mai multe curse mai jos" };

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
        .route-results-scroll { max-height: 72vh; }
        @media (max-width: 768px) { .route-results-scroll { max-height: 80vh; } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
        .route-modal-backdrop { animation: backdropIn 0.2s ease-out; }
        .route-modal-content { animation: modalIn 0.25s ease-out; }
        .bilete-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
        @media (max-width: 420px) { .bilete-grid { grid-template-columns: 1fr; gap: 12px; } }
        @keyframes saltaJos { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 4px); } }
        .mai-jos { animation: saltaJos 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .route-modal-backdrop, .route-modal-content, .mai-jos { animation: none; } }
      `}</style>
      <div
        className="route-modal-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)" }}
      />
      <div className="route-modal-content" style={{
        position: "relative", zIndex: 1,
        width: ales ? "min(94vw, 900px)" : "min(94vw, 900px)",
        borderRadius: 22, overflow: "hidden", background: "#fff",
        boxShadow: "0 24px 60px rgba(60,20,30,0.16), 0 2px 8px rgba(0,0,0,0.05)",
        fontFamily: "var(--font-opensans), Open Sans, sans-serif", color: "#231A1C",
      }}>
        {/* Antetul: ruta, ziua, câte curse și prețul; la cumpărare — «Bilet online» cu întoarcerea la listă. */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #EFE4E6" }}>
          {ales && (
            <button type="button" onClick={() => { if (tr && returAles) setReturAles(null); else setCumpara(null); }} aria-label={tx.inapoi}
              style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "#F4EEEF", color: "#6B5B5F", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>&larr;</button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: ales ? 19 : 21, fontWeight: 800, lineHeight: 1.2 }}>
              {ales ? tx.bilet : <>{from} <span style={{ color: "#9B1B30" }}>&rarr;</span> {to}</>}
            </div>
            <div style={{ fontSize: 14, color: "#6B5B5F", marginTop: 2 }}>
              {ales ? <>{from} &rarr; {to}{dataCursei ? ` · ${dataCursei}` : ""}</> : (
                <>
                  {dataCursei && <span>{dataCursei}</span>}
                  <span>{dataCursei ? " · " : ""}{trips.length > 0 ? tx.curse(trips.length) : tx.niciuna}</span>
                  {preturi.length === 1 && <span> · {preturi[0]} lei</span>}
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "#F4EEEF", color: "#6B5B5F", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>&times;</button>
        </div>

        {tr && (
          <div style={{ padding: "12px 20px", background: pas === 2 ? "#fdf3e7" : "#F4EEEF", borderBottom: "1px solid #EFE4E6", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#9B1B30" }}>{locale === "ru" ? `Шаг ${pas} из 3` : `Pasul ${pas} din 3`}</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>
              {pas === 1 && <>{locale === "ru" ? "Туда" : "Tur"} · {from} → {to} · {dataCursei}</>}
              {pas === 2 && <>{locale === "ru" ? "Обратно" : "Retur"} · {to} → {from} · {dataRetur ? ziLunga(dataRetur) : ""}</>}
              {pas === 3 && (locale === "ru" ? "Место и оплата" : "Locul și plata")}
            </span>
          </div>
        )}
        <div style={{ position: "relative" }}>
        <div ref={scrollRef} className="route-results-scroll" style={{ overflowY: "auto", background: "#FAF6F5", padding: ales ? 0 : "16px 14px 20px" }}>
          {tr && ales && !returAles ? (
            <div style={{ padding: "16px 14px 20px" }}>
              {curseRetur == null && <div style={{ padding: 30, textAlign: "center", color: "#8A7A7D" }}>{locale === "ru" ? "Ищем обратные рейсы…" : "Se caută cursele de retur…"}</div>}
              {curseRetur != null && curseRetur.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#8A7A7D" }}>{locale === "ru" ? "В этот день нет обратных рейсов с онлайн-билетом. Вернитесь и выберите другой день." : "În ziua aceasta nu sunt curse de retur cu bilet online. Întoarce-te și alege altă zi."}</div>}
              <div className="bilete-grid">
                {(curseRetur ?? []).map((t, i) => {
                  const redus = aplicaReducere(t.price, 20);
                  return (
                    <div key={`r-${t.time}-${i}`} style={{ minWidth: 0 }}>
                      <BiletCursa trip={redus != null ? { ...t, originalPrice: t.price, price: redus } : t} locale={locale} cotor="lista"
                        onCumpara={() => { setReturAles(t); scrollRef.current?.scrollTo({ top: 0 }); }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : ales && fromRo && toRo ? (
            <BuyTicketForm trip={ales} fromRo={fromRo} toRo={toRo} locale={locale} onCancel={() => setCumpara(null)} contact={contact} returFix={tr ? returAles : null} />
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
