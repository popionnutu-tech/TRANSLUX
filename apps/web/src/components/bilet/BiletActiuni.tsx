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

/**
 * ION-248 (Ion, 05.10: «când apăs bilete se deschide pe jumătate, nu apare restul»): deschisă din butonul «🎫 Bilete»
 * al botului, pagina e un mini app Telegram — Telegram îl arată implicit pe jumătate de ecran. Îl întindem pe tot
 * ecranul. Fără telegram-web-app.js (CSP-ul site-ului permite doar scripturile proprii): evenimentele se trimit direct
 * pe canalul mini app-urilor (TelegramWebviewProxy pe telefon, postMessage în Telegram Web/Desktop).
 * În afara Telegram (fără tgWebAppVersion în adresă) nu face nimic.
 */
export function EcranCompletTelegram() {
  React.useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const versiune = hash.get("tgWebAppVersion") ?? sessionStorage.getItem("tgWebAppVersion");
    if (!versiune) return;
    try { sessionStorage.setItem("tgWebAppVersion", versiune); } catch { /* fără stocare: doar pentru reîncărcări */ }
    const w = window as unknown as { TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void } };
    const trimite = (tip: string, date: object = {}) => {
      try {
        if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent(tip, JSON.stringify(date));
        else window.parent.postMessage(JSON.stringify({ eventType: tip, eventData: date }), "https://web.telegram.org");
      } catch { /* clientul nu știe evenimentul: rămâne cum e */ }
    };
    trimite("web_app_ready");
    trimite("web_app_expand");
    if (Number.parseFloat(versiune) >= 8) trimite("web_app_request_fullscreen");
  }, []);
  return null;
}
