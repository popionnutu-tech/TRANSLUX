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
            const isSelected = i === selectedIdx;
            const near = isNearby(i);
            const displayPhone = trip.phone ? '0' + trip.phone.replace(/^\+?373/, '') : null;
            return (
              <div
                key={`${trip.time}-${i}`}
                ref={isSelected ? selectedRef : undefined}
                className="trip-card"
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: isSelected
                    ? "rgba(155,27,48,0.04)"
                    : "#fff",
                  border: isSelected
                    ? "1px solid rgba(155,27,48,0.15)"
                    : near
                      ? "1px solid rgba(155,27,48,0.08)"
                      : "1px solid #eee",
                  transition: "all 0.15s",
                }}
              >
                {/* Time */}
                <div style={{
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-opensans), Open Sans, sans-serif",
                  flexShrink: 0, textAlign: "center", minWidth: 55,
                }}>
                  <div style={{
                    fontWeight: 700, fontSize: 18, lineHeight: 1,
                    color: isSelected || near ? "#9B1B30" : "#333",
                  }}>
                    {trip.time}
                  </div>
                  {trip.arrivalTime && (
                    <div style={{
                      fontSize: 10, marginTop: 2,
                      color: isSelected || near ? "rgba(155,27,48,0.5)" : "#999",
                    }}>
                      &rarr; {trip.arrivalTime}
                    </div>
                  )}
                </div>

                {/* Driver + plate */}
                <div style={{
                  flex: 1, minWidth: 0,
                }}>
                  {trip.driver ? (
                    <>
                      <div style={{
                        fontSize: 13, fontWeight: 500, color: "#333",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {trip.driver}
                      </div>
                      {trip.vehicle_plate && (
                        <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                          {trip.vehicle_plate}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "#ccc" }}>&mdash;</div>
                  )}
                </div>

                {/* Price badge */}
                {trip.price > 0 && (() => {
                  const hasOffer = trip.originalPrice != null && trip.originalPrice > 0;
                  return (
                    <div style={{
                      flexShrink: 0,
                      background: hasOffer ? "#16a34a" : "#9B1B30",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontFamily: "var(--font-opensans), Open Sans, sans-serif",
                      whiteSpace: "nowrap",
                    }}>
                      {hasOffer && (
                        <span style={{
                          fontSize: 10,
                          textDecoration: "line-through",
                          opacity: 0.7,
                          marginRight: 4,
                        }}>
                          {trip.originalPrice}
                        </span>
                      )}
                      {trip.price} lei
                    </div>
                  );
                })()}

                {/* Phone */}
                {displayPhone && (
                  <a
                    href={`tel:${trip.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="call-btn"
                    style={{
                      flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                      textDecoration: "none",
                    }}
                    aria-label={`Sună ${trip.driver}`}
                  >
                    <span style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "#22c55e", display: "flex", alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(34,197,94,0.25)",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: "#333",
                      whiteSpace: "nowrap",
                    }}>
                      {displayPhone}
                    </span>
                  </a>
                )}
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
