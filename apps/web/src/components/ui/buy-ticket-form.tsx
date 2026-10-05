"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TripResult } from "@/app/(public)/actions";
import { cumparaBilet, type StareComanda } from "@/app/(public)/bilete-actions";
import { linkHarta } from "@/lib/bilete-reguli";

// Formularul «Cumpără bilet» (ION-197): în fereastra rezultatelor, sub cursa aleasă. Cheia de idempotență se
// generează la deschidere — un dublu-clic sau un «înapoi» din bancă nu face două comenzi. Prețul e informativ;
// suma o recalculează panoul.

const RED = "#9B1B30";

const TXT = {
  ro: {
    title: "Bilet online", lastName: "Nume", firstName: "Prenume", phone: "Telefon", email: "E-mail (opțional)", seats: "Locuri", total: "Total",
    consent: "Am citit și accept", terms: "condițiile de vânzare", and: "și", policy: "politica de confidențialitate",
    pay: (lei: number) => `Plătește ${lei} lei cu cardul`, paying: "Se deschide pagina băncii…", cancel: "Renunță",
    note: "După plată primești biletul cu cod QR. Îl arăți șoferului la urcare.",
    retur: "Returnarea se cere doar prin Telegram: peste 24 h primești tot, sub 4 h nu se returnează.", grila: "Condițiile",
    unde: "Unde urci în autobuz", urcare: "Urci la", harta: "Harta", loc: (n: number) => (n === 1 ? "1 loc" : `${n} locuri`),
  },
  ru: {
    title: "Онлайн-билет", lastName: "Фамилия", firstName: "Имя", phone: "Телефон", email: "E-mail (необязательно)", seats: "Мест", total: "Итого",
    consent: "Я прочитал(а) и принимаю", terms: "условия продажи", and: "и", policy: "политику конфиденциальности",
    pay: (lei: number) => `Оплатить ${lei} лей картой`, paying: "Открываем страницу банка…", cancel: "Отмена",
    note: "После оплаты вы получите билет с QR-кодом. Покажите его водителю при посадке.",
    retur: "Возврат — только через Telegram: более чем за 24 ч — полностью, менее чем за 4 ч — не возвращается.", grila: "Условия",
    unde: "Где вы сядете в автобус", urcare: "Посадка", harta: "Карта", loc: (n: number) => (n === 1 ? "1 место" : `${n} места`),
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

function Trimite({ locale, lei }: { locale: "ro" | "ru"; lei: number }) {
  const { pending } = useFormStatus();
  // Blocat după prima apăsare: un dublu-tap nu face a doua comandă (cheia de idempotență o oprește oricum).
  return (
    <button type="submit" disabled={pending} style={{
      minHeight: 54, padding: "0 14px", borderRadius: 12, border: "none", background: pending ? "#c9a0a8" : RED,
      color: "#fff", fontWeight: 700, fontSize: 17, cursor: pending ? "default" : "pointer",
    }}>{pending ? TXT[locale].paying : TXT[locale].pay(lei)}</button>
  );
}

function ziuaSiOra(tripDate: string, time: string, locale: "ro" | "ru"): string {
  const t = new Date(`${tripDate}T12:00:00Z`);
  const zi = t.toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${zi}, ${time}`;
}

export function BuyTicketForm({ trip, fromRo, toRo, locale, onCancel }: {
  trip: TripResult; fromRo: string; toRo: string; locale: "ro" | "ru"; onCancel: () => void;
}) {
  const tx = TXT[locale];
  const [key] = React.useState(uuid);
  const [seats, setSeats] = React.useState(1);
  const [punct, setPunct] = React.useState<number | null>(null);
  const ales = trip.puncte?.find((p) => p.id === punct) ?? null;
  const [stare, action] = useActionState<StareComanda, FormData>(cumparaBilet, {});
  const inp: React.CSSProperties = {
    width: "100%", height: 48, padding: "0 12px", borderRadius: 10, border: "1px solid #bbb", fontSize: 16, boxSizing: "border-box",
    marginTop: 4, fontFamily: "inherit", background: "#fff",
  };
  const lbl: React.CSSProperties = { fontSize: 14, color: "#444", fontWeight: 600, minWidth: 0 };

  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="crmRouteId" value={trip.crm_route_id} />
      <input type="hidden" name="goingNorth" value={String(trip.going_north)} />
      <input type="hidden" name="tripDate" value={trip.trip_date} />
      <input type="hidden" name="fromRo" value={fromRo} />
      <input type="hidden" name="toRo" value={toRo} />
      {/* Punctul de urcare (ION-198): 2–3 puncte → alegere obligatorie; unul sau niciunul → nimic. */}
      {(trip.puncte?.length ?? 0) >= 2 && (
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 6, minWidth: 0 }}>
          <input type="hidden" name="punctObligatoriu" value="1" />
          <legend style={{ fontSize: 16, fontWeight: 700, color: "#222", padding: 0, marginBottom: 8 }}>{tx.unde}</legend>
          {trip.puncte.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 8, minWidth: 0 }}>
              {/* Harta e buton separat, ca alegerea locului să nu deschidă Google Maps din greșeală. */}
              <label style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minHeight: 52, padding: "0 12px", borderRadius: 12, border: punct === p.id ? `2px solid ${RED}` : "1px solid #ccc", background: "#fff", fontSize: 16, fontWeight: 600, color: "#222", minWidth: 0, cursor: "pointer" }}>
                <input type="radio" name="punctUrcareId" value={p.id} required checked={punct === p.id} onChange={() => setPunct(p.id)} style={{ accentColor: RED, width: 22, height: 22, margin: 0, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>{locale === "ru" ? p.nume_ru : p.nume_ro}</span>
              </label>
              <a href={linkHarta(p)} target="_blank" rel="noopener noreferrer" aria-label={`${tx.harta}: ${locale === "ru" ? p.nume_ru : p.nume_ro}`} style={{ width: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #ddd", background: "#fff", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              </a>
            </div>
          ))}
        </fieldset>
      )}
      {/* Un singur loc de urcare sau niciunul: nu se afișează nimic (Ion, 05.10). */}
      {/* capcana pentru roboți: invizibilă pentru oameni */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
      {/* Numele și prenumele în două câmpuri (Ion, 03.10); pe telefonul îngust se așază unul sub altul. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        <label style={lbl}>{tx.lastName}
          <input id="bilet-nume" name="lastName" required minLength={2} maxLength={40} autoComplete="family-name" style={inp} />
        </label>
        <label style={lbl}>{tx.firstName}
          <input id="bilet-prenume" name="firstName" required minLength={2} maxLength={40} autoComplete="given-name" style={inp} />
        </label>
      </div>
      <label style={lbl}>{tx.phone}
        <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="+373 69 123 456" style={inp} />
      </label>
      <label style={lbl}>{tx.email}
        <input id="bilet-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={120} placeholder="nume@exemplu.md" style={inp} />
      </label>
      <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 10 }}>{tx.seats}
        <select name="seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))} style={{ ...inp, width: 90, marginTop: 0 }}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {/* Rezumatul dinaintea plății (ION-238): ziua, ora, unde urci, locurile, suma. */}
      <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f7f1f2", fontSize: 15, color: "#222", lineHeight: 1.45 }}>
        <b>{ziuaSiOra(trip.trip_date, trip.time, locale)}</b>
        {ales && <><br />{tx.urcare}: {locale === "ru" ? ales.nume_ru : ales.nume_ro}</>}
        <br />{tx.loc(seats)} · <b>{trip.price * seats} lei</b>
      </div>
      <div style={{ padding: "10px 12px", borderRadius: 12, background: "#eef6fb", border: "1px solid #b9d7ea", fontSize: 14, color: "#1f3a4d", lineHeight: 1.45 }}>
        {tx.retur}{" "}<a href={`/${locale}/conditii-vanzare`} target="_blank" rel="noopener" style={{ color: "#1b6f9a", fontWeight: 600 }}>{tx.grila}</a>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, color: "#333", minHeight: 44 }}>
        <input type="checkbox" name="consent" required style={{ accentColor: RED, width: 22, height: 22, margin: "1px 0 0", flexShrink: 0 }} />
        {/* ION-208: acceptarea condițiilor de vânzare (HG 854/2006) și a politicii, la cumpărare. */}
        <span>{tx.consent}{" "}<a href={`/${locale}/conditii-vanzare`} target="_blank" rel="noopener" style={{ color: RED }}>{tx.terms}</a>{" "}{tx.and}{" "}<a href={`/${locale}/confidentialitate`} target="_blank" rel="noopener" style={{ color: RED }}>{tx.policy}</a></span>
      </label>
      {stare.eroare && <div role="alert" style={{ fontSize: 15, color: RED, fontWeight: 600 }}>{stare.eroare}</div>}
      <Trimite locale={locale} lei={trip.price * seats} />
      <button type="button" onClick={onCancel} style={{ justifySelf: "center", minHeight: 44, padding: "0 14px", border: "none", background: "none", color: "#666", fontSize: 15, cursor: "pointer" }}>{tx.cancel}</button>
      <div style={{ fontSize: 13, color: "#555", lineHeight: 1.4, textAlign: "center" }}>{tx.note}</div>
    </form>
  );
}
