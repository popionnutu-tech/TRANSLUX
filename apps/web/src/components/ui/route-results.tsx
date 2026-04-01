"use client";

import * as React from "react";
import type { TripResult } from "@/app/(public)/actions";

interface RouteResultsProps {
  from: string;
  to: string;
  trips: TripResult[];
  selectedTime: string | null;
  locale?: "ro" | "ru";
  onClose: () => void;
}

export function RouteResults({ from, to, trips, selectedTime, locale = "ro", onClose }: RouteResultsProps) {
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
        .trip-row:hover { background: rgba(155,27,48,0.04) !important; }
        .call-btn:hover { transform: scale(1.1); box-shadow: 0 2px 8px rgba(34,197,94,0.4); }
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
            onClick={onClose}
            style={{
              position: "absolute", right: 14, top: 14,
              width: 28, height: 28, borderRadius: "50%",
              border: "none", background: "rgba(0,0,0,0.05)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#999", fontSize: 16,
            }}
            aria-label="Close"
          >&times;</button>
          <div style={{
            fontSize: 14, fontWeight: 700, color: "#9B1B30",
            letterSpacing: "0.04em",
            fontFamily: "var(--font-opensans), Open Sans, sans-serif",
          }}>
            {from.toUpperCase()} &rarr; {to.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: "#aaa", marginTop: 3, letterSpacing: "0.02em" }}>
            {trips.length > 0
              ? (locale === "ru" ? `${trips.length} рейсов найдено` : `${trips.length} curse găsite`)
              : (locale === "ru" ? "Рейсы не найдены" : "Nu s-au găsit curse")}
          </div>
        </div>

        {/* Scrollable trips */}
        <div
          ref={scrollRef}
          className="route-results-scroll"
          style={{
            overflowY: "auto",
            background: "#fff",
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
            const isSelected = i === selectedIdx;
            const near = isNearby(i);
            return (
              <div
                key={`${trip.time}-${i}`}
                ref={isSelected ? selectedRef : undefined}
                className="trip-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  borderLeft: `3px solid ${isSelected ? "#9B1B30" : near ? "rgba(155,27,48,0.3)" : "transparent"}`,
                  background: isSelected
                    ? "rgba(155,27,48,0.06)"
                    : near
                      ? "rgba(155,27,48,0.02)"
                      : "transparent",
                  borderBottom: "1px solid #f5f5f5",
                  transition: "background 0.15s",
                }}
              >
                {/* Time: departure → arrival */}
                <div style={{
                  minWidth: 100,
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-opensans), Open Sans, sans-serif",
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: isSelected || near ? "#9B1B30" : "#333",
                  }}>
                    {trip.time}
                  </span>
                  {trip.arrivalTime && (
                    <span style={{
                      fontSize: 11,
                      color: isSelected || near ? "rgba(155,27,48,0.6)" : "#999",
                      marginTop: 1,
                    }}>
                      → {trip.arrivalTime}
                    </span>
                  )}
                </div>

                {/* Driver / route info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, color: "#333", fontWeight: 500,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {trip.driver || (locale === "ru" ? trip.destination_ru : trip.destination_ro)}
                  </div>
                  {trip.driver && trip.vehicle_plate && (
                    <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                      {trip.vehicle_plate}
                    </div>
                  )}
                </div>

                {/* Call button (if phone available) */}
                {trip.phone && (
                  <a
                    href={`tel:${trip.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="call-btn"
                    style={{
                      flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
                      background: "#22c55e", display: "flex", alignItems: "center",
                      justifyContent: "center", textDecoration: "none",
                      boxShadow: "0 2px 6px rgba(34,197,94,0.25)",
                    }}
                    aria-label={`Sună ${trip.driver}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </a>
                )}

                {/* Price */}
                <span style={{
                  fontWeight: 700, color: "#9B1B30", fontSize: 14, whiteSpace: "nowrap",
                  fontFamily: "var(--font-opensans), Open Sans, sans-serif",
                  minWidth: 52, textAlign: "right",
                  display: "flex", flexDirection: "column", alignItems: "flex-end",
                }}>
                  {trip.originalPrice != null && trip.originalPrice > 0 && (
                    <span style={{
                      fontSize: 11, color: "#999", textDecoration: "line-through",
                      fontWeight: 500, lineHeight: 1,
                    }}>
                      {trip.originalPrice} LEI
                    </span>
                  )}
                  <span style={{ color: trip.originalPrice != null ? "#16a34a" : "#9B1B30" }}>
                    {trip.price > 0 ? `${trip.price} LEI` : '—'}
                  </span>
                </span>
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
