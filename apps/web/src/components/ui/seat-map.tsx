"use client";

import * as React from "react";
import { RANDURI_AUTOBUZ, stareLoc, type CelulaHarta } from "@/lib/locuri";

// Harta locurilor (ION-242) desenată ca microbuz văzut de sus (Ion, 09.10.2026: «aici fă o infografică frumoasă de
// microbuz»; «scaunul 1 este înainte de ușă»): botul cu parbrizul, oglinzile și roțile; volanul în stânga, locul 1 în
// dreapta, apoi ușa pe dreapta; 5 rânduri × 3 cu culoar, 4 în spate. Aceeași schemă ca în mini app-ul șoferului.
// Ocupatele sunt gri și nu se pot atinge; alesele sunt bordo, cu bifă. Fiecare loc e un buton de ≥ 44 px.

const RED = "#9B1B30";
const LAT = 50;
const INALT = 50;
const CULOAR = 20;

const TXT = {
  ro: { sofer: "ȘOFER", fata: "ÎN FAȚĂ", usa: "UȘA", liber: "liber", ocupat: "ocupat", ales: "locul tău", loc: (n: number) => `Locul ${n}` },
  ru: { sofer: "ВОДИТЕЛЬ", fata: "ВПЕРЕДИ", usa: "ДВЕРЬ", liber: "свободно", ocupat: "занято", ales: "ваше место", loc: (n: number) => `Место ${n}` },
} as const;

const STIL: Record<"liber" | "ocupat" | "ales", { fond: string; spatar: string; text: string; margine: string }> = {
  liber: { fond: "#fff", spatar: "#EFE6E8", text: "#231A1C", margine: "#D2C3C7" },
  ocupat: { fond: "#ECE5E7", spatar: "#DCD2D5", text: "#B3A6A9", margine: "#E4DCDE" },
  ales: { fond: RED, spatar: "#6E1222", text: "#fff", margine: RED },
};

function Volan({ eticheta, lat }: { eticheta: string; lat: number }) {
  return (
    <div aria-label={eticheta} style={{ width: lat, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="#8A7A7D" strokeWidth="4" /><circle cx="20" cy="20" r="4" fill="#8A7A7D" /><path d="M4 20h12M24 20h12M20 24v12" stroke="#8A7A7D" strokeWidth="3" /></svg>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#8A7A7D" }}>{eticheta}</span>
    </div>
  );
}

function Celula({ c, ocupate, alese, onToggle, locale, blocat, lat, inalt }: {
  c: CelulaHarta; ocupate: readonly number[]; alese: readonly number[]; onToggle: (nr: number) => void; locale: "ro" | "ru"; blocat: boolean; lat: number; inalt: number;
}) {
  const tx = TXT[locale];
  if (c === "culoar") return <div aria-hidden="true" style={{ width: CULOAR, flexShrink: 0 }} />;
  if (c === "gol") return <div aria-hidden="true" style={{ width: lat, height: inalt, flexShrink: 0 }} />;
  if (c === "sofer") return <Volan eticheta={tx.sofer} lat={lat} />;
  const s = stareLoc(c, ocupate, alese);
  const st = STIL[s];
  return (
    <button
      type="button"
      onClick={() => onToggle(c)}
      disabled={s === "ocupat" || blocat}
      aria-pressed={s === "ales"}
      aria-label={`${tx.loc(c)}: ${tx[s]}`}
      style={{
        width: lat, height: inalt, padding: 0, borderRadius: "11px 11px 7px 7px", border: `1.5px solid ${st.margine}`, background: st.fond,
        color: st.text, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0, fontFamily: "inherit", boxSizing: "border-box",
        cursor: s === "ocupat" ? "not-allowed" : "pointer", opacity: blocat && s !== "ales" ? 0.6 : 1,
      }}
    >
      <span aria-hidden="true" style={{ height: inalt < INALT ? 7 : 11, width: "100%", background: st.spatar }} />
      <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>{s === "ales" ? `✓ ${c}` : c}</span>
    </button>
  );
}

function Mostra({ s, text }: { s: keyof typeof STIL; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: "4px 4px 3px 3px", border: `1.5px solid ${STIL[s].margine}`, background: STIL[s].fond, boxSizing: "border-box" }} />{text}
    </span>
  );
}

export function SeatMap({ ocupate, alese, onToggle, locale, blocat = false, mic = false }: {
  /** Locurile luate deja (de la panou, plus cele aflate la «loc_ocupat»). */
  ocupate: readonly number[];
  alese: readonly number[];
  onToggle: (nr: number) => void;
  locale: "ro" | "ru";
  /** Cât se trimite comanda: harta nu se mai atinge. */
  blocat?: boolean;
  /** Varianta compactă (tur-retur, Ion 10.10: «tot pe o pagină»): harta încape pe ecranul telefonului cu butonul. */
  mic?: boolean;
}) {
  const tx = TXT[locale];
  const lat = mic ? 42 : LAT, inalt = mic ? 35 : INALT, pas = mic ? 5 : 8, k = mic ? 0.78 : 1;
  const roata = (pe: "left" | "right", sus: number | null, jos: number | null): React.CSSProperties => ({
    position: "absolute", [pe]: -7, ...(sus != null ? { top: sus } : {}), ...(jos != null ? { bottom: jos } : {}),
    width: 9, height: 44 * k, borderRadius: 4, background: "#2B2325",
  });
  const ultim = RANDURI_AUTOBUZ.length - 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{ position: "relative", padding: "0 10px" }}>
        <div aria-hidden="true" style={{ position: "absolute", left: -2, top: 56 * k, width: 12, height: 22, borderRadius: "8px 3px 3px 8px", background: "#3A3133" }} />
        <div aria-hidden="true" style={{ position: "absolute", right: -2, top: 56 * k, width: 12, height: 22, borderRadius: "3px 8px 8px 3px", background: "#3A3133" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={roata("left", 108 * k, null)} /><div style={roata("right", 108 * k, null)} />
          <div style={roata("left", null, 54 * k)} /><div style={roata("right", null, 54 * k)} />
        </div>
        <div style={{ position: "relative", borderRadius: "70px 70px 22px 22px", background: "#fff", border: "3px solid #D8CBCE", boxShadow: "0 10px 24px rgba(60,20,30,0.10)", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ height: mic ? 30 : 50, margin: mic ? "8px 16px 0" : "10px 16px 0", borderRadius: "56px 56px 10px 10px", background: "#DCE8F2", border: "2px solid #C3D3E1", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5, boxSizing: "border-box" }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: "#7D93A7" }}>{tx.fata}</span>
          </div>
          <div style={{ padding: mic ? "8px 10px 10px" : "12px 12px 14px", display: "flex", flexDirection: "column", gap: pas }}>
            {RANDURI_AUTOBUZ.map((rand, i) => (
              <React.Fragment key={i}>
                <div style={{ display: "flex", gap: mic ? 5 : 6, justifyContent: "center", alignItems: "center", marginTop: i === ultim ? 4 : 0 }}>
                  {rand.map((c, j) => (
                    <Celula key={j} c={c} ocupate={ocupate} alese={alese} onToggle={onToggle} locale={locale} blocat={blocat}
                      lat={i === ultim ? (mic ? 38 : 44) : lat} inalt={inalt} />
                  ))}
                </div>
                {/* Ușa: pe dreapta, imediat după rândul șoferului și al locului 1. */}
                {i === 0 && (
                  <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 6, marginRight: -12 }}>
                    <div style={{ flex: 1, height: 1, background: "#F0E6E8" }} />
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#1B7F3B" }}>{tx.usa}</span>
                    <div style={{ width: 6, height: mic ? 22 : 34, background: "#1B7F3B", borderRadius: "3px 0 0 3px" }} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div aria-hidden="true" style={{ height: 9, margin: "0 24px 10px", borderRadius: 6, background: "#E9E1E3" }} />
        </div>
      </div>
      {!mic && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", fontSize: 13, color: "#6B5B5F" }}>
          <Mostra s="liber" text={tx.liber} /><Mostra s="ales" text={tx.ales} /><Mostra s="ocupat" text={tx.ocupat} />
        </div>
      )}
    </div>
  );
}
