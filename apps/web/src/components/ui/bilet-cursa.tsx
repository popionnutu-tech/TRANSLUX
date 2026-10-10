"use client";

import * as React from "react";
import type { TripResult } from "@/app/(public)/actions";
import { phoneTel, phoneText } from "@/lib/phone";
import { durataDrum, placaAfisata } from "@/lib/bilet-afisare";

// Cursa ca bilet cu cotor (Ion, 09.10.2026: «hai varianta asta să o lucrăm mai bine, să semene ca un bilet și să fie
// număr șofer și auto»; «numere înmatriculare» ca plăcuța MD; «câte locuri sunt nu trebuie»; «bilet TRANSLUX să nu fie»).
// Partea din stânga: ora → sosirea · durata, plăcuța, prenumele și telefonul șoferului. Cotorul: prețul și acțiunea.

const RED = "#9B1B30";
export const FOND_LISTA = "#FAF6F5";

const TXT = {
  ro: { cumpara: "Cumpără", laSofer: "La șofer", peLoc: "lei / loc", asteapta: "Mașina și șoferul — mai aproape de plecare", suna: "Sună șoferul" },
  ru: { cumpara: "Купить", laSofer: "У водителя", peLoc: "лей / место", asteapta: "Машина и водитель — ближе к отправлению", suna: "Позвонить водителю" },
} as const;

/** Plăcuța de înmatriculare moldovenească: banda albastră cu steagul și «MD», literele întâi. */
export function PlacaMD({ numar, mic = false }: { numar: string; mic?: boolean }) {
  const h = mic ? 24 : 28;
  return (
    <span aria-label={`Numărul mașinii ${numar}`} style={{ display: "inline-flex", alignItems: "stretch", height: h, background: "#fff", border: "2px solid #111", borderRadius: 6, overflow: "hidden", flexShrink: 0, boxSizing: "border-box" }}>
      <span aria-hidden="true" style={{ width: mic ? 17 : 20, background: "#1747A6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <svg width={mic ? 11 : 13} height={mic ? 7 : 9} viewBox="0 0 18 12"><rect width="6" height="12" fill="#0046AE" /><rect x="6" width="6" height="12" fill="#FFD200" /><rect x="12" width="6" height="12" fill="#CC092F" /><circle cx="9" cy="6" r="2" fill="#8A5A1F" /></svg>
        <span style={{ color: "#fff", fontSize: mic ? 7 : 9, fontWeight: 700, lineHeight: 1 }}>MD</span>
      </span>
      <span style={{ fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', fontStretch: "condensed", fontSize: mic ? 16 : 19, fontWeight: 700, padding: "0 7px", display: "flex", alignItems: "center", letterSpacing: "0.02em", lineHeight: 1, color: "#111", whiteSpace: "nowrap" }}>{numar}</span>
    </span>
  );
}

function IconTelefon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B7F3B" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/**
 * Biletul unei curse. `cotor`: «lista» = prețul + «Cumpără»/«La șofer» (buton când se vinde online), «ales» = prețul pe
 * loc (în pagina de cumpărare). `fond` = culoarea de sub bilet, pentru crestăturile liniei de rupere.
 */
export function BiletCursa({ trip, locale, cotor, evidentiat = false, fond = FOND_LISTA, onCumpara, onSuna }: {
  trip: TripResult;
  locale: "ro" | "ru";
  cotor: "lista" | "ales";
  evidentiat?: boolean;
  fond?: string;
  onCumpara?: () => void;
  onSuna?: () => void;
}) {
  const tx = TXT[locale];
  const placa = placaAfisata(trip.vehicle_plate);
  const durata = durataDrum(trip.time, trip.arrivalTime);
  const vinde = cotor === "lista" && trip.sale_open && Boolean(onCumpara);
  const areOferta = trip.originalPrice != null && trip.originalPrice > 0;
  const cotorFond = cotor === "ales" || vinde ? RED : "#F1EAEB";
  const cotorText = cotor === "ales" || vinde ? "#fff" : "#6B5B5F";
  const LAT_COTOR = cotor === "ales" ? 96 : 116;

  const continut = (
    <>
      <span style={{ fontSize: cotor === "ales" ? 20 : 21, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap" }}>
        {/* Pe cotorul îngust al cursei alese (96 px) prețul tăiat stă deasupra — lângă «150 lei» nu încape. */}
        {areOferta && <span style={{ fontSize: 12, fontWeight: 600, textDecoration: "line-through", opacity: 0.75, marginRight: 4, display: cotor === "ales" ? "block" : undefined }}>{trip.originalPrice}</span>}
        {trip.price > 0 ? `${trip.price} lei` : "—"}
      </span>
      {cotor === "ales"
        ? <span style={{ fontSize: 12, fontWeight: 700 }}>{tx.peLoc}</span>
        : <span style={{ fontSize: 13, fontWeight: 800, padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${vinde ? "rgba(255,255,255,0.7)" : "#D6C8CB"}` }}>{vinde ? tx.cumpara : tx.laSofer}</span>}
    </>
  );
  const stilCotor: React.CSSProperties = {
    width: LAT_COTOR, flexShrink: 0, borderRadius: "0 14px 14px 0", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 6, padding: "10px 6px", background: cotorFond, color: cotorText, border: "none", fontFamily: "inherit",
  };

  return (
    <div style={{
      position: "relative", display: "flex", background: "#fff", borderRadius: 14, minWidth: 0,
      boxShadow: evidentiat ? `0 0 0 2px ${RED}, 0 6px 16px rgba(60,20,30,0.08)` : "0 1px 0 #EADDE0, 0 6px 16px rgba(60,20,30,0.06)",
    }}>
      <div style={{ flex: 1, minWidth: 0, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: evidentiat ? RED : "#231A1C" }}>{trip.time}</span>
          {trip.arrivalTime && <span style={{ fontSize: 15, color: "#6B5B5F", fontVariantNumeric: "tabular-nums" }}>&rarr; {trip.arrivalTime}</span>}
          {durata && <span style={{ marginLeft: "auto", fontSize: 12, color: "#8A7A7D", whiteSpace: "nowrap" }}>{durata}</span>}
        </div>
        {trip.isAwaitingDriver ? (
          <div style={{ fontSize: 13, color: "#8A7A7D", lineHeight: 1.3 }}>{tx.asteapta}</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            {placa && <PlacaMD numar={placa} mic />}
            {trip.driver && <span style={{ fontSize: 14, fontWeight: 600 }}>{trip.driver}</span>}
            {trip.phone && (
              <a href={phoneTel(trip.phone)} onClick={(e) => { e.stopPropagation(); onSuna?.(); }} aria-label={`${tx.suna} ${trip.driver ?? ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 32, fontSize: 14, fontWeight: 700, color: "#1B7F3B", textDecoration: "none", whiteSpace: "nowrap" }}>
                <IconTelefon />{phoneText(trip.phone)}
              </a>
            )}
          </div>
        )}
      </div>
      <div aria-hidden="true" style={{ width: 0, borderLeft: "2px dashed #E3D3D6", margin: "12px 0" }} />
      <div aria-hidden="true" style={{ position: "absolute", right: LAT_COTOR - 8, top: -8, width: 16, height: 16, borderRadius: "50%", background: fond }} />
      <div aria-hidden="true" style={{ position: "absolute", right: LAT_COTOR - 8, bottom: -8, width: 16, height: 16, borderRadius: "50%", background: fond }} />
      {vinde
        ? <button type="button" onClick={onCumpara} aria-label={`${tx.cumpara} ${trip.time}`} style={{ ...stilCotor, cursor: "pointer" }}>{continut}</button>
        : <div style={stilCotor}>{continut}</div>}
    </div>
  );
}
