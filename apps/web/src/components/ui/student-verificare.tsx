"use client";

import * as React from "react";
import { laJpeg, scrieStudent } from "@/lib/student-sesiune";

// Pasul «Verifică actele» de dinaintea căutării, la «Student −20%» (Ion, 10.10.2026: «dacă apasă student să se solicite
// înainte de căutare cursă verificare acte în regim live; verificarea să fie pasul următor»). Camera telefonului se
// deschide direct (capture), AI-ul răspunde în câteva secunde; la «accept» jetonul rămâne în filă și formularul de
// cumpărare pune singur −20% pe numele și telefonul de aici.
// Aspectul (Ion, 10.10: «fă un design easy going și stilat»): bandă albastră cu pașii 1–2, câmpuri cu eticheta înăuntru,
// plăci de poză cu previzualizarea pozei făcute, acordul pe scurt cu «detalii».

const TXT = {
  ro: {
    eticheta: "Reducere de student", titlu: "Arată-ne carnetul", sub: "Durează un minut. Apoi alegi cursa.",
    pas1: "Actele", pas2: "Cursa",
    nume: "Nume", prenume: "Prenume", telefon: "Telefon", telNota: "Aceleași date vor fi pe bilet.",
    carnet: "Carnet de student", act: "Buletin sau pașaport", fa: "Fă poza", refa: "Refă",
    sfat: "Universitate sau colegiu din Moldova, cu viza pe anul acesta. Poză reală, la lumină, fără reflexii.",
    acordScurt: "Sunt de acord ca pozele să fie verificate automat.", detalii: "Detalii",
    acord: "TRANSLUX prelucrează pozele actelor pentru verificarea reducerii, inclusiv compararea fețelor, prin serviciul Anthropic. Poza actului se șterge după verificare, restul în 90 de zile.",
    verifica: "Verifică actele", seVerifica: "Se verifică…", ok: "Carnet verificat", okSub: "−20% se pune singur la plată, pe numele tău.", continua: "Alege cursa →",
    neclar: "Poza nu se citește bine. Mai încearcă una, la lumină, fără reflexii.",
    respins: "Carnetul nu a trecut verificarea. Poți cumpăra la prețul întreg.", refuzat: "Prea multe încercări azi. Încearcă mâine.",
    eroare: "Verificarea nu merge acum. Poți cumpăra la prețul întreg.", completeaza: "Completează numele, prenumele și telefonul.",
    inchide: "Închide",
  },
  ru: {
    eticheta: "Студенческая скидка", titlu: "Покажите студенческий", sub: "Займёт минуту. Затем выберете рейс.",
    pas1: "Документы", pas2: "Рейс",
    nume: "Фамилия", prenume: "Имя", telefon: "Телефон", telNota: "Эти же данные будут на билете.",
    carnet: "Студенческий", act: "Удостоверение или паспорт", fa: "Снять фото", refa: "Переснять",
    sfat: "Университет или колледж Молдовы, продлённый на этот год. Реальное фото, при свете, без бликов.",
    acordScurt: "Согласен(на) на автоматическую проверку фото.", detalii: "Подробнее",
    acord: "TRANSLUX обрабатывает фото документов для проверки скидки, включая сравнение лиц, через сервис Anthropic. Фото документа удаляется после проверки, остальное — через 90 дней.",
    verifica: "Проверить документы", seVerifica: "Проверяем…", ok: "Студенческий проверен", okSub: "−20% применится при оплате, на ваше имя.", continua: "Выбрать рейс →",
    neclar: "Фото плохо читается. Попробуйте ещё раз, при свете, без бликов.",
    respins: "Студенческий не прошёл проверку. Можно купить по полной цене.", refuzat: "Слишком много попыток сегодня. Попробуйте завтра.",
    eroare: "Проверка сейчас не работает. Можно купить по полной цене.", completeaza: "Заполните фамилию, имя и телефон.",
    inchide: "Закрыть",
  },
} as const;

function IconCarnet() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="4" y="10" width="40" height="28" rx="5" fill="#DCE8F5" stroke="#2E5A88" strokeWidth="2.4" />
      <circle cx="16" cy="22" r="4.5" fill="#2E5A88" /><path d="M9 32c1.5-4 4-5.5 7-5.5s5.5 1.5 7 5.5" stroke="#2E5A88" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M28 19h10M28 25h10M28 31h6" stroke="#2E5A88" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function IconAparat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function StudentVerificare({ locale, onGata, onClose }: { locale: "ro" | "ru"; onGata: () => void; onClose: () => void }) {
  const tx = TXT[locale];
  const [camp, setCamp] = React.useState({ nume: "", prenume: "", telefon: "" });
  const [poze, setPoze] = React.useState<{ carnet: File | null; act: File | null }>({ carnet: null, act: null });
  const [vazut, setVazut] = React.useState<{ carnet: string | null; act: string | null }>({ carnet: null, act: null });
  const [acord, setAcord] = React.useState(false);
  const [detalii, setDetalii] = React.useState(false);
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
  // Previzualizarea pozelor (URL-uri locale, eliberate la schimbare și la închidere).
  const urlRef = React.useRef(vazut);
  urlRef.current = vazut;
  React.useEffect(() => () => { for (const u of Object.values(urlRef.current)) if (u) URL.revokeObjectURL(u); }, []);
  const alegePoza = (k: "carnet" | "act", f: File | null) => {
    setPoze((x) => ({ ...x, [k]: f }));
    setVazut((v) => { if (v[k]) URL.revokeObjectURL(v[k]!); return { ...v, [k]: f ? URL.createObjectURL(f) : null }; });
    setMesaj(null);
  };

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

  const placa = (k: "carnet" | "act", t: string) => (
    <label className={`sv-placa ${poze[k] ? "are" : ""}`}>
      {vazut[k] ? <img src={vazut[k]!} alt="" className="sv-vazut" /> : <span className="sv-ic"><IconCarnet /></span>}
      <span className="sv-placa-t">{t}</span>
      <span className="sv-placa-b">{poze[k] ? <>✓ {tx.refa}</> : <><IconAparat /> {tx.fa}</>}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => alegePoza(k, e.target.files?.[0] ?? null)} aria-label={t} />
    </label>
  );

  return (
    <div className="sv" role="dialog" aria-modal="true" aria-labelledby="sv-titlu">
      <style>{CSS}</style>
      <div className="sv-fundal" onClick={onClose} />
      <div className="sv-cutie">
        <header className="sv-banda">
          <button type="button" className="sv-x" onClick={onClose} aria-label={tx.inchide}>&times;</button>
          <span className="sv-chip">{tx.eticheta} · −20%</span>
          <h2 id="sv-titlu">{ok ? tx.ok : tx.titlu}</h2>
          <p>{ok ? tx.okSub : tx.sub}</p>
          <ol className="sv-pasi" aria-hidden="true">
            <li className="on"><b>{ok ? "✓" : "1"}</b>{tx.pas1}</li>
            <li className={ok ? "on" : ""}><b>2</b>{tx.pas2}</li>
          </ol>
        </header>

        {ok ? (
          <div className="sv-corp">
            <div className="sv-bifa" aria-hidden="true">✓</div>
            <button type="button" className="sv-buton" onClick={() => { onGata(); onClose(); }}>{tx.continua}</button>
          </div>
        ) : (
          <div className="sv-corp">
            <div className="sv-doua">
              <label className="sv-camp"><input value={camp.nume} onChange={scrie("nume")} autoComplete="family-name" maxLength={40} placeholder=" " /><span>{tx.nume}</span></label>
              <label className="sv-camp"><input value={camp.prenume} onChange={scrie("prenume")} autoComplete="given-name" maxLength={40} placeholder=" " /><span>{tx.prenume}</span></label>
            </div>
            <label className="sv-camp"><input type="tel" inputMode="tel" autoComplete="tel" value={camp.telefon} onChange={scrie("telefon")} placeholder=" " /><span>{tx.telefon}</span></label>
            <small className="sv-mic">{tx.telNota}</small>

            <div className="sv-doua">{placa("carnet", tx.carnet)}{placa("act", tx.act)}</div>
            <p className="sv-sfat"><span aria-hidden="true">💡</span>{tx.sfat}</p>

            <div className="sv-acord">
              <label><input type="checkbox" checked={acord} onChange={(e) => setAcord(e.target.checked)} /><span>{tx.acordScurt}</span></label>
              <button type="button" className="sv-detalii" onClick={() => setDetalii((d) => !d)} aria-expanded={detalii}>{tx.detalii}</button>
              {detalii && <p>{tx.acord}</p>}
            </div>

            {mesaj && <p className="sv-mesaj" role="status">{mesaj}</p>}
            <button type="button" className="sv-buton" disabled={!gata || lucru} onClick={verifica}>
              {lucru && <span className="sv-roata" aria-hidden="true" />}{lucru ? tx.seVerifica : tx.verifica}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.sv{--sv-albastru:#2E5A88;--sv-adanc:#1E3F63;--sv-red:#9B1B30;--sv-text:#1F1A1C;--sv-gri:#6D6468;--sv-linie:#E3E7EE;
  position:fixed;inset:0;z-index:101;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--font-opensans),"Open Sans",system-ui,sans-serif;color:var(--sv-text)}
.sv-fundal{position:absolute;inset:0;background:rgba(20,28,40,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:sv-in .18s ease-out}
.sv-cutie{position:relative;width:min(100%,460px);max-height:calc(100dvh - 32px);overflow-y:auto;box-sizing:border-box;background:#fff;border-radius:26px;box-shadow:0 30px 70px rgba(20,30,50,.28);animation:sv-sus .24s cubic-bezier(.2,.8,.2,1)}
.sv-banda{position:relative;padding:20px 20px 16px;color:#fff;background:radial-gradient(120% 140% at 100% 0%,#4F86BF 0%,var(--sv-albastru) 45%,var(--sv-adanc) 100%)}
.sv-x{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:21px;line-height:1;cursor:pointer}
.sv-chip{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.4px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:3px 10px}
.sv-banda h2{margin:10px 40px 0 0;font-size:24px;line-height:1.15;font-weight:800;letter-spacing:-.3px}
.sv-banda p{margin:4px 0 0;font-size:15px;opacity:.9}
.sv-pasi{list-style:none;margin:14px 0 0;padding:0;display:flex;gap:16px;font-size:13.5px;font-weight:700;opacity:.95}
.sv-pasi li{display:flex;align-items:center;gap:7px;opacity:.6}
.sv-pasi li.on{opacity:1}
.sv-pasi b{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;background:rgba(255,255,255,.22)}
.sv-pasi li.on b{background:#fff;color:var(--sv-albastru)}
.sv-corp{display:flex;flex-direction:column;gap:12px;padding:18px 18px 20px}
.sv-doua{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sv-camp{position:relative;display:block;min-width:0}
.sv-camp input{width:100%;box-sizing:border-box;height:56px;padding:20px 14px 6px;border-radius:14px;border:1.5px solid var(--sv-linie);background:#F7F9FC;font-size:17px;font-family:inherit;color:var(--sv-text);outline:none;transition:border-color .15s,background .15s}
.sv-camp input:focus{border-color:var(--sv-albastru);background:#fff}
.sv-camp span{position:absolute;left:15px;top:18px;font-size:16px;color:var(--sv-gri);pointer-events:none;transition:all .15s}
.sv-camp input:focus+span,.sv-camp input:not(:placeholder-shown)+span{top:8px;font-size:12px;font-weight:700;color:var(--sv-albastru)}
.sv-mic{margin:-6px 0 0 4px;font-size:13px;color:var(--sv-gri)}
.sv-placa{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:132px;padding:12px 8px;border-radius:18px;background:#F2F6FB;border:1.5px dashed #B9CBE0;text-align:center;cursor:pointer;overflow:hidden;transition:transform .12s,border-color .15s}
.sv-placa:active{transform:scale(.98)}
.sv-placa.are{border:1.5px solid #2B6B3A;background:#F1F8F2}
.sv-placa input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.sv-vazut{width:100%;height:64px;object-fit:cover;border-radius:10px}
.sv-placa-t{font-size:14.5px;font-weight:700;color:var(--sv-text);line-height:1.25}
.sv-placa-b{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:14.5px;font-weight:800;color:#fff;background:var(--sv-albastru);border-radius:999px;padding:6px 12px}
.sv-placa.are .sv-placa-b{background:#2B6B3A}
.sv-sfat{margin:0;display:flex;gap:8px;font-size:14px;line-height:1.45;color:#3B3438;background:#FFF8E8;border-radius:14px;padding:10px 12px}
.sv-acord{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.sv-acord label{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--sv-text);cursor:pointer;flex:1 1 220px}
.sv-acord input{width:24px;height:24px;margin:0;flex:none;accent-color:var(--sv-albastru)}
.sv-detalii{border:none;background:none;padding:4px 0;color:var(--sv-albastru);font:700 14px inherit;font-family:inherit;text-decoration:underline;cursor:pointer}
.sv-acord p{flex-basis:100%;margin:0;font-size:13px;line-height:1.45;color:var(--sv-gri)}
.sv-mesaj{margin:0;font-size:15px;font-weight:700;color:var(--sv-red);background:#FBEFF1;border-radius:12px;padding:10px 12px}
.sv-buton{width:100%;min-height:56px;border:none;border-radius:16px;background:var(--sv-red);color:#fff;font:800 17px inherit;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 10px 24px rgba(155,27,48,.25);transition:filter .15s}
.sv-buton:hover{filter:brightness(1.06)}
.sv-buton:disabled{background:#E6E2E4;color:#7A7276;box-shadow:none;cursor:default}
.sv-roata{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:sv-roata .8s linear infinite}
.sv-buton:disabled .sv-roata{border-color:rgba(0,0,0,.15);border-top-color:#7A7276}
.sv-bifa{align-self:center;width:72px;height:72px;border-radius:50%;background:#E6F3E8;color:#2B6B3A;font-size:38px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:6px 0}
.sv-x:focus-visible,.sv-buton:focus-visible,.sv-detalii:focus-visible{outline:2px solid #fff;outline-offset:2px}
.sv-buton:focus-visible,.sv-detalii:focus-visible{outline-color:var(--sv-albastru)}
@keyframes sv-in{from{opacity:0}to{opacity:1}}
@keyframes sv-sus{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes sv-roata{to{transform:rotate(360deg)}}
@media (max-width:520px){.sv{align-items:flex-end;padding:0}.sv-cutie{width:100%;border-radius:26px 26px 0 0}.sv-corp{padding-bottom:calc(20px + env(safe-area-inset-bottom))}}
@media (prefers-reduced-motion:reduce){.sv-fundal,.sv-cutie{animation:none}.sv-roata{animation-duration:2s}}
`;
