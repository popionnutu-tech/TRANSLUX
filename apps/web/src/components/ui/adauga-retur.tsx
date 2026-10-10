"use client";

import * as React from "react";
import { aplicaReducere } from "@translux/db";
import { searchTrips, type TripResult } from "@/app/(public)/actions";

// «Adaugă retur −20%» sub cursa aleasă (547, Ion 10.10.2026: «tur-returul facem doar dacă cumpără în același moment»;
// «retura apare pe pagina căutării deodată, mai jos adaugă retur»). Omul alege ziua (≤ 30 de zile) și cursa de
// întoarcere; plătește turul, apoi pagina biletului îi deschide imediat plata returului. Cursa de pe aceeași rută ca turul
// nu se oferă (Ion: «niciodată pe aceeași cursă»).

const RED = "#9B1B30";
export const CHEIE_PLAN_RETUR = "tlx_plan_retur";

export interface ReturAles { trip: TripResult; pret: number }

const TXT = {
  ro: { adauga: "Adaugă retur −20%", nota: "Returul se plătește imediat după tur, cu −20%. Cursa de întoarcere poate fi în următoarele 30 de zile.", zi: "Ziua întoarcerii", cauta: "Se caută cursele…", niciuna: "În ziua aceasta nu sunt curse de întoarcere cu bilet online.", plata: (p: number, i: number) => `${p} lei în loc de ${i} lei pe loc` },
  ru: { adauga: "Добавить обратный −20%", nota: "Обратный билет оплачивается сразу после билета туда, со скидкой −20%. Обратный рейс — в течение 30 дней.", zi: "День возвращения", cauta: "Ищем рейсы…", niciuna: "В этот день нет обратных рейсов с онлайн-билетом.", plata: (p: number, i: number) => `${p} лей вместо ${i} лей за место` },
} as const;

function plusZile(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export function AdaugaRetur(p: { trip: TripResult; fromRo: string; toRo: string; locale: "ro" | "ru"; pct: number; zile: number; onChange: (r: ReturAles | null) => void }) {
  const tx = TXT[p.locale];
  const [activ, setActiv] = React.useState(false);
  const [zi, setZi] = React.useState(p.trip.trip_date);
  const [curse, setCurse] = React.useState<TripResult[] | null>(null);
  const [ales, setAles] = React.useState<string | null>(null);
  const { onChange } = p;

  React.useEffect(() => {
    if (!activ) { setCurse(null); return; }
    let viu = true;
    setCurse(null); setAles(null);
    // Sens invers: din destinația turului înapoi.
    searchTrips(p.toRo, p.fromRo, zi).then((r) => {
      if (!viu) return;
      setCurse((r || []).filter((t) => t.sale_open && t.crm_route_id !== p.trip.crm_route_id
        && (t.trip_date > p.trip.trip_date || (t.trip_date === p.trip.trip_date && t.time > p.trip.arrivalTime))));
    }).catch(() => viu && setCurse([]));
    return () => { viu = false; };
  }, [activ, zi, p.toRo, p.fromRo, p.trip.crm_route_id, p.trip.trip_date, p.trip.arrivalTime]);

  React.useEffect(() => {
    const t = activ && ales ? curse?.find((c) => `${c.crm_route_id}|${c.time}` === ales) ?? null : null;
    const pret = t ? aplicaReducere(t.price, p.pct) : null;
    onChange(t && pret != null ? { trip: t, pret } : null);
  }, [activ, ales, curse, p.pct, onChange]);

  return (
    <fieldset style={{ border: `1.5px solid ${activ ? RED : "#E2D6D9"}`, borderRadius: 12, padding: "10px 12px", margin: 0, display: "grid", gap: 8, minWidth: 0 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
        <input type="checkbox" checked={activ} onChange={(e) => setActiv(e.target.checked)} style={{ accentColor: RED, width: 22, height: 22, margin: 0 }} />
        {tx.adauga}
      </label>
      {activ && (
        <>
          <span style={{ fontSize: 13, color: "#4A3E41", lineHeight: 1.45 }}>{tx.nota}</span>
          <label style={{ fontSize: 13, fontWeight: 700, color: "#6B5B5F" }}>{tx.zi}
            <input type="date" value={zi} min={p.trip.trip_date} max={plusZile(p.trip.trip_date, p.zile)} onChange={(e) => e.target.value && setZi(e.target.value)}
              style={{ display: "block", width: "100%", height: 44, padding: "0 10px", borderRadius: 10, border: "1.5px solid #E2D6D9", fontSize: 16, boxSizing: "border-box", marginTop: 4, fontFamily: "inherit" }} />
          </label>
          {curse == null && <span style={{ fontSize: 14, color: "#666" }}>{tx.cauta}</span>}
          {curse != null && curse.length === 0 && <span style={{ fontSize: 14, color: "#666" }}>{tx.niciuna}</span>}
          {curse != null && curse.map((c) => {
            const k = `${c.crm_route_id}|${c.time}`;
            const pret = aplicaReducere(c.price, p.pct);
            return (
              <label key={k} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 48, padding: "0 12px", borderRadius: 12, border: ales === k ? `2px solid ${RED}` : "1.5px solid #E2D6D9", background: "#fff", cursor: "pointer" }}>
                <input type="radio" name="returAles" checked={ales === k} onChange={() => setAles(k)} style={{ accentColor: RED, width: 20, height: 20, margin: 0 }} />
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{c.time} → {c.arrivalTime}</span>
                <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>{pret != null && <><s style={{ color: "#8A7A7D" }}>{c.price}</s> <b>{pret} lei</b></>}</span>
              </label>
            );
          })}
          {ales && (() => { const c = curse?.find((x) => `${x.crm_route_id}|${x.time}` === ales); const pr = c ? aplicaReducere(c.price, p.pct) : null; return c && pr != null ? <span style={{ fontSize: 14, fontWeight: 700, color: "#2b6b3a" }}>{tx.plata(pr, c.price)}</span> : null; })()}
        </>
      )}
    </fieldset>
  );
}
