"use client";

import * as React from "react";
import Link from "next/link";
import { OPERATOR } from "@/components/legal/legal-content";

// «Găsește biletul meu» (Ion, 10.10.2026; migr. 552): omul scrie telefonul cu care a cumpărat, iar linkurile biletelor
// viitoare îi vin prin SMS pe acel număr. Pe ecran nu apare niciun bilet — linkul biletului e cheia lui.

const TXT = {
  ro: {
    titlu: "Găsește biletul meu", sub: "Scrie telefonul cu care ai cumpărat. Îți trimitem prin SMS linkurile biletelor tale.",
    telefon: "Telefon", trimite: "Trimite-mi biletele", seTrimite: "Se trimite…",
    ok: "Gata. Dacă pe acest număr sunt bilete, SMS-ul cu linkurile vine în câteva secunde.",
    plafon: "Prea multe cereri de pe acest număr. Încearcă peste o oră.", telGresit: "Numărul nu pare corect. Scrie-l ca pe bilet, de ex. 069 123 456.",
    neconfigurat: "Trimiterea prin SMS pornește în curând.", eroare: "Nu a mers acum. Încearcă din nou peste câteva minute.",
    altfel: "Biletul e și în e-mailul de după plată (dacă l-ai lăsat) și în botul Telegram. La întrebări:", acasa: "← Pagina principală",
  },
  ru: {
    titlu: "Найти мой билет", sub: "Укажите телефон, с которого покупали. Ссылки на ваши билеты придут по SMS.",
    telefon: "Телефон", trimite: "Прислать мои билеты", seTrimite: "Отправляем…",
    ok: "Готово. Если на этом номере есть билеты, SMS со ссылками придёт через несколько секунд.",
    plafon: "Слишком много запросов с этого номера. Попробуйте через час.", telGresit: "Номер выглядит неверно. Укажите его как в билете, напр. 069 123 456.",
    neconfigurat: "Отправка по SMS скоро заработает.", eroare: "Сейчас не получилось. Попробуйте через несколько минут.",
    altfel: "Билет также есть в письме после оплаты (если вы указали e-mail) и в Telegram-боте. Вопросы:", acasa: "← Главная",
  },
} as const;

export function GasesteBilet({ locale }: { locale: "ro" | "ru" }) {
  const tx = TXT[locale];
  const [tel, setTel] = React.useState("");
  const [lucru, setLucru] = React.useState(false);
  const [mesaj, setMesaj] = React.useState<{ t: string; ok: boolean } | null>(null);
  const trimite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLucru(true); setMesaj(null);
    try {
      const r = await fetch("/api/bilete/gaseste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: tel, lang: locale, website: "" }) });
      const j = await r.json().catch(() => null);
      if (j?.ok) setMesaj({ t: tx.ok, ok: true });
      else setMesaj({ t: j?.motiv === "plafon" ? tx.plafon : j?.motiv === "telefon" ? tx.telGresit : j?.motiv === "neconfigurat" ? tx.neconfigurat : tx.eroare, ok: false });
    } catch { setMesaj({ t: tx.eroare, ok: false }); }
    setLucru(false);
  };
  return (
    <main className="gb">
      <style>{CSS}</style>
      <form className="gb-cutie" onSubmit={trimite}>
        <span className="gb-ic" aria-hidden="true">🎫</span>
        <h1>{tx.titlu}</h1>
        <p className="gb-sub">{tx.sub}</p>
        <label className="gb-camp"><span>{tx.telefon}</span>
          <input type="tel" inputMode="tel" autoComplete="tel" required placeholder="+373 69 123 456" value={tel} onChange={(e) => setTel(e.target.value)} />
        </label>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="gb-capcana" />
        <button type="submit" className="gb-buton" disabled={lucru || tel.trim().length < 6}>{lucru ? tx.seTrimite : tx.trimite}</button>
        {mesaj && <p className={`gb-mesaj ${mesaj.ok ? "ok" : ""}`} role="status">{mesaj.t}</p>}
        <p className="gb-altfel">{tx.altfel} <a href={`tel:${OPERATOR.phone.replace(/\s+/g, "")}`}>{OPERATOR.phone}</a></p>
        <Link href={`/${locale}`} className="gb-acasa">{tx.acasa}</Link>
      </form>
    </main>
  );
}

const CSS = `
.gb{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;padding:48px 16px;box-sizing:border-box;background:linear-gradient(180deg,#FBF4F5,#F4ECEE);font-family:var(--font-opensans),"Open Sans",system-ui,sans-serif;color:#231A1C}
.gb-cutie{width:100%;max-width:440px;background:#fff;border-radius:24px;padding:26px 22px;box-shadow:0 20px 50px rgba(116,18,31,.10);display:flex;flex-direction:column;gap:12px}
.gb-ic{font-size:34px}
.gb h1{margin:0;font-size:24px;font-weight:800;color:#9B1B30}
.gb-sub{margin:0;font-size:15px;line-height:1.5;color:#4A3E41}
.gb-camp{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:700;color:#4A3E41}
.gb-camp input{height:52px;padding:0 14px;border-radius:14px;border:1.5px solid #E6DADC;font-size:18px;font-family:inherit;color:#231A1C}
.gb-camp input:focus{outline:2px solid #9B1B30;outline-offset:1px}
.gb-capcana{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.gb-buton{min-height:54px;border:none;border-radius:14px;background:#9B1B30;color:#fff;font:800 17px inherit;font-family:inherit;cursor:pointer;box-shadow:0 10px 22px rgba(155,27,48,.22)}
.gb-buton:disabled{background:#E3D6D9;color:#7A6A6E;box-shadow:none;cursor:default}
.gb-mesaj{margin:0;font-size:15px;font-weight:700;color:#9B1B30;background:#FBEFF1;border-radius:12px;padding:10px 12px;line-height:1.45}
.gb-mesaj.ok{color:#2B6B3A;background:#EEF7EF}
.gb-altfel{margin:4px 0 0;font-size:13.5px;color:#6B5B5F;line-height:1.5}
.gb-altfel a{color:#9B1B30;font-weight:700;white-space:nowrap}
.gb-acasa{font-size:14px;color:#6B5B5F;text-decoration:none}
`;
