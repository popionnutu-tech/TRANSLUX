"use client";

import * as React from "react";

// Fereastra care explică o promoție (Ion, 10.10.2026: «omul dacă apasă pe una din promoții să se deschidă o fereastră
// laconică, stilată, în care succint să explice cum lucrează reducerea, și cu X pentru închidere»). Butonul de jos pune
// Bălți ⇄ Chișinău în bara de căutare (alegeOferta din prima pagină).

export type TipPromo = "tur-retur" | "student";

const TXT = {
  ro: {
    "tur-retur": {
      titlu: "Tur-retur −20%", sub: "Returul cu 20% mai ieftin",
      pasi: [
        "Doar pe cursele Bălți ⇄ Chișinău, la cumpărarea biletului online.",
        "Alegi «Tur-retur», ziua plecării și ziua întoarcerii (în 30 de zile).",
        "Returul costă 120 lei în loc de 150. Plătești totul o singură dată.",
        "Biletele se anulează doar împreună, până pleacă cursa tur.",
      ],
      atentie: "Reducerea de student nu se adaugă la tur-retur.",
      buton: "Alege cursele",
    },
    student: {
      titlu: "Studenți −20%", sub: "Pentru universitate și colegiu",
      pasi: [
        "Doar pe cursele Bălți ⇄ Chișinău, la cumpărarea biletului online, pentru un loc.",
        "Alege ziua și cursa, iar la cumpărare bifează «Sunt student» și fotografiază carnetul și buletinul.",
        "Verificarea durează câteva secunde. Numele din formular trebuie să fie ca pe carnet.",
        "La urcare arăți carnetul șoferului.",
      ],
      atentie: "Nu merge dacă alegi tur-retur: atunci reducerea −20% e doar la retur.",
      buton: "Alege cursa",
    },
    din: "din 13.10", inchide: "Închide",
  },
  ru: {
    "tur-retur": {
      titlu: "Туда-обратно −20%", sub: "Обратный билет на 20% дешевле",
      pasi: [
        "Только на рейсах Бельцы ⇄ Кишинёв, при покупке билета онлайн.",
        "Выберите «Туда-обратно», день отъезда и день возвращения (в течение 30 дней).",
        "Обратный стоит 120 лей вместо 150. Оплата — одна на оба билета.",
        "Билеты отменяются только вместе, до отправления рейса туда.",
      ],
      atentie: "Студенческая скидка к туда-обратно не добавляется.",
      buton: "Выбрать рейсы",
    },
    student: {
      titlu: "Студентам −20%", sub: "Университет и колледж",
      pasi: [
        "Только на рейсах Бельцы ⇄ Кишинёв, при покупке билета онлайн, на одно место.",
        "Выберите день и рейс, а при покупке отметьте «Я студент» и сфотографируйте студенческий и паспорт.",
        "Проверка занимает несколько секунд. Имя в форме — как в студенческом.",
        "При посадке покажите студенческий водителю.",
      ],
      atentie: "Не действует, если выбрано туда-обратно: тогда скидка −20% только на обратный.",
      buton: "Выбрать рейс",
    },
    din: "с 13.10", inchide: "Закрыть",
  },
} as const;

export function PromoExplicatie({ tip, locale, inainteDe1310, onAlege, onClose }: {
  tip: TipPromo; locale: "ro" | "ru"; inainteDe1310: boolean; onAlege: () => void; onClose: () => void;
}) {
  const t = TXT[locale];
  const p = t[tip];
  const refX = React.useRef<HTMLButtonElement>(null);
  const inchide = React.useRef(onClose);
  inchide.current = onClose;
  React.useEffect(() => {
    refX.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") inchide.current(); };
    window.addEventListener("keydown", k);
    const sus = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = sus; };
  }, []);

  return (
    <div className="pe" role="dialog" aria-modal="true" aria-labelledby="pe-titlu">
      <style>{CSS}</style>
      <div className="pe-fundal" onClick={onClose} />
      <div className={`pe-cutie ${tip === "student" ? "st" : "tr"}`}>
        <button ref={refX} type="button" className="pe-x" onClick={onClose} aria-label={t.inchide}>&times;</button>
        <div className="pe-cap">
          <b className="pe-pct">−20%</b>
          <div>
            <h2 id="pe-titlu">{p.titlu}</h2>
            <p>{p.sub}{inainteDe1310 && <span className="pe-din">{t.din}</span>}</p>
          </div>
        </div>
        <ol className="pe-pasi">
          {p.pasi.map((x, i) => <li key={i}><span>{i + 1}</span>{x}</li>)}
        </ol>
        {/* Ion, 10.10: «menționează că studenți −20% nu merge dacă cursa e tur-retur». */}
        <p className="pe-atentie">{p.atentie}</p>
        <button type="button" className="pe-buton" onClick={() => { onAlege(); onClose(); }}>{p.buton} →</button>
      </div>
    </div>
  );
}

const CSS = `
.pe{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--font-opensans),"Open Sans",system-ui,sans-serif;color:#231A1C}
.pe-fundal{position:absolute;inset:0;background:rgba(35,20,24,.42);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:pe-in .18s ease-out}
.pe-cutie{position:relative;width:min(100%,440px);max-height:calc(100dvh - 32px);overflow-y:auto;box-sizing:border-box;background:#fff;border-radius:24px;padding:22px 20px 20px;box-shadow:0 30px 70px rgba(60,20,30,.25);animation:pe-sus .22s cubic-bezier(.2,.8,.2,1)}
.pe-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border-radius:50%;border:none;background:#F4EEEF;color:#6B5B5F;font-size:22px;line-height:1;cursor:pointer}
.pe-x:focus-visible,.pe-buton:focus-visible{outline:2px solid #9B1B30;outline-offset:2px}
.pe-cap{display:flex;align-items:center;gap:14px;padding-right:40px}
.pe-pct{flex:none;font-size:28px;font-weight:800;line-height:1;padding:12px;border-radius:16px}
.pe-cutie.tr .pe-pct{background:#FDF3E1;color:#B7791F}
.pe-cutie.st .pe-pct{background:#EAF1F9;color:#2E5A88}
.pe-cap h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.2px}
.pe-cap p{margin:2px 0 0;font-size:14px;color:#7A6A6E;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pe-din{font-size:12px;font-weight:800;color:#fff;background:#9B1B30;border-radius:999px;padding:1px 9px}
.pe-pasi{list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.pe-pasi li{display:flex;gap:10px;font-size:14.5px;line-height:1.45;color:#3A2F32}
.pe-pasi li span{flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;margin-top:1px}
.pe-cutie.tr .pe-pasi li span{background:#FDF3E1;color:#B7791F}
.pe-cutie.st .pe-pasi li span{background:#EAF1F9;color:#2E5A88}
.pe-atentie{margin:14px 0 0;padding:10px 12px;border-radius:12px;background:#FBEFF1;color:#7A1426;font-size:14px;font-weight:700;line-height:1.4}
.pe-buton{width:100%;min-height:52px;margin-top:16px;border:none;border-radius:14px;background:#9B1B30;color:#fff;font:800 16px inherit;font-family:inherit;cursor:pointer;box-shadow:0 10px 22px rgba(155,27,48,.22)}
@keyframes pe-in{from{opacity:0}to{opacity:1}}
@keyframes pe-sus{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media (max-width:520px){.pe{align-items:flex-end;padding:0}.pe-cutie{width:100%;border-radius:24px 24px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom))}}
@media (prefers-reduced-motion:reduce){.pe-fundal,.pe-cutie{animation:none}}
`;
