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
    // Zonele sigure (ION-249, captura lui Ion 05.10: pe ecran complet antetul intra sub ora iPhone-ului și sub butoanele
    // Close/⌄/⋯ ale Telegram): fără SDK nu pune nimeni --tg-safe-area-inset-* / --tg-content-safe-area-inset-*. Le cerem
    // (web_app_request_safe_area / content_safe_area) și le scriem pe <html> din răspunsuri. Răspunsurile vin prin
    // window.Telegram.WebView.receiveEvent (telefon) sau prin message cu {eventType, eventData} (Web/Desktop).
    const radacina = document.documentElement.style;
    let primit = false;
    const pune = (prefix: string, d: unknown) => {
      if (!d || typeof d !== "object") return;
      primit = true;
      for (const latura of ["top", "bottom", "left", "right"] as const) {
        const v = Number((d as Record<string, unknown>)[latura]);
        if (Number.isFinite(v) && v >= 0) radacina.setProperty(`${prefix}-${latura}`, `${Math.round(v)}px`);
      }
    };
    const laEveniment = (tip: string, date: unknown) => {
      if (tip === "safe_area_changed") pune("--tg-safe-area-inset", date);
      else if (tip === "content_safe_area_changed") pune("--tg-content-safe-area-inset", date);
      else if (tip === "fullscreen_changed") { trimite("web_app_request_safe_area"); trimite("web_app_request_content_safe_area"); }
    };
    const tg = window as unknown as { Telegram?: { WebView?: { receiveEvent?: (t: string, d: unknown) => void } } };
    tg.Telegram ??= {};
    tg.Telegram.WebView ??= {};
    const anterior = tg.Telegram.WebView.receiveEvent;
    tg.Telegram.WebView.receiveEvent = (t, d) => { laEveniment(t, d); anterior?.(t, d); };
    const laMesaj = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try { const m = JSON.parse(e.data) as { eventType?: string; eventData?: unknown }; if (m.eventType) laEveniment(m.eventType, m.eventData); } catch { /* alt mesaj */ }
    };
    window.addEventListener("message", laMesaj);

    trimite("web_app_ready");
    trimite("web_app_expand");
    const ecranComplet = Number.parseFloat(versiune) >= 8;
    if (ecranComplet) trimite("web_app_request_fullscreen");
    trimite("web_app_request_safe_area");
    trimite("web_app_request_content_safe_area");
    // Clientul vechi care nu răspunde: pe ecran complet lăsăm cel puțin locul barei de butoane a Telegram.
    const rezerva = window.setTimeout(() => {
      if (!primit && ecranComplet) radacina.setProperty("--tg-content-safe-area-inset-top", "56px");
    }, 400);
    return () => { window.clearTimeout(rezerva); window.removeEventListener("message", laMesaj); };
  }, []);
  return null;
}

/**
 * ION-249: în mini app-ul Telegram, linkul tel: nu pornește apelul; cerem Telegram să deschidă adresa în browserul
 * telefonului (web_app_open_link), care redirecționează spre tel:. În afara Telegram — linkul tel: obișnuit.
 * Întoarce true dacă a preluat apăsarea.
 */
export function suna(telefon373: string): boolean {
  if (typeof window === "undefined") return false;
  const inTelegram = !!sessionStorage.getItem("tgWebAppVersion") || new URLSearchParams(window.location.hash.slice(1)).has("tgWebAppVersion");
  if (!inTelegram) return false;
  const url = `${window.location.origin}/api/suna?t=${encodeURIComponent(telefon373.replace(/\D/g, ""))}`;
  const w = window as unknown as { TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void } };
  try {
    if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent("web_app_open_link", JSON.stringify({ url }));
    else window.parent.postMessage(JSON.stringify({ eventType: "web_app_open_link", eventData: { url } }), "https://web.telegram.org");
    return true;
  } catch {
    return false;
  }
}
