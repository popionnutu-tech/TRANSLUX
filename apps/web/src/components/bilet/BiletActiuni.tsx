"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/seo-paths";
import { cumparaRetur, type PlanRetur } from "@/app/(public)/bilete-actions";

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

/** Suntem în fereastra unei mini app Telegram (parametrii de pornire din hash sau păstrați de client). */
function inTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!sessionStorage.getItem("tgWebAppVersion") || new URLSearchParams(window.location.hash.slice(1)).has("tgWebAppVersion");
}

/**
 * ION-249/ION-279 (Ion, 06.10: «oriunde n-ar apăsa pe număr, clientul să treacă în browser și să înceapă sunetul»): în
 * fereastra Telegram linkul tel: nu pornește apelul (nici direct, nici prin web_app_open_link — încercat în ION-267 pe
 * iPhone), așa că cerem clientului Telegram să deschidă în browserul telefonului /api/suna, care trece pe loc la tel: și
 * pornește apelul. În afara Telegram — linkul tel: obișnuit (întoarce false). Întoarce true dacă a preluat apăsarea.
 */
export function suna(telefon373: string): boolean {
  if (!inTelegramWebApp()) return false;
  const cifre = telefon373.replace(/\D/g, "");
  const url = `${window.location.origin}/api/suna?t=${encodeURIComponent(cifre)}`;
  const w = window as unknown as { TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void } };
  try {
    if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent("web_app_open_link", JSON.stringify({ url }));
    else window.parent.postMessage(JSON.stringify({ eventType: "web_app_open_link", eventData: { url } }), "https://web.telegram.org");
    return true;
  } catch {
    return false;
  }
}

/**
 * «Cumpără returul cu −20%» (migr. 546): pe turul plătit al perechii Bălți ⇄ Chișinău. Codul de retur merge în
 * sessionStorage (nu în URL, ca să nu ajungă în referrer/jurnale) și omul ajunge la căutarea în sens invers.
 */
export function CumparaReturul({ codRetur, de, spre, locale }: { codRetur: string; de: string; spre: string; locale: "ro" | "ru" }) {
  const ru = locale === "ru";
  const mergi = () => {
    try { sessionStorage.setItem("tlx_cod_retur", codRetur); } catch { /* stocare blocată: codul se copiază de mână */ }
    window.location.href = `/${locale}?dela=${encodeURIComponent(slugify(spre))}&spre=${encodeURIComponent(slugify(de))}`;
  };
  return (
    <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 16, background: "#fdf3e7", border: "2px solid #d98a2b" }}>
      <b style={{ fontSize: 16 }}>{ru ? "Обратный билет со скидкой −20%" : "Returul cu −20%"}</b>
      <span style={{ fontSize: 13, color: "#4A3E41", lineHeight: 1.45 }}>
        {ru ? "В течение 30 дней, в обратную сторону, на другой рейс, на то же имя и телефон. Код обратного билета:" : "În 30 de zile, în sens invers, pe altă cursă, pe același nume și telefon. Codul de retur:"}
      </span>
      <code style={{ fontSize: 12, wordBreak: "break-all", background: "#fff", padding: "6px 8px", borderRadius: 8 }}>{codRetur}</code>
      <button type="button" onClick={mergi} style={{ minHeight: 48, borderRadius: 12, border: "none", background: "#9B1B30", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
        {ru ? "Купить обратный со скидкой" : "Cumpără returul cu −20%"}
      </button>
    </div>
  );
}

/**
 * Tur-returul «în același moment» (547): returul ales în formular (sessionStorage) se plătește imediat după tur, cu
 * −20%. Fără plan, cât turul e plătit de cel mult 30 de minute, rămâne butonul spre căutarea inversă; apoi nimic.
 */
export function ReturDupaTur({ codRetur, paidAt, rutaId, tripDate, de, spre, locale }: {
  codRetur: string; paidAt: string | null; rutaId: number | null; tripDate: string; de: string; spre: string; locale: "ro" | "ru";
}) {
  const ru = locale === "ru";
  const [plan, setPlan] = React.useState<{ plan: PlanRetur; pret: number; ora: string } | null>(null);
  const [inFereastra, setInFereastra] = React.useState(false);
  const [lucru, setLucru] = React.useState(false);
  const [eroare, setEroare] = React.useState<string | null>(null);
  React.useEffect(() => {
    setInFereastra(paidAt != null && Date.now() - Date.parse(paidAt) < 30 * 60_000);
    try {
      const raw = sessionStorage.getItem("tlx_plan_retur");
      const j = raw ? JSON.parse(raw) : null;
      if (j?.tur?.crmRouteId === rutaId && j?.tur?.tripDate === tripDate && j?.plan) setPlan({ plan: j.plan, pret: Number(j.pret), ora: String(j.ora ?? "") });
    } catch { /* stocare blocată */ }
  }, [paidAt, rutaId, tripDate]);
  if (!inFereastra) return null;
  if (!plan) return <CumparaReturul codRetur={codRetur} de={de} spre={spre} locale={locale} />;
  const plateste = async () => {
    setLucru(true); setEroare(null);
    const r = await cumparaRetur(plan.plan, codRetur).catch(() => ({ eroare: ru ? "Не получилось, попробуйте ещё раз." : "Nu a mers, încearcă din nou." } as { url?: string; eroare?: string }));
    if (r.url) {
      try { sessionStorage.removeItem("tlx_plan_retur"); } catch { /* */ }
      window.location.href = r.url;
      return;
    }
    setEroare(r.eroare ?? null); setLucru(false);
  };
  const data = plan.plan.tripDate.split("-").reverse().join(".");
  return (
    <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 16, background: "#fdf3e7", border: "2px solid #d98a2b" }}>
      <b style={{ fontSize: 16 }}>{ru ? "Шаг 2: оплатите обратный билет −20%" : "Pasul 2: plătește returul −20%"}</b>
      <span style={{ fontSize: 14, color: "#4A3E41" }}>{plan.plan.fromRo} → {plan.plan.toRo} · {data}, {plan.ora}</span>
      <button type="button" disabled={lucru} onClick={plateste} style={{ minHeight: 52, borderRadius: 12, border: "none", background: lucru ? "#c9a0a8" : "#9B1B30", color: "#fff", fontWeight: 700, fontSize: 17, cursor: lucru ? "default" : "pointer" }}>
        {lucru ? (ru ? "Открываем страницу банка…" : "Se deschide pagina băncii…") : (ru ? `Оплатить ${plan.pret} лей` : `Plătește ${plan.pret} lei`)}
      </button>
      {eroare && <span role="alert" style={{ fontSize: 14, color: "#9B1B30", fontWeight: 600 }}>{eroare}</span>}
    </div>
  );
}

/** Ce se desenează în poza unui loc (calculat pe server, pe pagina biletului). */
export interface PozaLoc {
  loc: string; eticheta: string; cod: string; qrSvg: string; ora: string; sosire: string | null; ruta: string; numeRuta: string | null;
  data: string; jos: string; operator: string; banda: string | null; bandaProba: boolean; urcat: boolean;
}

function incarcaImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, nu) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nu; i.src = src; });
}

function dreptunghi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.arcTo(x + w, y, x + w, y + h, r[1]);
  ctx.arcTo(x + w, y + h, x, y + h, r[2]);
  ctx.arcTo(x, y + h, x, y, r[3]);
  ctx.arcTo(x, y, x + w, y, r[0]);
  ctx.closePath();
}

/** Poza biletului (1080 px lățime), la fel ca cardul bordo: ora, ruta, locul, QR-ul, codul. */
async function deseneazaLoc(p: PozaLoc, font: string): Promise<Blob> {
  const W = 1080, B = p.banda ? 90 : 0, QR = 620;
  const sus = B + 70 + 60 + 60 + 150 + 70 + (p.numeRuta ? 50 : 0) + 50;
  const fereastra = 50 + 30 + 100 + 40 + QR + 70 + 60 + 50 + 60;
  const H = sus + fereastra + 70;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const f = (g: number, w = 700) => `${w} ${g}px ${font}`;
  ctx.fillStyle = RED; ctx.fillRect(0, 0, W, H);
  if (p.banda) {
    ctx.fillStyle = p.bandaProba ? "#fff" : "#FFD45C"; ctx.fillRect(0, 0, W, B);
    ctx.fillStyle = p.bandaProba ? "#b91c1c" : "#231A1C"; ctx.font = f(34, 800); ctx.textAlign = "center";
    ctx.fillText(p.banda, W / 2, B / 2 + 12, W - 80);
  }
  let y = B + 70;
  // Logoul alb: masca PNG roșie, colorată în alb pe o pânză separată.
  try {
    const logo = await incarcaImg("/translux-logo-red.png");
    const lw = Math.round(60 * 1318 / 192), lc = document.createElement("canvas");
    lc.width = lw; lc.height = 60;
    const l = lc.getContext("2d")!;
    l.drawImage(logo, 0, 0, lw, 60); l.globalCompositeOperation = "source-in"; l.fillStyle = "#fff"; l.fillRect(0, 0, lw, 60);
    ctx.drawImage(lc, 70, y);
  } catch { ctx.fillStyle = "#fff"; ctx.font = f(56, 800); ctx.textAlign = "left"; ctx.fillText("TRANSLUX", 70, y + 50); }
  ctx.font = f(34); const dw = ctx.measureText(p.data).width + 50;
  ctx.fillStyle = "rgba(255,255,255,0.16)"; dreptunghi(ctx, W - 70 - dw, y + 2, dw, 58, [29, 29, 29, 29]); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(p.data, W - 70 - dw / 2, y + 43);
  y += 60 + 60 + 130;
  ctx.textAlign = "left"; ctx.font = f(150, 800); ctx.fillText(p.ora, 66, y);
  if (p.sosire) { const ow = ctx.measureText(p.ora).width; ctx.font = f(50, 400); ctx.globalAlpha = 0.85; ctx.fillText(`→ ${p.sosire}`, 66 + ow + 30, y); ctx.globalAlpha = 1; }
  y += 20 + 70; ctx.font = f(56); ctx.fillText(p.ruta, 70, y, W - 140);
  if (p.numeRuta) { y += 50; ctx.font = f(34, 400); ctx.globalAlpha = 0.75; ctx.fillText(p.numeRuta, 70, y, W - 140); ctx.globalAlpha = 1; }
  y += 50;
  ctx.fillStyle = "#fff"; dreptunghi(ctx, 40, y, W - 80, fereastra, [56, 56, 0, 0]); ctx.fill();
  let wy = y + 50 + 30;
  ctx.fillStyle = "#8A7A7D"; ctx.font = f(30); ctx.textAlign = "left"; ctx.fillText(p.eticheta, 100, wy);
  wy += 100; ctx.fillStyle = RED; ctx.font = f(100, 800); ctx.fillText(p.loc, 100, wy);
  wy += 40;
  const qr = await incarcaImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.qrSvg)}`);
  ctx.globalAlpha = p.urcat ? 0.3 : 1; ctx.drawImage(qr, (W - QR) / 2, wy, QR, QR); ctx.globalAlpha = 1;
  wy += QR + 70; ctx.textAlign = "center"; ctx.fillStyle = "#4A3E41"; ctx.font = f(42); ctx.fillText(p.cod, W / 2, wy, W - 160);
  wy += 60; ctx.fillStyle = "#6B5B5F"; ctx.font = f(36, 400); ctx.fillText(p.jos, W / 2, wy, W - 160);
  wy += 50; ctx.fillStyle = "#A0939A"; ctx.font = f(26, 400); ctx.fillText(p.operator, W / 2, wy, W - 160);
  return new Promise((ok, nu) => cv.toBlob((b) => (b ? ok(b) : nu(new Error("toBlob"))), "image/png"));
}

/** «Salvează biletul în galerie» (Ion, 10.10.2026: «salvează/tipărește să fie salvare poză în galerie de fapt»): pe telefon
 *  se deschide foaia de partajare cu «Salvează imaginea»; unde nu se poate, poza se descarcă. */
export function SalveazaPoza({ locuri, locale, stil }: { locuri: PozaLoc[]; locale: "ro" | "ru"; stil?: React.CSSProperties }) {
  const ru = locale === "ru";
  const [lucru, setLucru] = React.useState(false);
  // Pozele se fac dinainte: Safari deschide foaia de partajare doar imediat după apăsare, nu după o așteptare.
  const gata = React.useRef<Promise<File[]> | null>(null);
  const fa = React.useCallback(() => {
    if (!gata.current) {
      gata.current = (async () => {
        await document.fonts?.ready;
        const font = getComputedStyle(document.body).fontFamily || "sans-serif";
        return Promise.all(locuri.map(async (p) => new File([await deseneazaLoc(p, font)], `bilet-translux-loc-${p.loc}.png`, { type: "image/png" })));
      })();
      gata.current.catch(() => { gata.current = null; });
    }
    return gata.current;
  }, [locuri]);
  React.useEffect(() => { const t = setTimeout(() => { void fa().catch(() => undefined); }, 800); return () => clearTimeout(t); }, [fa]);
  // Pe telefon poza se arată pe ecran și se salvează ținând degetul pe ea (Ion, 10.10.2026: «în galerie nu se salvează
  // automat, dă un fișier care trebuie ceva de făcut»): foaia de partajare lipsește în Chrome pe iPhone, iar descărcarea
  // ajunge în «Fișiere», nu în «Poze». Apăsarea lungă pe imagine merge în orice browser. Pe calculator — descărcare.
  const [arata, setArata] = React.useState<string[] | null>(null);
  const salveaza = async () => {
    setLucru(true);
    try {
      const files = await fa();
      if (window.matchMedia?.("(pointer: coarse)").matches) {
        const urls = await Promise.all(files.map((fl) => new Promise<string>((ok, nu) => {
          const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = nu; r.readAsDataURL(fl);
        })));
        setArata(urls);
      } else {
        for (const fl of files) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(fl); a.download = fl.name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        }
      }
    } catch { window.print(); }
    setLucru(false);
  };
  return (
    <>
      <button type="button" className="bilet-no-print" disabled={lucru} onClick={salveaza} style={{
        minHeight: 48, padding: "0 12px", borderRadius: 14, border: "none", background: "#fff", color: RED, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", ...stil,
      }}>{lucru ? "…" : (ru ? "📥 В галерею" : "📥 În galerie")}</button>
      {arata && (
        <div role="dialog" aria-modal="true" className="bilet-no-print" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,10,12,0.97)", overflowY: "auto", padding: "16px 16px 28px" }}>
          <div style={{ maxWidth: 420, margin: "0 auto", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, color: "#fff", fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
                {ru ? "👆 Нажмите и держите палец на фото, затем выберите «Сохранить в Фото»" : "👆 Ține degetul apăsat pe poză, apoi alege «Salvează în Poze»"}
              </div>
              <button type="button" aria-label={ru ? "Закрыть" : "Închide"} onClick={() => setArata(null)} style={{
                width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", fontSize: 22, cursor: "pointer", flexShrink: 0,
              }}>×</button>
            </div>
            {arata.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt={ru ? "Билет TRANSLUX" : "Bilet TRANSLUX"} style={{ width: "100%", height: "auto", borderRadius: 18, display: "block", WebkitTouchCallout: "default" }} />
            ))}
            <button type="button" onClick={() => setArata(null)} style={{ minHeight: 48, borderRadius: 14, border: "none", background: "#fff", color: RED, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
              {ru ? "Готово" : "Gata"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
