"use client";

import * as React from "react";
import { laJpeg, scrieStudent } from "@/lib/student-sesiune";

// Pasul «Verifică actele» de dinaintea căutării, la «Student −20%» (Ion, 10.10.2026: «dacă apasă student să se solicite
// înainte de căutare cursă verificare acte în regim live; verificarea să fie pasul următor»). Camera telefonului se
// deschide direct (capture), AI-ul răspunde în câteva secunde; la «accept» jetonul rămâne în filă și formularul de
// cumpărare pune singur −20% pe numele și telefonul de aici.

const TXT = {
  ro: {
    titlu: "Verificarea de student", sub: "Pasul 1 din 2 · apoi alegi cursa",
    nume: "Nume", prenume: "Prenume", telefon: "Telefon", telNota: "Aceleași date le vei avea pe bilet.",
    carnet: "Carnetul de student", act: "Buletinul sau pașaportul", fa: "Fă poza", refa: "Poza e gata · refă",
    nota: "Poze reale, la lumină, nu capturi de ecran. Numele trebuie să fie ca pe carnet.",
    acord: "Sunt de acord ca TRANSLUX să prelucreze pozele actelor pentru verificarea reducerii (inclusiv compararea fețelor, prin serviciul Anthropic). Poza actului se șterge după verificare, restul în 90 de zile.",
    verifica: "Verifică actele", seVerifica: "Se verifică…", ok: "Carnet verificat: −20%", continua: "Alege cursa →",
    neclar: "Poza nu se citește bine. Fă o poză mai clară, la lumină, fără reflexii.",
    respins: "Carnetul nu a trecut verificarea. Poți cumpăra la prețul întreg.", refuzat: "Prea multe încercări azi. Încearcă mâine.",
    eroare: "Verificarea nu merge acum. Poți cumpăra la prețul întreg.", completeaza: "Completează numele, prenumele și telefonul.",
    inchide: "Închide",
  },
  ru: {
    titlu: "Проверка студента", sub: "Шаг 1 из 2 · затем выбор рейса",
    nume: "Фамилия", prenume: "Имя", telefon: "Телефон", telNota: "Эти же данные будут на билете.",
    carnet: "Студенческий билет", act: "Удостоверение или паспорт", fa: "Сделать фото", refa: "Фото готово · переснять",
    nota: "Реальные фото при свете, не скриншоты. Имя должно совпадать со студенческим.",
    acord: "Я согласен(на), что TRANSLUX обработает фото документов для проверки скидки (включая сравнение лиц, через сервис Anthropic). Фото документа удаляется после проверки, остальное — через 90 дней.",
    verifica: "Проверить документы", seVerifica: "Проверяем…", ok: "Студенческий проверен: −20%", continua: "Выбрать рейс →",
    neclar: "Фото плохо читается. Сделайте более чёткое фото, при свете, без бликов.",
    respins: "Студенческий не прошёл проверку. Можно купить по полной цене.", refuzat: "Слишком много попыток сегодня. Попробуйте завтра.",
    eroare: "Проверка сейчас не работает. Можно купить по полной цене.", completeaza: "Заполните фамилию, имя и телефон.",
    inchide: "Закрыть",
  },
} as const;

export function StudentVerificare({ locale, onGata, onClose }: { locale: "ro" | "ru"; onGata: () => void; onClose: () => void }) {
  const tx = TXT[locale];
  const [camp, setCamp] = React.useState({ nume: "", prenume: "", telefon: "" });
  const [poze, setPoze] = React.useState<{ carnet: File | null; act: File | null }>({ carnet: null, act: null });
  const [acord, setAcord] = React.useState(false);
  const [lucru, setLucru] = React.useState(false);
  const [mesaj, setMesaj] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const inchide = React.useRef(onClose);
  inchide.current = onClose;
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") inchide.current(); };
    window.addEventListener("keydown", k);
    const sus = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = sus; };
  }, []);

  const scrie = (k: keyof typeof camp) => (e: React.ChangeEvent<HTMLInputElement>) => setCamp((c) => ({ ...c, [k]: e.target.value }));
  const gata = camp.nume.trim().length >= 2 && camp.prenume.trim().length >= 2 && camp.telefon.trim().length >= 6 && poze.carnet && poze.act && acord;

  const verifica = async () => {
    if (!camp.nume.trim() || !camp.prenume.trim() || !camp.telefon.trim()) { setMesaj(tx.completeaza); return; }
    if (!poze.carnet || !poze.act || !acord) return;
    setLucru(true); setMesaj(null);
    try {
      const [carnet, act] = await Promise.all([laJpeg(poze.carnet), laJpeg(poze.act)]);
      // Numele în aceeași formă ca formularul de cumpărare («Nume Prenume»): jetonul e legat de el.
      const passengerName = `${camp.nume.trim()} ${camp.prenume.trim()}`;
      const r = await fetch("/api/bilete/student", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passengerName, phone: camp.telefon, carnet, act, consimtamant: true }),
      });
      const j = await r.json().catch(() => null);
      if (j?.verdict === "accept" && typeof j.jeton === "string") {
        scrieStudent({ jeton: j.jeton, expiraLa: String(j.expiraLa), nume: camp.nume.trim(), prenume: camp.prenume.trim(), telefon: camp.telefon.trim() });
        setOk(true);
      } else {
        setMesaj(j?.verdict === "poza_neclara" ? tx.neclar : j?.verdict === "respins" ? tx.respins : j?.verdict === "refuzat" ? tx.refuzat : tx.eroare);
      }
    } catch { setMesaj(tx.neclar); }
    setLucru(false);
  };

  const poza = (k: "carnet" | "act", t: string) => (
    <label className={`sv-poza ${poze[k] ? "are" : ""}`}>
      <span className="sv-poza-t">{t}</span>
      <span className="sv-poza-b">{poze[k] ? `✓ ${tx.refa}` : `📷 ${tx.fa}`}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => setPoze((x) => ({ ...x, [k]: e.target.files?.[0] ?? null }))} />
    </label>
  );

  return (
    <div className="sv" role="dialog" aria-modal="true" aria-labelledby="sv-titlu">
      <style>{CSS}</style>
      <div className="sv-fundal" onClick={onClose} />
      <div className="sv-cutie">
        <button type="button" className="sv-x" onClick={onClose} aria-label={tx.inchide}>&times;</button>
        <div className="sv-cap">
          <b className="sv-pct">−20%</b>
          <div><h2 id="sv-titlu">{tx.titlu}</h2><p>{tx.sub}</p></div>
        </div>
        {ok ? (
          <div className="sv-ok">
            <p>✓ {tx.ok}</p>
            <button type="button" className="sv-buton" onClick={() => { onGata(); onClose(); }}>{tx.continua}</button>
          </div>
        ) : (
          <div className="sv-corp">
            <div className="sv-doua">
              <label>{tx.nume}<input value={camp.nume} onChange={scrie("nume")} autoComplete="family-name" maxLength={40} /></label>
              <label>{tx.prenume}<input value={camp.prenume} onChange={scrie("prenume")} autoComplete="given-name" maxLength={40} /></label>
            </div>
            <label>{tx.telefon}<input type="tel" inputMode="tel" autoComplete="tel" placeholder="+373 69 123 456" value={camp.telefon} onChange={scrie("telefon")} /><small>{tx.telNota}</small></label>
            <div className="sv-doua">{poza("carnet", tx.carnet)}{poza("act", tx.act)}</div>
            <p className="sv-nota">{tx.nota}</p>
            <label className="sv-acord"><input type="checkbox" checked={acord} onChange={(e) => setAcord(e.target.checked)} /><span>{tx.acord}</span></label>
            {mesaj && <p className="sv-mesaj" role="status">{mesaj}</p>}
            <button type="button" className="sv-buton" disabled={!gata || lucru} onClick={verifica}>{lucru ? tx.seVerifica : tx.verifica}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.sv{position:fixed;inset:0;z-index:101;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--font-opensans),"Open Sans",system-ui,sans-serif;color:#231A1C}
.sv-fundal{position:absolute;inset:0;background:rgba(35,20,24,.42);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.sv-cutie{position:relative;width:min(100%,460px);max-height:calc(100dvh - 32px);overflow-y:auto;box-sizing:border-box;background:#fff;border-radius:24px;padding:22px 20px 20px;box-shadow:0 30px 70px rgba(60,20,30,.25)}
.sv-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border-radius:50%;border:none;background:#F4EEEF;color:#6B5B5F;font-size:22px;line-height:1;cursor:pointer}
.sv-cap{display:flex;align-items:center;gap:14px;padding-right:40px}
.sv-pct{flex:none;font-size:26px;font-weight:800;line-height:1;padding:12px;border-radius:16px;background:#EAF1F9;color:#2E5A88}
.sv-cap h2{margin:0;font-size:20px;font-weight:800}
.sv-cap p{margin:2px 0 0;font-size:15px;color:#4A3E41}
.sv-corp{display:flex;flex-direction:column;gap:12px;margin-top:16px}
.sv-corp label{display:flex;flex-direction:column;gap:5px;font-size:15px;font-weight:700;color:#231A1C;min-width:0}
.sv-corp input:not([type=checkbox]):not([type=file]){height:46px;padding:0 12px;border-radius:12px;border:1.5px solid #E6DADC;font-size:17px;font-family:inherit;color:#231A1C;background:#fff;min-width:0;height:50px!important}
.sv-corp small{font-weight:400;font-size:13.5px;color:#4A3E41}
.sv-doua{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sv-poza{position:relative;border:1.5px dashed #B99AA2;border-radius:14px;padding:14px 10px;align-items:center;text-align:center;cursor:pointer;background:#FBF8F8}
.sv-poza.are{border-style:solid;border-color:#2B6B3A;background:#F1F8F2}
.sv-poza input{position:absolute;inset:0;opacity:0;cursor:pointer}
.sv-poza-t{font-size:15px;font-weight:700;color:#231A1C}
.sv-poza-b{font-size:16px;font-weight:800;color:#9B1B30}
.sv-poza.are .sv-poza-b{color:#2B6B3A}
.sv-nota{margin:0;font-size:15px;color:#231A1C;line-height:1.5}
.sv-acord{flex-direction:row!important;align-items:flex-start;gap:8px!important;font-weight:400!important;font-size:14px!important;line-height:1.45;color:#231A1C!important}
.sv-acord input{width:24px;height:24px;margin:0;flex:none;accent-color:#9B1B30}
.sv-mesaj{margin:0;font-size:16px;font-weight:700;color:#9B1B30}
.sv-buton{width:100%;min-height:56px;border:none;border-radius:14px;background:#9B1B30;color:#fff;font:800 17px inherit;font-family:inherit;cursor:pointer;box-shadow:0 10px 22px rgba(155,27,48,.22)}
.sv-buton:disabled{background:#E3D6D9;color:#7A6A6E;box-shadow:none;cursor:default}
.sv-ok{display:flex;flex-direction:column;gap:14px;margin-top:18px}
.sv-ok p{margin:0;font-size:17px;font-weight:800;color:#2B6B3A;background:#F1F8F2;border-radius:14px;padding:14px;text-align:center}
.sv-x:focus-visible,.sv-buton:focus-visible{outline:2px solid #9B1B30;outline-offset:2px}
@media (max-width:520px){.sv{align-items:flex-end;padding:0}.sv-cutie{width:100%;border-radius:24px 24px 0 0;padding:20px 16px calc(18px + env(safe-area-inset-bottom))}}
`;
