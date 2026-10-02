"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Partea vie a paginii biletului (ION-197): «Salvează» (tipărire / PDF din browser) și, cât comanda așteaptă plata,
// re-încărcarea la 15 s, cel mult 3 minute — apoi butonul «Verifică» (callback-ul băncii poate întârzia).

const RED = "#9B1B30";
const PAS_MS = 15_000;
const MAX_MS = 3 * 60_000;

export function SalveazaBilet({ text }: { text: string }) {
  return (
    <button type="button" className="bilet-no-print" onClick={() => window.print()} style={{
      padding: "11px 16px", borderRadius: 12, border: `1px solid ${RED}`, background: "#fff", color: RED, fontWeight: 700, fontSize: 14, cursor: "pointer",
    }}>{text}</button>
  );
}

export function AsteaptaPlata({ locale }: { locale: "ro" | "ru" }) {
  const router = useRouter();
  const [gata, setGata] = React.useState(false);
  React.useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      if (Date.now() - start > MAX_MS) { clearInterval(t); setGata(true); return; }
      router.refresh();
    }, PAS_MS);
    return () => clearInterval(t);
  }, [router]);
  if (!gata) {
    return <p style={{ fontSize: 13, color: "#777" }}>{locale === "ru" ? "Ждём подтверждения банка, страница обновляется сама…" : "Așteptăm confirmarea băncii, pagina se actualizează singură…"}</p>;
  }
  return (
    <button type="button" onClick={() => { setGata(false); router.refresh(); }} style={{
      padding: "11px 16px", borderRadius: 12, border: "none", background: RED, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
    }}>{locale === "ru" ? "Проверить оплату" : "Verifică plata"}</button>
  );
}
