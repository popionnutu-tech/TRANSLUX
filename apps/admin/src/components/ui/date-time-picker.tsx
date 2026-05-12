"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarWithTimePresets } from "@/components/ui/calendar-with-time-presets";
import { type Locale } from "@/lib/i18n";

interface DateTimePickerProps {
  name?: string;
  locale?: Locale;
  onChange?: (date: Date | undefined, time: string | null) => void;
  availableTimes?: string[];
}

export function DateTimePicker({ name = "data", locale = "ro", onChange, availableTimes }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const loc = locale === "ru" ? "ru-RU" : "ro-RO";
  const displayValue = date
    ? `${date.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" })}${selectedTime ? ` ${selectedTime}` : ""}`
    : "";

  const hiddenValue = date
    ? `${date.toISOString().split("T")[0]}${selectedTime ? `T${selectedTime}` : ""}`
    : "";

  return (
    <div style={{ position: "relative", flex: "1 1 0", width: 0 }}>
      <input type="hidden" name={name} value={hiddenValue} />

      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none', zIndex: 1 }}>📅</span>
      <input
        type="text"
        readOnly
        placeholder={locale === "ru" ? "Дата:" : "Data:"}
        value={displayValue}
        onClick={() => setOpen(!open)}
        className="hero-input"
        style={{
          width: '100%', height: 44,
          border: 'none', borderRadius: 10,
          padding: "0 16px 0 32px",
          fontSize: 16,
          background: "rgba(255,255,255,0.92)",
          outline: "none",
          fontStyle: "italic",
          color: displayValue ? "#6E0E14" : "rgba(110,14,20,0.5)",
          boxShadow: "none",
          cursor: "pointer",
          fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
        }}
      />

      {mounted && open && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setOpen(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }} />
          <div
            style={{ position: "relative", zIndex: 1, width: "min(92vw, 460px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarWithTimePresets
              date={date}
              onDateChange={setDate}
              selectedTime={selectedTime}
              onTimeChange={setSelectedTime}
              locale={locale}
              availableTimes={availableTimes}
              onConfirm={() => {
                setOpen(false);
                onChange?.(date, selectedTime);
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
