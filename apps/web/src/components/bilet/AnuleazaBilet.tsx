"use client";

import * as React from "react";

// «Anulează biletul» pe pagina biletului (Ion, 10.10.2026: «anularea la bilet posibilă și pe site în găsește biletul …
// dacă se identifică clientul»; migr. 557). Linkul biletului + ultimele 4 cifre ale telefonului = clientul; suma vine
// din grila de restituire; tur-returul se anulează întreg. Fără dispecer.

const TXT = {
  ro: {
    deschide: "Anulează biletul", titlu: "Anularea biletului", cifre: "Ultimele 4 cifre ale telefonului din comandă", vezi: "Vezi cât primești înapoi",
    primesti: (s: string, t: string) => `Primești înapoi ${s} lei din ${t} lei, pe cardul cu care ai plătit.`, cuRetur: "Se anulează și returul (tur-returul se anulează doar împreună).",
    confirma: "Anulează și returnează banii", renunta: "Nu, păstrez biletul", lucru: "Un moment…",
    anulat: (s: string) => `Biletul e anulat. Banca a primit cererea de returnare a ${s} lei; banii ajung pe card în câteva zile, după banca ta.`,
    schimbat: (s: string) => `Suma s-a schimbat între timp: ${s} lei. Confirmă din nou.`,
    erori: {
      cifre_gresite: "Cifrele nu se potrivesc.", pauza: "Prea multe încercări greșite. Încearcă din nou peste 15 minute.", urcat: "Biletul a fost scanat la urcare; nu se mai anulează.",
      plecat: "Cursa a plecat; biletul nu se mai anulează.", sub_4h: "Cu mai puțin de 4 ore înainte de plecare biletul nu se mai anulează.", stare: "Biletul e deja anulat sau returnat.", bani_inapoi: "Plata a ajuns fără bilet; banii se întorc automat, integral, pe card — nu e nimic de anulat.",
      inexistent: "Nu găsesc biletul.", sub_10: "Suma e sub minimul băncii (10 lei).", indisponibil: "Anularea nu merge acum. Încearcă din nou peste câteva minute.",
    } as Record<string, string>,
  },
  ru: {
    deschide: "Отменить билет", titlu: "Отмена билета", cifre: "Последние 4 цифры телефона из заказа", vezi: "Сколько вернётся",
    primesti: (s: string, t: string) => `Вернём ${s} лей из ${t} лей на карту, которой вы платили.`, cuRetur: "Отменится и обратный (туда-обратно отменяется только вместе).",
    confirma: "Отменить и вернуть деньги", renunta: "Нет, оставлю билет", lucru: "Минуту…",
    anulat: (s: string) => `Билет отменён. Банк получил запрос на возврат ${s} лей; деньги придут на карту через несколько дней, в зависимости от банка.`,
    schimbat: (s: string) => `Сумма изменилась: ${s} лей. Подтвердите ещё раз.`,
    erori: {
      cifre_gresite: "Цифры не совпадают.", pauza: "Слишком много неверных попыток. Попробуйте через 15 минут.", urcat: "Билет уже отсканирован при посадке; отменить нельзя.",
      plecat: "Рейс уже отправился; отменить нельзя.", sub_4h: "Менее чем за 4 часа до отправления билет не отменяется.", stare: "Билет уже отменён или возвращён.", bani_inapoi: "Оплата пришла без билета; деньги вернутся автоматически и полностью на карту — отменять нечего.",
      inexistent: "Билет не найден.", sub_10: "Сумма меньше минимума банка (10 лей).", indisponibil: "Отмена сейчас недоступна. Попробуйте через несколько минут.",
    } as Record<string, string>,
  },
} as const;

const lei = (n: number) => new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

export function AnuleazaBilet({ cod, locale }: { cod: string; locale: "ro" | "ru" }) {
  const tx = TXT[locale];
  const [deschis, setDeschis] = React.useState(false);
  const [cifre, setCifre] = React.useState("");
  const [oferta, setOferta] = React.useState<{ suma: number; total: number; cu_retur: boolean } | null>(null);
  const [mesaj, setMesaj] = React.useState<{ t: string; ok?: boolean } | null>(null);
  const [lucru, setLucru] = React.useState(false);
  const [gata, setGata] = React.useState(false);

  const cere = async (actiune: "oferta" | "confirma") => {
    setLucru(true); setMesaj(null);
    try {
      const r = await fetch("/api/bilete/anulare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cod, cifre, actiune, suma: oferta?.suma ?? 0 }) });
      const j = await r.json().catch(() => null);
      if (j?.ok && j.tip === "oferta") setOferta({ suma: Number(j.suma), total: Number(j.total), cu_retur: Boolean(j.cu_retur) });
      else if (j?.ok && j.tip === "suma_schimbata") { setOferta((o) => (o ? { ...o, suma: Number(j.suma) } : o)); setMesaj({ t: tx.schimbat(lei(Number(j.suma))) }); }
      else if (j?.ok && j.tip === "anulat") { setGata(true); setOferta(null); setMesaj({ t: tx.anulat(lei(Number(j.suma))), ok: true }); }
      else {
        const k = String(j?.cod ?? "indisponibil");
        setMesaj({ t: k === "cifre_gresite" && typeof j?.ramase === "number" ? `${tx.erori.cifre_gresite} (${j.ramase})` : tx.erori[k] ?? tx.erori.indisponibil });
        if (k !== "cifre_gresite") setOferta(null);
      }
    } catch { setMesaj({ t: tx.erori.indisponibil }); }
    setLucru(false);
  };

  if (!deschis) return <button type="button" className="ab-link bilet-no-print" onClick={() => setDeschis(true)}>{tx.deschide}<style>{CSS}</style></button>;
  return (
    <section className="ab bilet-no-print" aria-label={tx.titlu}>
      <style>{CSS}</style>
      <h2>{tx.titlu}</h2>
      {!gata && !oferta && (
        <form onSubmit={(e) => { e.preventDefault(); if (cifre.length === 4) void cere("oferta"); }} className="ab-rand">
          <label>{tx.cifre}<input inputMode="numeric" pattern="\d{4}" maxLength={4} value={cifre} onChange={(e) => setCifre(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
          <button type="submit" disabled={lucru || cifre.length !== 4}>{lucru ? tx.lucru : tx.vezi}</button>
        </form>
      )}
      {!gata && oferta && (
        <div className="ab-oferta">
          <p><b>{tx.primesti(lei(oferta.suma), lei(oferta.total))}</b>{oferta.cu_retur && <><br />{tx.cuRetur}</>}</p>
          <button type="button" className="ab-da" disabled={lucru} onClick={() => void cere("confirma")}>{lucru ? tx.lucru : tx.confirma}</button>
          <button type="button" className="ab-nu" disabled={lucru} onClick={() => { setOferta(null); setDeschis(false); setMesaj(null); }}>{tx.renunta}</button>
        </div>
      )}
      {mesaj && <p className={`ab-mesaj ${mesaj.ok ? "ok" : ""}`} role="status">{mesaj.t}</p>}
    </section>
  );
}

const CSS = `
.ab-link{border:none;background:none;padding:6px 0;color:#9B1B30;font:700 14px var(--font-opensans),Open Sans,sans-serif;text-decoration:underline;cursor:pointer;justify-self:center}
.ab{display:grid;gap:10px;padding:14px;border-radius:16px;background:#fff;border:1px solid #EEE3E5;font-family:var(--font-opensans),Open Sans,sans-serif}
.ab h2{margin:0;font-size:17px;font-weight:800;color:#231A1C}
.ab-rand{display:grid;gap:8px}
.ab-rand label{display:grid;gap:5px;font-size:14px;font-weight:700;color:#4A3E41}
.ab-rand input{height:50px;padding:0 14px;border-radius:12px;border:1.5px solid #E6DADC;font-size:22px;letter-spacing:6px;font-family:inherit;width:140px}
.ab-rand button,.ab-da{min-height:50px;border:none;border-radius:14px;background:#9B1B30;color:#fff;font:800 16px inherit;font-family:inherit;cursor:pointer}
.ab-rand button:disabled,.ab-da:disabled{background:#E3D6D9;color:#7A6A6E;cursor:default}
.ab-oferta{display:grid;gap:8px}
.ab-oferta p{margin:0;font-size:15px;line-height:1.5;color:#231A1C}
.ab-nu{min-height:44px;border:1.5px solid #E6DADC;border-radius:14px;background:#fff;color:#4A3E41;font:700 15px inherit;font-family:inherit;cursor:pointer}
.ab-mesaj{margin:0;font-size:15px;font-weight:700;color:#9B1B30;background:#FBEFF1;border-radius:12px;padding:10px 12px;line-height:1.45}
.ab-mesaj.ok{color:#2B6B3A;background:#EEF7EF}
`;
