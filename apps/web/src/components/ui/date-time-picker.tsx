"use client";

import * as React from "react";
import { CalendarWithTimePresets } from "@/components/ui/calendar-with-time-presets";
import { type Locale } from "@/lib/i18n";

interface DateTimePickerProps {
  name?: string;
  locale?: Locale;
  onChange?: (date: Date | undefined, time: string | null) => void;
}

export function DateTimePicker({ name = "data", locale = "ro", onChange }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const loc = locale === "ru" ? "ru-RU" : "ro-RO";
  const displayValue = date
    ? `${date.toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" })}${selectedTime ? ` ${selectedTime}` : ""}`
    : "";

  const hiddenValue = date
    ? `${date.toISOString().split("T")[0]}${selectedTime ? `T${selectedTime}` : ""}`
    : "";

  return (
    <div ref={ref} style={{ position: "relative", flex: "1 1 0", width: 0 }}>
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
          fontSize: 13,
          background: "rgba(255,255,255,0.92)",
          outline: "none",
          fontStyle: "italic",
          color: displayValue ? "#6E0E14" : "rgba(110,14,20,0.5)",
          boxShadow: "none",
          cursor: "pointer",
          fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
        }}
      />

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 99,
              background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: "50%", top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 100,
              width: "min(92vw, 460px)",
            }}
          >
            <CalendarWithTimePresets
              date={date}
              onDateChange={setDate}
              selectedTime={selectedTime}
              onTimeChange={setSelectedTime}
              locale={locale}
              onConfirm={() => {
                setOpen(false);
                onChange?.(date, selectedTime);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
