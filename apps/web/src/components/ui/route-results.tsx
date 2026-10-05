"use client";

import * as React from "react";
import type { TripResult } from "@/app/(public)/actions";
import { phoneTel, phoneText } from "@/lib/phone";
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
}

export function RouteResults({ from, to, fromRo = "", toRo = "", trips, selectedTime, locale = "ro", onClose }: RouteResultsProps) {
  const [cumpara, setCumpara] = React.useState<number | null>(null);
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

  const isNearby = (i: number) =>
    i >= selectedIdx - 2 && i <= selectedIdx + 2 && i !== selectedIdx;

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
        .route-results-scroll { max-height: 65vh; }
        @media (max-width: 768px) { .route-results-scroll { max-height: 75vh; } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
        .route-modal-backdrop { animation: backdropIn 0.2s ease-out; }
        .route-modal-content { animation: modalIn 0.25s ease-out; }
        .trip-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08) !important; }
        .call-btn:hover { transform: scale(1.05); box-shadow: 0 2px 8px rgba(34,197,94,0.4) !important; }
        .call-btn { transition: all 0.15s ease; }
      `}</style>
      <div
        className="route-modal-backdrop"
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)",
        }}
      />
      <div className="route-modal-content" style={{
        position: "relative", zIndex: 1,
        width: "min(92vw, 680px)",
        borderRadius: 20, overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.05)",
      }}>
        {/* Header */}
        <div style={{
          background: "#fff",
          padding: "16px 20px 12px",
          textAlign: "center",
          borderBottom: "1px solid #f0f0f0",
          position: "relative",
        }}>
          <button
            onClick={() => (cumpara !== null ? setCumpara(null) : onClose())}
            style={{
              position: "absolute", right: 10, top: 10,
              width: 44, height: 44, borderRadius: "50%",
              border: "none", background: "rgba(0,0,0,0.05)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#999", fontSize: 16,
            }}
            aria-label="Close"
          >&times;</button>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10,
          }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: "#9B1B30",
              letterSpacing: "0.04em",
              fontFamily: "var(--font-opensans), Open Sans, sans-serif",
            }}>
              {from.toUpperCase()} &rarr; {to.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 14, color: "#555", fontWeight: 600, marginTop: 3 }}>
            {dataCursei && <span>{dataCursei}</span>}
            {cumpara === null && (
              <span>{dataCursei ? " · " : ""}{trips.length > 0
                ? (locale === "ru" ? `${trips.length} рейсов` : `${trips.length} curse`)
                : (locale === "ru" ? "Рейсы не найдены" : "Nu s-au găsit curse")}</span>
            )}
          </div>
        </div>

        {/* Scrollable trips */}
        <div
          ref={scrollRef}
          className="route-results-scroll"
          style={{
            overflowY: "auto",
            background: "#f8f8f8",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {trips.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>
              {locale === "ru"
                ? "Нет прямых рейсов между этими пунктами"
                : "Nu există curse directe între aceste puncte"}
            </div>
          )}
          {trips.map((trip, i) => {
            // ION-238: după «Cumpără» rămâne doar cursa aleasă, până la «Renunță» sau «×».
            if (cumpara !== null && i !== cumpara) return null;
            const isSelected = i === selectedIdx;
            const near = isNearby(i);
            const deschis = cumpara === i;
            // Mereu +373 (Ion, 23.09): din străinătate «069…» nu sună, iar linkul fără «+» nici el.
            const displayPhone = trip.phone ? phoneText(trip.phone) : null;
            const hasOffer = trip.originalPrice != null && trip.originalPrice > 0;
            return (
              <div
                key={`${trip.time}-${i}`}
                ref={isSelected ? selectedRef : undefined}
                className="trip-card"
                style={{
                  display: "grid", gridTemplateColumns: "56px minmax(0, 1fr) auto", columnGap: 10, rowGap: 8,
                  alignItems: "center", padding: "12px",
                  borderRadius: 12,
                  background: isSelected && !deschis ? "rgba(155,27,48,0.04)" : "#fff",
                  border: deschis
                    ? `2px solid #9B1B30`
                    : isSelected
                      ? "1px solid rgba(155,27,48,0.2)"
                      : near
                        ? "1px solid rgba(155,27,48,0.1)"
                        : "1px solid #e6e6e6",
                  transition: "all 0.15s",
                }}
              >
                {/* Ora */}
                <div style={{
                  gridRow: deschis ? "1" : "1 / 3", alignSelf: "start",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-opensans), Open Sans, sans-serif",
                  textAlign: "center",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.1, color: isSelected || near ? "#9B1B30" : "#222" }}>
                    {trip.time}
                  </div>
                  {trip.arrivalTime && (
                    <div style={{ fontSize: 13, marginTop: 2, color: "#666" }}>&rarr; {trip.arrivalTime}</div>
                  )}
                </div>

                {/* Telefonul șoferului, cu numele sub el (ION-238, fără numărul mașinii) */}
                {trip.isAwaitingDriver ? (
                  <div style={{ fontSize: 13, color: "#666", fontStyle: "italic", lineHeight: 1.3, minWidth: 0 }}>
                    {locale === "ru"
                      ? "Данные водителя будут доступны ближе к дате отправления"
                      : "Datele șoferului vor fi disponibile mai aproape de data plecării"}
                  </div>
                ) : displayPhone ? (
                  <a
                    href={phoneTel(trip.phone!)}
                    onClick={(e) => {
                      e.stopPropagation();
                      track({
                        event_type: 'call',
                        mod: 'mai_tarziu',
                        from_locality: from,
                        to_locality: to,
                        driver_phone: trip.phone,
                      });
                    }}
                    className="call-btn"
                    style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", minWidth: 0, minHeight: 44 }}
                    aria-label={`Sună ${trip.driver ?? ""}`}
                  >
                    <span style={{
                      width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                      background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(22,163,74,0.25)",
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#222", whiteSpace: "nowrap" }}>{displayPhone}</span>
                      {trip.driver && (
                        <span style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.driver}</span>
                      )}
                    </span>
                  </a>
                ) : (
                  <div style={{ fontSize: 13, color: "#999" }}>{trip.driver ?? "—"}</div>
                )}

                {/* Prețul */}
                {trip.price > 0 ? (
                  <div style={{
                    justifySelf: "end",
                    background: hasOffer ? "#16a34a" : "#9B1B30",
                    color: "#fff", fontSize: 15, fontWeight: 700,
                    padding: "6px 12px", borderRadius: 20,
                    fontFamily: "var(--font-opensans), Open Sans, sans-serif",
                    whiteSpace: "nowrap",
                  }}>
                    {hasOffer && (
                      <span style={{ fontSize: 12, textDecoration: "line-through", opacity: 0.75, marginRight: 4 }}>{trip.originalPrice}</span>
                    )}
                    {trip.price} lei
                  </div>
                ) : <span />}

                {/* Biletele online (ION-197): doar când panoul spune că se vinde acum pe cursa asta. */}
                {trip.sale_open && fromRo && toRo && (deschis ? (
                  <div style={{ gridColumn: "1 / 4", borderTop: "1px solid #eee", paddingTop: 12 }}>
                    <BuyTicketForm trip={trip} fromRo={fromRo} toRo={toRo} locale={locale} onCancel={() => setCumpara(null)} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCumpara(i)}
                    style={{
                      gridColumn: "2 / 4", minHeight: 48, borderRadius: 12,
                      border: "none", background: "#9B1B30", color: "#fff",
                      fontWeight: 700, fontSize: 16, cursor: "pointer",
                    }}
                  >
                    {locale === "ru" ? "Купить билет онлайн" : "Cumpără bilet online"}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
