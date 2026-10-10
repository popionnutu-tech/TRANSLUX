"use client";

import * as React from "react";
import { pretBilet } from "@/app/(public)/bilete-actions";
import { citesteStudent, laJpeg } from "@/lib/student-sesiune";

// Promoțiile online Bălți ⇄ Chișinău (Ion, 10.10.2026; migr. 546): −20% la retur (cu codul de retur de pe biletul tur)
// sau −20% pentru student (carnet + pașaport/buletin verificate de AI). Nu se cumulează. Prețul arătat vine din panou
// (pretBilet); comanda îl recalculează oricum.

const RED = "#9B1B30";
export const CHEIE_COD_RETUR = "tlx_cod_retur";

const TXT = {
  ro: {
    titlu: "Reduceri −20%", nimic: "Fără reducere", retur: "Am bilet tur (cumpăr returul)", student: "Sunt student (universitate sau colegiu)",
    cod: "Codul de retur de pe biletul tur", aplica: "Aplică",
    studentNota: "Fotografiază carnetul de student și pașaportul sau buletinul (poze reale, nu capturi de ecran). Numele trebuie să fie același ca în formular. Reducerea e pentru un singur loc; arăți carnetul șoferului la urcare.",
    carnet: "Carnetul de student", act: "Pașaportul sau buletinul", alege: "Fă poza", refa: "Poza e gata · refă",
    acord: "Sunt de acord ca TRANSLUX să prelucreze pozele actelor pentru verificarea reducerii (inclusiv compararea fețelor, prin serviciul Anthropic). Poza actului se șterge după verificare, restul în 90 de zile.",
    verifica: "Verifică", seVerifica: "Se verifică…", ok: "Carnet verificat: −20%", unLoc: "Reducerea de student e pentru 1 loc.",
    neclar: "Poza nu se citește bine. Fă o poză mai clară, la lumină, fără reflexii.",
    respins: "Carnetul nu a trecut verificarea. Se poate cumpăra la prețul întreg.", refuzat: "Prea multe încercări azi. Încearcă mâine.",
    eroare: "Verificarea nu merge acum. Se poate cumpăra la prețul întreg.", completeaza: "Completează întâi numele, prenumele și telefonul.",
    pret: (p: number, i: number) => `${p} lei în loc de ${i} lei pe loc`,
  },
  ru: {
    titlu: "Скидки −20%", nimic: "Без скидки", retur: "У меня есть билет туда (покупаю обратный)", student: "Я студент (университет или колледж)",
    cod: "Код обратного билета с билета туда", aplica: "Применить",
    studentNota: "Сфотографируйте студенческий билет и паспорт или удостоверение (реальные фото, не скриншоты). Имя должно совпадать с формой. Скидка — на одно место; студенческий покажите водителю при посадке.",
    carnet: "Студенческий билет", act: "Паспорт или удостоверение", alege: "Сделать фото", refa: "Фото готово · переснять",
    acord: "Я согласен(на), что TRANSLUX обработает фото документов для проверки скидки (включая сравнение лиц, через сервис Anthropic). Фото документа удаляется после проверки, остальное — через 90 дней.",
    verifica: "Проверить", seVerifica: "Проверяем…", ok: "Студенческий проверен: −20%", unLoc: "Студенческая скидка — на 1 место.",
    neclar: "Фото плохо читается. Сделайте более чёткое фото, при свете, без бликов.",
    respins: "Студенческий не прошёл проверку. Можно купить по полной цене.", refuzat: "Слишком много попыток сегодня. Попробуйте завтра.",
    eroare: "Проверка сейчас не работает. Можно купить по полной цене.", completeaza: "Сначала заполните фамилию, имя и телефон.",
    pret: (p: number, i: number) => `${p} лей вместо ${i} лей за место`,
  },
} as const;

export interface ReducereAleasa { pret: number | null; codRetur: string | null; studentJeton: string | null; blocheazaPlata: boolean }

export function PromoReduceri(p: {
  /** Tur-retur ales (Ion, 10.10.2026: «dacă e apăsat tur-retur, student să nu se folosească»): fără opțiunea de student. */
  faraStudent?: boolean;
  locale: "ro" | "ru"; trip: { trip_date: string; crm_route_id: number; going_north: boolean; price: number };
  fromRo: string; toRo: string; seats: number; nume: string; telefon: string; onChange: (r: ReducereAleasa) => void;
}) {
  const tx = TXT[p.locale];
  const [mod, setMod] = React.useState<"nimic" | "retur" | "student">("nimic");
  const [cod, setCod] = React.useState("");
  const [jeton, setJeton] = React.useState<string | null>(null);
  const [mesaj, setMesaj] = React.useState<string | null>(null);
  const [pret, setPret] = React.useState<number | null>(null);
  const [lucru, setLucru] = React.useState(false);
  const [poze, setPoze] = React.useState<{ carnet: File | null; act: File | null }>({ carnet: null, act: null });
  const [acord, setAcord] = React.useState(false);
  // 547: returul −20% se cumpără «în același moment» (Adaugă retur / pasul 2 de pe bilet); opțiunea manuală apare doar
  // când pagina biletului tur a lăsat codul (în primele 30 de minute după plată).
  const [areCod, setAreCod] = React.useState(false);

  // Codul pus de butonul «Cumpără returul cu −20%» de pe biletul tur (sessionStorage, nu URL: nu ajunge în referrer).
  React.useEffect(() => {
    try {
      const c = sessionStorage.getItem(CHEIE_COD_RETUR);
      if (c && /^[0-9a-f]{64}$/.test(c)) { setCod(c); setMod("retur"); setAreCod(true); }
    } catch { /* stocare blocată */ }
  }, []);

  // Verificarea făcută înainte de căutare (Ion, 10.10: «student» în bară → actele întâi): jetonul din filă intră direct.
  React.useEffect(() => {
    if (p.faraStudent) return;
    const st = citesteStudent();
    if (st) { setMod("student"); setJeton(st.jeton); }
  }, [p.faraStudent]);
  const ceruta = React.useRef("");
  React.useEffect(() => {
    if (mod !== "student" || !jeton || p.seats !== 1 || !p.nume || !p.telefon) return;
    const cheie = `${jeton}|${p.nume}|${p.telefon}|${p.trip.crm_route_id}|${p.trip.trip_date}`;
    if (ceruta.current === cheie) return;
    ceruta.current = cheie;
    void cere({ studentJeton: jeton });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const { onChange } = p;
  React.useEffect(() => {
    if (p.faraStudent && mod === "student") { setMod("nimic"); setJeton(null); setPret(null); setMesaj(null); }
  }, [p.faraStudent, mod]);
  React.useEffect(() => {
    const activ = mod === "retur" ? (pret != null ? cod : null) : null;
    const st = mod === "student" && p.seats === 1 ? jeton : null;
    onChange({ pret: (activ || st) ? pret : null, codRetur: activ, studentJeton: st, blocheazaPlata: lucru });
  }, [mod, pret, cod, jeton, lucru, p.seats, onChange]);

  const cere = React.useCallback(async (a: { codRetur?: string | null; studentJeton?: string | null }) => {
    const r = await pretBilet({
      tripDate: p.trip.trip_date, crmRouteId: p.trip.crm_route_id, goingNorth: p.trip.going_north, fromRo: p.fromRo, toRo: p.toRo,
      seats: p.seats, phone: p.telefon, passengerName: p.nume, ...a,
    }).catch(() => null);
    if (r && r.reducere) { setPret(r.pret); setMesaj(null); return true; }
    setPret(null); setMesaj(r?.mesaj ?? tx.eroare); return false;
  }, [p.trip, p.fromRo, p.toRo, p.seats, p.telefon, p.nume, tx.eroare]);

  // Schimbarea numărului de locuri / a numelui reface cota (codul de retur e legat de persoană și de locuri).
  React.useEffect(() => {
    if (mod === "retur" && cod && p.nume && p.telefon) void cere({ codRetur: cod });
    if (mod === "student" && jeton) { if (p.seats === 1) void cere({ studentJeton: jeton }); else { setPret(null); setMesaj(tx.unLoc); } }
  }, [p.seats]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicaCod = async () => {
    if (!p.nume || !p.telefon) { setMesaj(tx.completeaza); return; }
    setLucru(true); await cere({ codRetur: cod.trim().toLowerCase() }); setLucru(false);
  };

  const verifica = async () => {
    if (!p.nume || !p.telefon) { setMesaj(tx.completeaza); return; }
    if (!poze.carnet || !poze.act || !acord) return;
    setLucru(true); setMesaj(null);
    try {
      const [carnet, act] = await Promise.all([laJpeg(poze.carnet), laJpeg(poze.act)]);
      const r = await fetch("/api/bilete/student", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passengerName: p.nume, phone: p.telefon, carnet, act, consimtamant: true }),
      });
      const j = await r.json().catch(() => null);
      if (j?.verdict === "accept" && typeof j.jeton === "string") {
        setJeton(j.jeton);
        if (p.seats !== 1) { setMesaj(tx.unLoc); setPret(null); } else await cere({ studentJeton: j.jeton });
      } else {
        setJeton(null); setPret(null);
        setMesaj(j?.verdict === "poza_neclara" ? tx.neclar : j?.verdict === "respins" ? tx.respins : j?.verdict === "refuzat" ? tx.refuzat : tx.eroare);
      }
    } catch { setMesaj(tx.neclar); }
    setLucru(false);
  };

  const opt = (v: typeof mod, t: string) => (
    <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44, fontSize: 15, cursor: "pointer" }}>
      <input type="radio" name="promoMod" checked={mod === v} onChange={() => { setMod(v); setPret(null); setMesaj(null); }} style={{ accentColor: RED, width: 20, height: 20, margin: 0 }} />
      {t}
    </label>
  );
  const btn: React.CSSProperties = { minHeight: 44, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${RED}`, background: "#fff", color: RED, fontWeight: 700, fontSize: 15, cursor: "pointer" };
  // Ion, 10.10: «va fi greu de înțeles pentru student care nu înțelege EN, plus șriftul e slab» — butonul nativ al
  // fișierului scrie «Choose File / No file chosen»; acum e un buton al nostru, mare, în limba paginii.
  const fisier = (k: "carnet" | "act", t: string) => (
    <label style={{ position: "relative", display: "grid", gap: 4, padding: "12px 14px", borderRadius: 12, cursor: "pointer",
      border: poze[k] ? "1.5px solid #2B6B3A" : "1.5px dashed #B99AA2", background: poze[k] ? "#F1F8F2" : "#FBF8F8" }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#231A1C" }}>{t}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: poze[k] ? "#2B6B3A" : RED }}>{poze[k] ? `✓ ${tx.refa}` : `📷 ${tx.alege}`}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => setPoze((x) => ({ ...x, [k]: e.target.files?.[0] ?? null }))}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
    </label>
  );

  if (p.faraStudent && !areCod) return null;
  return (
    <fieldset style={{ border: "1.5px solid #E2D6D9", borderRadius: 12, padding: "10px 12px", margin: 0, display: "grid", gap: 4, minWidth: 0 }}>
      <legend style={{ fontSize: 15, fontWeight: 800, padding: "0 6px" }}>{tx.titlu}</legend>
      {opt("nimic", tx.nimic)}
      {areCod && opt("retur", tx.retur)}
      {areCod && mod === "retur" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: 1, minWidth: 180, fontSize: 13, fontWeight: 700, color: "#6B5B5F" }}>{tx.cod}
            <input value={cod} onChange={(e) => { setCod(e.target.value); setPret(null); }} autoComplete="off" spellCheck={false} maxLength={64}
              style={{ width: "100%", height: 44, padding: "0 10px", borderRadius: 10, border: "1.5px solid #E2D6D9", fontSize: 14, boxSizing: "border-box", marginTop: 4, fontFamily: "monospace" }} />
          </label>
          <button type="button" disabled={lucru || !cod} onClick={aplicaCod} style={btn}>{tx.aplica}</button>
        </div>
      )}
      {!p.faraStudent && opt("student", tx.student)}
      {!p.faraStudent && mod === "student" && !jeton && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 15, color: "#231A1C", lineHeight: 1.5 }}>{tx.studentNota}</div>
          {fisier("carnet", tx.carnet)}
          {fisier("act", tx.act)}
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: "#231A1C", lineHeight: 1.45 }}>
            <input type="checkbox" checked={acord} onChange={(e) => setAcord(e.target.checked)} style={{ accentColor: RED, width: 20, height: 20, margin: 0, flexShrink: 0 }} />
            <span>{tx.acord}</span>
          </label>
          <button type="button" disabled={lucru || !poze.carnet || !poze.act || !acord} onClick={verifica} style={btn}>{lucru ? tx.seVerifica : tx.verifica}</button>
        </div>
      )}
      {mod === "student" && jeton && pret != null && <div style={{ fontSize: 14, fontWeight: 700, color: "#2b6b3a" }}>{tx.ok}</div>}
      {pret != null && <div aria-live="polite" style={{ fontSize: 14, fontWeight: 700, color: "#2b6b3a" }}>{tx.pret(pret, p.trip.price)}</div>}
      {mesaj && <div role="status" style={{ fontSize: 14, color: RED, fontWeight: 600 }}>{mesaj}</div>}
    </fieldset>
  );
}
