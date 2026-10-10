"use client";

import * as React from "react";
import { citesteCumpararea, stergeCumpararea } from "@/lib/cumparare-salvata";

// Pe pagina biletului: plata n-a trecut (MIA/aplicația băncii, card refuzat) → «Reia plata» întoarce omul la plată cu tot
// ce alesese (Ion, 10.10.2026: «am pierdut toți pașii»); biletul plătit șterge alegerea ținută în filă.
export function ReiaPlata({ locale, platit }: { locale: "ro" | "ru"; platit: boolean }) {
  const [are, setAre] = React.useState(false);
  React.useEffect(() => {
    if (platit) { stergeCumpararea(); return; }
    setAre(citesteCumpararea() != null);
  }, [platit]);
  if (platit) return null;
  const ru = locale === "ru";
  return (
    <a href={are ? `/${locale}?reia=1` : `/${locale}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52, borderRadius: 14, background: "#9B1B30", color: "#fff", fontWeight: 800, fontSize: 16, textDecoration: "none", boxShadow: "0 10px 22px rgba(155,27,48,.22)" }}>
      {are ? (ru ? "Повторить оплату →" : "Reia plata →") : (ru ? "Купить заново →" : "Cumpără din nou →")}
    </a>
  );
}
