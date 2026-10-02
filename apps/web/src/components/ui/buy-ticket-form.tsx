"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TripResult } from "@/app/(public)/actions";
import { cumparaBilet, type StareComanda } from "@/app/(public)/bilete-actions";

// Formularul «Cumpără bilet» (ION-197): în fereastra rezultatelor, sub cursa aleasă. Cheia de idempotență se
// generează la deschidere — un dublu-clic sau un «înapoi» din bancă nu face două comenzi. Prețul e informativ;
// suma o recalculează panoul.

const RED = "#9B1B30";

const TXT = {
  ro: {
    title: "Bilet online", name: "Nume și prenume", phone: "Telefon", seats: "Locuri", total: "Total",
    consent: "Sunt de acord cu prelucrarea datelor pentru bilet", policy: "politica de confidențialitate",
    pay: "Plătește cu cardul", paying: "Se deschide banca…", cancel: "Înapoi",
    note: "După plată primești biletul cu cod QR. Îl arăți șoferului la urcare. Returnarea se cere prin Telegram.",
  },
  ru: {
    title: "Онлайн-билет", name: "Имя и фамилия", phone: "Телефон", seats: "Мест", total: "Итого",
    consent: "Согласен на обработку данных для билета", policy: "политика конфиденциальности",
    pay: "Оплатить картой", paying: "Открываем банк…", cancel: "Назад",
    note: "После оплаты вы получите билет с QR-кодом. Покажите его водителю при посадке. Возврат — через Telegram.",
  },
} as const;

function uuid(): string {
  try { return crypto.randomUUID(); } catch {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

function Trimite({ locale }: { locale: "ro" | "ru" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{
      flex: 1, padding: "11px 14px", borderRadius: 12, border: "none", background: pending ? "#c9a0a8" : RED,
      color: "#fff", fontWeight: 700, fontSize: 14, cursor: pending ? "default" : "pointer",
    }}>{pending ? TXT[locale].paying : TXT[locale].pay}</button>
  );
}

export function BuyTicketForm({ trip, fromRo, toRo, locale, onCancel }: {
  trip: TripResult; fromRo: string; toRo: string; locale: "ro" | "ru"; onCancel: () => void;
}) {
  const tx = TXT[locale];
  const [key] = React.useState(uuid);
  const [seats, setSeats] = React.useState(1);
  const [stare, action] = useActionState<StareComanda, FormData>(cumparaBilet, {});
  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box",
  };

  return (
    <form action={action} style={{ display: "grid", gap: 10, padding: "12px 12px 14px", background: "#fbf6f7", borderRadius: 12, border: "1px solid rgba(155,27,48,0.15)" }}>
      <div style={{ fontWeight: 700, color: RED, fontSize: 14 }}>{tx.title} · {trip.time}</div>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="crmRouteId" value={trip.crm_route_id} />
      <input type="hidden" name="goingNorth" value={String(trip.going_north)} />
      <input type="hidden" name="tripDate" value={trip.trip_date} />
      <input type="hidden" name="fromRo" value={fromRo} />
      <input type="hidden" name="toRo" value={toRo} />
      {/* capcana pentru roboți: invizibilă pentru oameni */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      <label style={{ fontSize: 12, color: "#555" }}>{tx.name}
        <input name="passengerName" required minLength={2} maxLength={80} autoComplete="name" style={inp} />
      </label>
      <label style={{ fontSize: 12, color: "#555" }}>{tx.phone}
        <input name="phone" required inputMode="tel" autoComplete="tel" placeholder="+373 69 123 456" style={inp} />
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "#555" }}>{tx.seats}
          <select name="seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))} style={{ ...inp, width: 80 }}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 12, color: "#555" }}>
          {tx.total}<div style={{ fontSize: 20, fontWeight: 700, color: RED }}>{trip.price * seats} lei</div>
        </div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#555" }}>
        <input type="checkbox" name="consent" required style={{ marginTop: 2 }} />
        <span>{tx.consent} (<a href={`/${locale}/confidentialitate`} target="_blank" rel="noopener" style={{ color: RED }}>{tx.policy}</a>)</span>
      </label>
      <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>{tx.note}</div>
      {stare.eroare && <div role="alert" style={{ fontSize: 13, color: RED, fontWeight: 600 }}>{stare.eroare}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ padding: "11px 14px", borderRadius: 12, border: `1px solid ${RED}`, background: "#fff", color: RED, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{tx.cancel}</button>
        <Trimite locale={locale} />
      </div>
    </form>
  );
}
