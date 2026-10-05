"use client";

import * as React from "react";
import { RANDURI_AUTOBUZ, stareLoc, type CelulaHarta } from "@/lib/locuri";

// Harta locurilor autobuzului (ION-242), în formularul «Cumpără bilet» pe cursele din Chișinău spre nord. Aceeași
// schemă ca în mini app-ul șoferului (ION-240): șoferul și locul 1 în față, 5 rânduri × 3 cu culoar, 4 în spate.
// Ocupatele sunt gri și nu se pot atinge; alesele sunt bordo. Fiecare loc e un buton de ≥ 44 px.

const RED = "#9B1B30";
const LAT = 58;
const INALT = 52;
const CULOAR = 22;

const TXT = {
  ro: { sofer: "ȘOFER", liber: "liber", ocupat: "ocupat", ales: "ales", loc: (n: number) => `Locul ${n}` },
  ru: { sofer: "ВОДИТЕЛЬ", liber: "свободно", ocupat: "занято", ales: "выбрано", loc: (n: number) => `Место ${n}` },
} as const;

const STIL_LOC: Record<"liber" | "ocupat" | "ales", React.CSSProperties> = {
  liber: { background: "#fff", borderColor: "#c9c9c9", color: "#555", cursor: "pointer" },
  ocupat: { background: "#e9e5e5", borderColor: "#e9e5e5", color: "#aaa", cursor: "not-allowed" },
  ales: { background: RED, borderColor: RED, color: "#fff", cursor: "pointer" },
};

function Celula({ c, ocupate, alese, onToggle, locale, blocat }: {
  c: CelulaHarta; ocupate: readonly number[]; alese: readonly number[]; onToggle: (nr: number) => void; locale: "ro" | "ru"; blocat: boolean;
}) {
  const tx = TXT[locale];
  if (c === "culoar") return <div aria-hidden="true" style={{ width: CULOAR, flexShrink: 0 }} />;
  if (c === "gol") return <div aria-hidden="true" style={{ width: LAT, height: INALT, flexShrink: 0 }} />;
  const baza: React.CSSProperties = {
    width: LAT, height: INALT, borderRadius: "12px 12px 8px 8px", display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 18, lineHeight: 1, border: "3px solid #c9c9c9", boxSizing: "border-box", flexShrink: 0, fontFamily: "inherit",
  };
  if (c === "sofer") {
    return <div aria-label={tx.sofer} style={{ ...baza, background: "#e9e5e5", borderColor: "#e9e5e5", color: "#888", fontSize: 11 }}>{tx.sofer}</div>;
  }
  const s = stareLoc(c, ocupate, alese);
  return (
    <button
      type="button"
      onClick={() => onToggle(c)}
      disabled={s === "ocupat" || blocat}
      aria-pressed={s === "ales"}
      aria-label={`${tx.loc(c)}: ${tx[s]}`}
      style={{ ...baza, ...STIL_LOC[s], padding: 0, opacity: blocat && s !== "ales" ? 0.6 : 1 }}
    >{c}</button>
  );
}

export function SeatMap({ ocupate, alese, onToggle, locale, blocat = false }: {
  /** Locurile luate deja (de la panou, plus cele aflate la «loc_ocupat»). */
  ocupate: readonly number[];
  alese: readonly number[];
  onToggle: (nr: number) => void;
  locale: "ro" | "ru";
  /** Cât se trimite comanda: harta nu se mai atinge. */
  blocat?: boolean;
}) {
  const tx = TXT[locale];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0 }}>
      {RANDURI_AUTOBUZ.map((rand, i) => (
        <div key={i} style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: i === RANDURI_AUTOBUZ.length - 1 ? 4 : 0 }}>
          {rand.map((c, j) => <Celula key={j} c={c} ocupate={ocupate} alese={alese} onToggle={onToggle} locale={locale} blocat={blocat} />)}
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", fontSize: 13, color: "#555", marginTop: 4 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, border: "2px solid #c9c9c9", background: "#fff", boxSizing: "border-box" }} />{tx.liber}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: RED }} />{tx.ales}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: "#e9e5e5" }} />{tx.ocupat}</span>
      </div>
    </div>
  );
}
