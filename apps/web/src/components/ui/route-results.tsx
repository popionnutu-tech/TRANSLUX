"use client";

import * as React from "react";

interface Trip {
  time: string;
  driver: string;
  phone: string;
  price: string;
}

// Mock data — will be replaced with DB query
const MOCK_TRIPS: Trip[] = [
  { time: "06:00", driver: "Vasile Grosu", phone: "060 123 456", price: "40 LEI" },
  { time: "06:30", driver: "Ion Ceban", phone: "069 234 567", price: "40 LEI" },
  { time: "07:00", driver: "Andrei Moraru", phone: "068 345 678", price: "40 LEI" },
  { time: "07:30", driver: "Dumitru Russu", phone: "067 456 789", price: "40 LEI" },
  { time: "08:00", driver: "Nicolae Lungu", phone: "060 567 890", price: "40 LEI" },
  { time: "08:30", driver: "Sergiu Cojocaru", phone: "069 678 901", price: "40 LEI" },
  { time: "09:00", driver: "Pavel Ursu", phone: "068 789 012", price: "40 LEI" },
  { time: "09:30", driver: "Gheorghe Munteanu", phone: "060 890 123", price: "40 LEI" },
  { time: "10:00", driver: "Victor Rusu", phone: "069 901 234", price: "40 LEI" },
  { time: "10:30", driver: "Alexandru Popescu", phone: "067 012 345", price: "40 LEI" },
  { time: "11:00", driver: "Mihai Rotaru", phone: "060 111 222", price: "40 LEI" },
  { time: "11:30", driver: "Oleg Bivol", phone: "069 222 333", price: "40 LEI" },
  { time: "12:00", driver: "Vitalie Codreanu", phone: "068 333 444", price: "40 LEI" },
  { time: "13:00", driver: "Radu Botnaru", phone: "060 444 555", price: "40 LEI" },
  { time: "14:00", driver: "Constantin Platon", phone: "069 555 666", price: "40 LEI" },
  { time: "15:00", driver: "Eugen Guțu", phone: "067 666 777", price: "40 LEI" },
];

interface RouteResultsProps {
  from: string;
  to: string;
  selectedTime: string | null;
  locale?: "ro" | "ru";
  onClose: () => void;
}

export function RouteResults({ from, to, selectedTime, locale = "ro", onClose }: RouteResultsProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const selectedRef = React.useRef<HTMLDivElement>(null);

  // Find closest trip index to selected time
  const selectedIdx = React.useMemo(() => {
    if (!selectedTime) return -1;
    const idx = MOCK_TRIPS.findIndex((t) => t.time === selectedTime);
    if (idx >= 0) return idx;
    // find closest
    const sel = timeToMinutes(selectedTime);
    let best = 0;
    let bestDiff = Infinity;
    MOCK_TRIPS.forEach((t, i) => {
      const diff = Math.abs(timeToMinutes(t.time) - sel);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }, [selectedTime]);

  // Auto-scroll to show selected with 2 before visible
  React.useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const el = selectedRef.current;
      const wrap = scrollRef.current;
      const cardH = el.offsetHeight + 1;
      wrap.scrollTop = el.offsetTop - cardH * 2;
    }
  }, [selectedIdx]);

  const isNearby = (i: number) =>
    i >= selectedIdx - 2 && i <= selectedIdx + 2 && i !== selectedIdx;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <style>{`
        .route-results-scroll { max-height: 65vh; }
        @media (max-width: 768px) { .route-results-scroll { max-height: 75vh; } }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
        }}
      />
      <div style={{
        position: "relative", zIndex: 1,
        width: "min(92vw, 760px)",
      }}>
        {/* Header */}
        <div style={{
          background: "#fff",
          borderRadius: "12px 12px 0 0",
          padding: "14px 16px 10px",
          textAlign: "center",
          borderBottom: "1px solid #f0f0f0",
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "#9B1B30",
            letterSpacing: "0.03em",
          }}>
            {from.toUpperCase()} → {to.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
            {locale === "ru" ? "↕ прокрутите для других рейсов" : "↕ scroll pentru alte curse"}
          </div>
        </div>

        {/* Scrollable trips */}
        <div
          ref={scrollRef}
          className="route-results-scroll"
          style={{
            overflowY: "auto",
            background: "#fff",
            position: "relative",
          }}
        >
          {MOCK_TRIPS.map((trip, i) => {
            const isSelected = i === selectedIdx;
            const near = isNearby(i);
            return (
              <div
                key={trip.time}
                ref={isSelected ? selectedRef : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 14px",
                  borderLeft: `3px solid ${isSelected || near ? "#9B1B30" : "#e8e8e8"}`,
                  background: isSelected
                    ? "rgba(155,27,48,0.07)"
                    : near
                      ? "rgba(155,27,48,0.02)"
                      : "transparent",
                  borderBottom: "1px solid #f5f5f5",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                <span style={{
                  fontWeight: 700,
                  fontSize: 15,
                  minWidth: 44,
                  fontVariantNumeric: "tabular-nums",
                  color: isSelected || near ? "#9B1B30" : "#222",
                }}>
                  {trip.time}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: "#444", fontWeight: 500,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {trip.driver}
                  </div>
                  <div style={{ fontSize: 10, color: "#999" }}>
                    <a
                      href={`tel:+373${trip.phone.replace(/\s/g, "")}`}
                      style={{ color: "#9B1B30", textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {trip.phone}
                    </a>
                  </div>
                </div>
                <span style={{
                  fontWeight: 700, color: "#9B1B30", fontSize: 13, whiteSpace: "nowrap",
                }}>
                  {trip.price}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom rounded corner */}
        <div style={{
          background: "#fff",
          borderRadius: "0 0 12px 12px",
          height: 8,
        }} />
      </div>
    </div>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
