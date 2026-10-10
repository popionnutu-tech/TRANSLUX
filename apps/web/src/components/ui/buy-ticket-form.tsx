"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TripResult } from "@/app/(public)/actions";
import { cumparaBilet, locuriCursei, type StareComanda } from "@/app/(public)/bilete-actions";
import { citesteInitData } from "@/components/telegram/telegram-webapp";
import { linkHarta } from "@/lib/bilete-reguli";
import { comutaLoc, listaLocuri, potrivesteAlese } from "@/lib/locuri";
import { phoneText } from "@/lib/phone";
import { citesteStudent } from "@/lib/student-sesiune";
import { salveazaCumpararea, type CumparareSalvata } from "@/lib/cumparare-salvata";
import type { ContactPrecompletat } from "@/lib/telegram-client";
import { SeatMap } from "./seat-map";
import { BiletCursa, FOND_LISTA } from "./bilet-cursa";
import { PromoReduceri, type ReducereAleasa } from "./promo-reduceri";
import type { ReturAles } from "./adauga-retur";
import { aplicaReducere, perechePromo } from "@translux/db";

// Formularul «Cumpără bilet» (ION-197): în fereastra rezultatelor, sub cursa aleasă. Cheia de idempotență se
// generează la deschidere — un dublu-clic sau un «înapoi» din bancă nu face două comenzi. Prețul e informativ;
// suma o recalculează panoul.
// ION-242: pe cursele din Chișinău spre nord (going_north) pasagerul își alege locurile pe harta autobuzului.

const RED = "#9B1B30";
/** Cât de des se reîncarcă harta locurilor cât e pe ecran. */
const REINCARCA_HARTA_MS = 30_000;

const TXT = {
  ro: {
    title: "Bilet online", lastName: "Nume", firstName: "Prenume", phone: "Telefon", email: "E-mail (opțional)", seats: "Locuri", total: "Total",
    consent: "Am citit și accept", terms: "condițiile de vânzare", and: "și", policy: "politica de confidențialitate",
    pay: (lei: number) => `Plătește ${lei} lei cu cardul`, paying: "Se deschide pagina băncii…", cancel: "Renunță",
    note: "După plată primești biletul cu cod QR. Îl arăți șoferului la urcare.",
    retur: "Returnarea se cere doar prin Telegram: peste 24 h primești tot, sub 4 h nu se returnează.", grila: "Condițiile",
    unde: "Unde urci în autobuz", urcare: "Urci la", harta: "Harta", loc: (n: number) => (n === 1 ? "1 loc" : `${n} locuri`),
    alegeLoc: "Alege locul în autobuz", contor: (a: number, n: number) => `ai ales ${a} din ${n}`,
    pas1: "Locul", pas2: "Datele și plata", continua: "Continuă", schimba: "schimbă", alegeIar: "Locul ales s-a ocupat — alege altul",
    hartaIncarca: "Se încarcă locurile…", hartaIndisponibila: "Locurile se aleg la urcare.", locurile: "Locurile", locul: "Locul",
    cateBilete: "Câte bilete", maiPutine: "Mai puține bilete", maiMulte: "Mai multe bilete", telNota: "Șoferul te sună pe acest număr dacă e nevoie.", returScurt: "Returnare doar prin Telegram: peste 24 h primești tot, sub 4 h nimic.",
  },
  ru: {
    title: "Онлайн-билет", lastName: "Фамилия", firstName: "Имя", phone: "Телефон", email: "E-mail (необязательно)", seats: "Мест", total: "Итого",
    consent: "Я прочитал(а) и принимаю", terms: "условия продажи", and: "и", policy: "политику конфиденциальности",
    pay: (lei: number) => `Оплатить ${lei} лей картой`, paying: "Открываем страницу банка…", cancel: "Отмена",
    note: "После оплаты вы получите билет с QR-кодом. Покажите его водителю при посадке.",
    retur: "Возврат — только через Telegram: более чем за 24 ч — полностью, менее чем за 4 ч — не возвращается.", grila: "Условия",
    unde: "Где вы сядете в автобус", urcare: "Посадка", harta: "Карта", loc: (n: number) => (n === 1 ? "1 место" : `${n} места`),
    alegeLoc: "Выберите место в автобусе", contor: (a: number, n: number) => `выбрано ${a} из ${n}`,
    pas1: "Место", pas2: "Данные и оплата", continua: "Продолжить", schimba: "изменить", alegeIar: "Выбранное место заняли — выберите другое",
    hartaIncarca: "Загружаем места…", hartaIndisponibila: "Места выбираются при посадке.", locurile: "Места", locul: "Место",
    cateBilete: "Сколько билетов", maiPutine: "Меньше билетов", maiMulte: "Больше билетов", telNota: "Водитель позвонит на этот номер, если нужно.", returScurt: "Возврат только через Telegram: за 24 ч — полностью, менее 4 ч — нет.",
  },
} as const;

function uuid(): string {
  try { return crypto.randomUUID(); } catch {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

function Trimite({ locale, lei, blocat }: { locale: "ro" | "ru"; lei: number; blocat: boolean }) {
  const { pending } = useFormStatus();
  // Blocat după prima apăsare: un dublu-tap nu face a doua comandă (cheia de idempotență o oprește oricum).
  // ION-242: blocat și cât nu-s alese toate locurile pe hartă.
  const oprit = pending || blocat;
  return (
    <button type="submit" disabled={oprit} style={{
      minHeight: 54, padding: "0 14px", borderRadius: 12, border: "none", background: oprit ? "#c9a0a8" : RED,
      color: "#fff", fontWeight: 700, fontSize: 17, cursor: oprit ? "default" : "pointer",
    }}>{pending ? TXT[locale].paying : TXT[locale].pay(lei)}</button>
  );
}

/** Harta în formular: cât se trimite comanda nu se mai atinge (useFormStatus merge doar în interiorul formularului). */
function HartaInFormular(p: { ocupate: readonly number[]; alese: readonly number[]; onToggle: (nr: number) => void; locale: "ro" | "ru"; mic?: boolean }) {
  const { pending } = useFormStatus();
  return <SeatMap {...p} blocat={pending} />;
}

function ziuaSiOra(tripDate: string, time: string, locale: "ro" | "ru", scurt = false): string {
  const t = new Date(`${tripDate}T12:00:00Z`);
  const fel = scurt ? "short" : "long";
  const zi = t.toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: fel, day: "numeric", month: fel, timeZone: "UTC" });
  return `${zi}, ${time}`;
}

type Harta = { stare: "incarca" | "ok" | "indisponibila"; ocupate: number[] };

/** Câmpurile de la deschidere: goale pe site, precompletate în mini app-ul Telegram (ION-249, telefonul în forma +373). */
function campuriInitiale(contact: ContactPrecompletat | null) {
  if (contact) return { lastName: contact.nume ?? "", firstName: contact.prenume ?? "", phone: phoneText(contact.telefon), email: contact.email ?? "" };
  // Studentul verificat înainte de căutare: numele și telefonul de la verificare (jetonul e legat de ele).
  const st = typeof window !== "undefined" ? citesteStudent() : null;
  return { lastName: st?.nume ?? "", firstName: st?.prenume ?? "", phone: st?.telefon ?? "", email: "" };
}

export function BuyTicketForm({ trip, fromRo, toRo, locale, onCancel, contact = null, returFix = null, reluare = null, from = "", to = "" }: {
  trip: TripResult; fromRo: string; toRo: string; locale: "ro" | "ru"; onCancel: () => void; contact?: ContactPrecompletat | null;
  /** Cumpărarea reluată după o plată eșuată: alegerea de dinainte, direct la pasul plății. */
  reluare?: CumparareSalvata | null; from?: string; to?: string;
  /** Tur-retur ales pe pași (bara de căutare → tur → retur): cursa de retur, plătită în aceeași sesiune. */
  returFix?: TripResult | null;
}) {
  const tx = TXT[locale];
  const [key, setKey] = React.useState(uuid);
  const [seats, setSeats] = React.useState(reluare?.seats ?? 1);
  const [punct, setPunct] = React.useState<number | null>(reluare?.punct ?? null);
  // Cheile încercărilor de dinainte (plată eșuată): serverul le expiră dacă banca n-a încasat nimic.
  const [cheiVechi, setCheiVechi] = React.useState<string[]>(reluare?.chei ?? []);
  const ales = trip.puncte?.find((p) => p.id === punct) ?? null;
  // Câmpurile de text sunt controlate: React resetează formularul după fiecare răspuns al acțiunii, iar la o eroare
  // («loc_ocupat», banca nu răspunde) omul nu trebuie să scrie din nou numele și telefonul.
  const [camp, setCamp] = React.useState(() => reluare?.camp ?? campuriInitiale(contact));
  const [consent, setConsent] = React.useState(false);
  const scrie = (k: keyof typeof camp) => (e: React.ChangeEvent<HTMLInputElement>) => setCamp((c) => ({ ...c, [k]: e.target.value }));
  const [stare, action] = useActionState<StareComanda, FormData>(cumparaBilet, {});
  const [tgInitData, setTgInitData] = React.useState("");
  React.useEffect(() => { setTgInitData(citesteInitData()); }, []);

  // ION-242: harta locurilor, doar spre nord. «incarca» la deschidere; «indisponibila» = panoul n-a răspuns → se
  // cumpără fără alegere (nu blocăm vânzarea). Se reîncarcă la schimbarea numărului de bilete, la fiecare 30 s cât
  // e pe ecran și după «loc_ocupat».
  const alegeLocuri = trip.going_north === true;
  const [harta, setHarta] = React.useState<Harta>({ stare: "incarca", ocupate: [] });
  const [alese, setAlese] = React.useState<number[]>(reluare?.alese ?? []);
  const [reincarca, setReincarca] = React.useState(0);
  const { crm_route_id: rutaId, trip_date: ziua } = trip;

  React.useEffect(() => {
    if (!alegeLocuri) return;
    let viu = true;
    const incarca = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const r = await locuriCursei(rutaId, ziua, true).catch(() => null);
      if (!viu) return;
      if (!r) { setHarta((h) => (h.stare === "ok" ? h : { stare: "indisponibila", ocupate: [] })); return; }
      setHarta({ stare: "ok", ocupate: r.ocupate });
      setAlese((a) => potrivesteAlese(a, seats, r.ocupate).alese);
    };
    void incarca();
    const t = setInterval(incarca, REINCARCA_HARTA_MS);
    return () => { viu = false; clearInterval(t); };
  }, [alegeLocuri, rutaId, ziua, seats, reincarca]);

  // Răspunsul «loc_ocupat»: locurile luate devin gri imediat, cad din alegere, harta se reîncarcă.
  React.useEffect(() => {
    if (!stare.ocupate?.length) return;
    const luate = stare.ocupate;
    setHarta((h) => ({ ...h, ocupate: [...new Set([...h.ocupate, ...luate])].sort((x, y) => x - y) }));
    setAlese((a) => potrivesteAlese(a, seats, luate).alese);
    setReincarca((n) => n + 1);
    // Doar la un răspuns nou al acțiunii (nr crește la fiecare), nu la schimbarea lui seats.
  }, [stare.nr]); // eslint-disable-line react-hooks/exhaustive-deps

  const schimbaSeats = (n: number) => {
    setSeats(n);
    setAlese((a) => potrivesteAlese(a, n, harta.ocupate).alese);
  };
  const atingeLoc = (nr: number) => setAlese((a) => comutaLoc(a, nr, seats, harta.ocupate));
  const hartaActiva = alegeLocuri && harta.stare === "ok";
  // Promoțiile Bălți ⇄ Chișinău (546): panoul «Reduceri» doar pe pereche; prețul arătat vine din panou.
  const arePromo = perechePromo(fromRo, toRo);
  const [reducere, setReducere] = React.useState<ReducereAleasa>({ pret: null, codRetur: null, studentJeton: null, blocheazaPlata: false });
  const pretLoc = reducere.pret ?? trip.price;
  const numeComplet = `${camp.lastName.trim()} ${camp.firstName.trim()}`.trim();
  // 547: returul ales acum se plătește imediat după tur (pagina biletului); planul stă în sessionStorage.
  const pretRetur = returFix ? aplicaReducere(returFix.price, 20) : null;
  const retur: ReturAles | null = returFix && pretRetur != null ? { trip: returFix, pret: pretRetur } : null;
  // Harta locurilor la retur, când returul pleacă din Chișinău (spre nord).
  const hartaRetur = returFix?.going_north === true;
  const [hr, setHr] = React.useState<Harta>({ stare: "incarca", ocupate: [] });
  const [aleseRetur, setAleseRetur] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (!hartaRetur || !returFix) return;
    let viu = true;
    const incarca = async () => {
      const r = await locuriCursei(returFix.crm_route_id, returFix.trip_date, true).catch(() => null);
      if (!viu) return;
      if (!r) { setHr((h) => (h.stare === "ok" ? h : { stare: "indisponibila", ocupate: [] })); return; }
      setHr({ stare: "ok", ocupate: r.ocupate });
      setAleseRetur((a) => potrivesteAlese(a, seats, r.ocupate).alese);
    };
    void incarca();
    const t = setInterval(incarca, REINCARCA_HARTA_MS);
    return () => { viu = false; clearInterval(t); };
  }, [hartaRetur, returFix, seats]);
  const hartaReturActiva = hartaRetur && hr.stare === "ok";
  const locuriReturIncomplete = hartaReturActiva && aleseRetur.length !== seats;
  const [cheieRetur, setCheieRetur] = React.useState(uuid);
  // Altă alegere de retur = altă comandă (altă sumă la bancă): chei noi, ca o încercare veche să nu fie refolosită.
  const alegereRetur = retur ? `${retur.trip.trip_date}|${retur.trip.crm_route_id}|${retur.trip.time}` : "";
  const primaAlegere = React.useRef(true);
  React.useEffect(() => {
    if (primaAlegere.current) { primaAlegere.current = false; return; }
    setKey(uuid()); setCheieRetur(uuid());
  }, [alegereRetur]);

  const locuriIncomplete = hartaActiva && alese.length !== seats;
  // Doi pași, ca la tur-retur (Ion, 10.10.2026: «fă fix cum la tur-retur aici, împarte în 2 pași»): întâi locul pe harta
  // mică, apoi datele și plata. Doar când cursa are hartă (din Chișinău) și nu e tur-retur din formular.
  const doiPasi = alegeLocuri && !retur;
  const [locGata, setLocGata] = React.useState(reluare != null);
  const pasLoc = doiPasi && !locGata;
  const poateContinua = harta.stare === "indisponibila" || (harta.stare === "ok" && alese.length === seats);
  React.useEffect(() => { if (stare.ocupate?.length) setLocGata(false); }, [stare.nr]); // eslint-disable-line react-hooks/exhaustive-deps

  const inp: React.CSSProperties = {
    width: "100%", height: doiPasi ? 44 : 48, padding: "0 12px", borderRadius: 12, border: "1.5px solid #E2D6D9", fontSize: 16, boxSizing: "border-box",
    marginTop: 4, fontFamily: "inherit", background: "#fff",
  };
  const lbl: React.CSSProperties = { fontSize: 13, color: "#6B5B5F", fontWeight: 700, minWidth: 0 };
  const pas = (oprit: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 12, border: "1.5px solid #E2D6D9", background: "#fff", fontSize: 20, fontWeight: 700,
    color: oprit ? "#C9BCBF" : "#231A1C", cursor: oprit ? "default" : "pointer",
  });

  return (
    <form action={(fd) => {
      // Alegerea rămâne în filă cât omul e la bancă; o plată eșuată o redeschide cu «Reia plata».
      if (!retur) {
        salveazaCumpararea({ tip: "simplu", from, to, fromRo, toRo, trip, retur: null, seats, alese, aleseRetur: [], punct, camp, chei: [...cheiVechi.filter((k) => k !== key), key] });
        setCheiVechi((v) => [...v.filter((k) => k !== key), key].slice(-4));
      }
      return action(fd);
    }} className={`cump-grid${doiPasi && !pasLoc ? " cump-unu" : ""}`}>
      {cheiVechi.filter((k) => k !== key).map((k) => <input key={k} type="hidden" name="inlocuieste" value={k} />)}
      {/* Pagina de cumpărare (Ion, 09.10.2026, varianta 1B): stânga — biletul ales și microbuzul; dreapta — datele și
          plata. Pe telefon totul unul sub altul, cu butonul de plată lipit jos. */}
      <style>{`
        .cump-grid { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); }
        .cump-stanga { padding: 20px; background: ${FOND_LISTA}; border-right: 1px solid #F0E6E8; display: grid; gap: 16px; align-content: start; min-width: 0; }
        .cump-dreapta { padding: 20px 22px; background: #fff; display: grid; gap: 14px; align-content: start; min-width: 0; }
        .cump-pasi { grid-column: 1 / -1; display: flex; gap: 18px; padding: 10px 16px; font-size: 13.5px; font-weight: 700; color: #8A7A7D; border-bottom: 1px solid #F0E6E8; background: #fff; }
        .cump-pasi span { display: flex; align-items: center; gap: 7px; }
        .cump-pasi span.on { color: #231A1C; }
        .cump-pasi b { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; background: #F1E8EA; color: #8A7A7D; }
        .cump-pasi span.on b { background: ${RED}; color: #fff; }
        .cump-loc { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; padding: 10px 16px 12px; max-width: 560px; width: 100%; margin: 0 auto; box-sizing: border-box; background: ${FOND_LISTA}; }
        .cump-linie { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 15px; min-height: 36px; }
        .cump-linie s { color: #8A7A7D; font-size: 13px; }
        .cump-continua { position: sticky; bottom: 10px; min-height: 54px; border: none; border-radius: 14px; background: ${RED}; color: #fff; font: 800 17px inherit; font-family: inherit; cursor: pointer; box-shadow: 0 10px 22px rgba(155,27,48,.22); }
        .cump-continua:disabled { background: #E9DFE1; color: #A8979B; box-shadow: none; cursor: default; }
        .cump-rezumat { display: grid; gap: 2px; padding: 10px 14px; border-radius: 14px; background: #fff; border: 1px solid #EFE3E6; }
        .cump-schimba { border: none; background: none; padding: 6px 0; color: ${RED}; font: 700 14px inherit; font-family: inherit; cursor: pointer; }
        .cump-plata { position: sticky; bottom: 0; background: #fff; padding: 12px 0 4px; display: grid; gap: 8px; border-top: 1px dashed #E3D3D6; }
        .cump-unu { grid-template-columns: minmax(0, 560px); justify-content: center; }
        .cump-unu .cump-dreapta { gap: 10px; padding: 12px 16px 0; }
        .cump-mic { font-size: 12px; font-weight: 400; color: #8A7A7D; line-height: 1.4; }
        @media (max-width: 760px) {
          .cump-grid { grid-template-columns: 1fr; }
          .cump-stanga { border-right: none; padding: 14px; }
          .cump-dreapta { padding: 16px 14px 0; }
        }
      `}</style>
      {/* ION-249: în mini app-ul Telegram comanda se leagă de cont la cumpărare (panoul verifică initData). */}
      {tgInitData && <input type="hidden" name="tgInitData" value={tgInitData} />}
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="crmRouteId" value={trip.crm_route_id} />
      <input type="hidden" name="goingNorth" value={String(trip.going_north)} />
      <input type="hidden" name="tripDate" value={trip.trip_date} />
      <input type="hidden" name="fromRo" value={fromRo} />
      <input type="hidden" name="toRo" value={toRo} />
      <input type="hidden" name="seats" value={seats} />
      {/* Locurile alese (ION-242): câmpul există doar când harta a răspuns; fără el panoul dă locul la emitere. */}
      {hartaActiva && <input type="hidden" name="locuriAlese" value={JSON.stringify(alese)} />}
      {reducere.codRetur && <input type="hidden" name="codRetur" value={reducere.codRetur} />}
      {reducere.studentJeton && <input type="hidden" name="studentJeton" value={reducere.studentJeton} />}
      {/* 548: tur-returul se plătește o dată cu turul (aceeași sesiune la bancă). */}
      {retur && <>
        <input type="hidden" name="returTripDate" value={retur.trip.trip_date} />
        <input type="hidden" name="returCrmRouteId" value={retur.trip.crm_route_id} />
        <input type="hidden" name="returGoingNorth" value={String(retur.trip.going_north)} />
        <input type="hidden" name="returFromRo" value={toRo} />
        <input type="hidden" name="returToRo" value={fromRo} />
        <input type="hidden" name="returKey" value={cheieRetur} />
        {hartaReturActiva && <input type="hidden" name="returLocuri" value={JSON.stringify(aleseRetur)} />}
      </>}
      {/* capcana pentru roboți: invizibilă pentru oameni */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />

      {doiPasi && (
        <div className="cump-pasi" aria-label={pasLoc ? tx.pas1 : tx.pas2}>
          <span className="on"><b>{pasLoc ? 1 : "✓"}</b>{tx.pas1}</span><span className={pasLoc ? "" : "on"}><b>2</b>{tx.pas2}</span>
        </div>
      )}
      {pasLoc && (
        <div className="cump-loc">
          <div className="cump-linie">
            <span><b>{trip.time}</b> → {trip.arrivalTime} · {trip.originalPrice != null && trip.originalPrice > trip.price && <s>{trip.originalPrice}</s>} {trip.price} lei</span>
          </div>
          <div className="cump-linie">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" aria-label={tx.maiPutine} disabled={seats <= 1} onClick={() => schimbaSeats(Math.max(1, seats - 1))} style={{ ...pas(seats <= 1), width: 38, height: 38 }}>&minus;</button>
              <span aria-live="polite" style={{ fontSize: 15, fontWeight: 800 }}>{tx.loc(seats)}</span>
              <button type="button" aria-label={tx.maiMulte} disabled={seats >= 4} onClick={() => schimbaSeats(Math.min(4, seats + 1))} style={{ ...pas(seats >= 4), width: 38, height: 38 }}>+</button>
            </div>
            {harta.stare === "ok" && <em style={{ fontStyle: "normal", fontSize: 14, fontWeight: 800, color: alese.length === seats ? "#2b6b3a" : RED }} aria-live="polite">{alese.length ? listaLocuri(alese) : tx.contor(0, seats)}</em>}
          </div>
          {harta.stare === "incarca" && <div style={{ fontSize: 14, color: "#666" }}>{tx.hartaIncarca}</div>}
          {harta.stare === "indisponibila" && <div style={{ fontSize: 14, color: "#555", padding: "10px 12px", borderRadius: 12, background: "#fff" }}>{tx.hartaIndisponibila}</div>}
          {harta.stare === "ok" && <HartaInFormular mic ocupate={harta.ocupate} alese={alese} onToggle={atingeLoc} locale={locale} />}
          <button type="button" className="cump-continua" disabled={!poateContinua} onClick={() => setLocGata(true)}>{tx.continua} →</button>
        </div>
      )}
      {!pasLoc && <>
      {/* Pasul 2 (Ion, 10.10.2026: «totul să fie în o pagină fără scroll»): fără coloana din stânga — cursa, locul și
          «schimbă» stau în rezumatul de lângă butonul de plată. */}
      {!doiPasi && <div className="cump-stanga">
        <BiletCursa trip={trip} locale={locale} cotor="ales" fond={FOND_LISTA} />
        {/* Harta microbuzului (ION-242), doar la plecarea din Chișinău spre nord; pe tur locul se dă automat. */}
        {alegeLocuri && !doiPasi && (
          <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8, minWidth: 0 }}>
            <legend style={{ width: "100%", padding: 0, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#231A1C" }}>{tx.alegeLoc}</span>
              {harta.stare === "ok" && <span aria-live="polite" style={{ fontSize: 13, fontWeight: 700, color: locuriIncomplete ? RED : "#2b6b3a" }}>{tx.contor(alese.length, seats)}</span>}
            </legend>
            {harta.stare === "incarca" && <div style={{ fontSize: 14, color: "#666" }}>{tx.hartaIncarca}</div>}
            {harta.stare === "indisponibila" && <div style={{ fontSize: 14, color: "#555", padding: "10px 12px", borderRadius: 12, background: "#fff" }}>{tx.hartaIndisponibila}</div>}
            {harta.stare === "ok" && <HartaInFormular ocupate={harta.ocupate} alese={alese} onToggle={atingeLoc} locale={locale} />}
          </fieldset>
        )}
        {/* Tur-retur: rezumatul returului și, dacă pleacă din Chișinău, harta lui. */}
        {retur && (
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#231A1C" }}>{locale === "ru" ? "Обратно" : "Retur"} · {toRo} → {fromRo}</div>
            <BiletCursa trip={{ ...retur.trip, originalPrice: retur.trip.price, price: retur.pret }} locale={locale} cotor="ales" fond={FOND_LISTA} />
            {hartaRetur && (
              <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 8, minWidth: 0 }}>
                <legend style={{ width: "100%", padding: 0, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#231A1C" }}>{locale === "ru" ? "Место на обратном рейсе" : "Locul la retur"}</span>
                  {hr.stare === "ok" && <span style={{ fontSize: 13, fontWeight: 700, color: locuriReturIncomplete ? RED : "#2b6b3a" }}>{tx.contor(aleseRetur.length, seats)}</span>}
                </legend>
                {hr.stare === "incarca" && <div style={{ fontSize: 14, color: "#666" }}>{tx.hartaIncarca}</div>}
                {hr.stare === "indisponibila" && <div style={{ fontSize: 14, color: "#555", padding: "10px 12px", borderRadius: 12, background: "#fff" }}>{tx.hartaIndisponibila}</div>}
                {hr.stare === "ok" && <HartaInFormular ocupate={hr.ocupate} alese={aleseRetur} onToggle={(nr) => setAleseRetur((a) => comutaLoc(a, nr, seats, hr.ocupate))} locale={locale} />}
              </fieldset>
            )}
          </div>
        )}
      </div>}

      <div className="cump-dreapta">
        {!doiPasi && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{tx.cateBilete}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" aria-label={tx.maiPutine} disabled={seats <= 1} onClick={() => schimbaSeats(Math.max(1, seats - 1))} style={pas(seats <= 1)}>&minus;</button>
            <span aria-live="polite" style={{ minWidth: 24, textAlign: "center", fontSize: 19, fontWeight: 800 }}>{seats}</span>
            <button type="button" aria-label={tx.maiMulte} disabled={seats >= 4} onClick={() => schimbaSeats(Math.min(4, seats + 1))} style={pas(seats >= 4)}>+</button>
          </div>
        </div>}
        {doiPasi && locuriIncomplete && <button type="button" className="cump-schimba" style={{ textAlign: "left", fontSize: 15 }} onClick={() => setLocGata(false)}>{tx.alegeIar} ↑</button>}
        {/* Punctul de urcare (ION-198): 2–3 puncte → alegere obligatorie; unul sau niciunul → nimic. */}
        {(trip.puncte?.length ?? 0) >= 2 && (
          <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 6, minWidth: 0 }}>
            <input type="hidden" name="punctObligatoriu" value="1" />
            <legend style={{ ...lbl, padding: 0, marginBottom: 6 }}>{tx.unde}</legend>
            {trip.puncte.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 8, minWidth: 0 }}>
                {/* Harta e buton separat, ca alegerea locului să nu deschidă Google Maps din greșeală. */}
                <label style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minHeight: 50, padding: "0 12px", borderRadius: 12, border: punct === p.id ? `2px solid ${RED}` : "1.5px solid #E2D6D9", background: "#fff", fontSize: 15, fontWeight: 600, color: "#222", minWidth: 0, cursor: "pointer" }}>
                  <input type="radio" name="punctUrcareId" value={p.id} required checked={punct === p.id} onChange={() => setPunct(p.id)} style={{ accentColor: RED, width: 22, height: 22, margin: 0, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{locale === "ru" ? p.nume_ru : p.nume_ro}</span>
                </label>
                <a href={linkHarta(p)} target="_blank" rel="noopener noreferrer" aria-label={`${tx.harta}: ${locale === "ru" ? p.nume_ru : p.nume_ro}`} style={{ width: 50, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1.5px solid #E2D6D9", background: "#fff", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                </a>
              </div>
            ))}
          </fieldset>
        )}
        {/* Numele și prenumele în două câmpuri (Ion, 03.10); pe telefonul îngust se așază unul sub altul. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          <label style={lbl}>{tx.lastName}
            <input id="bilet-nume" name="lastName" required minLength={2} maxLength={40} autoComplete="family-name" value={camp.lastName} onChange={scrie("lastName")} style={inp} />
          </label>
          <label style={lbl}>{tx.firstName}
            <input id="bilet-prenume" name="firstName" required minLength={2} maxLength={40} autoComplete="given-name" value={camp.firstName} onChange={scrie("firstName")} style={inp} />
          </label>
        </div>
        {(() => {
          const tel = <label style={lbl}>{tx.phone}
            <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="+373 69 123 456" value={camp.phone} onChange={scrie("phone")} style={inp} />
            {!doiPasi && <span className="cump-mic" style={{ display: "block", marginTop: 4 }}>{tx.telNota}</span>}
          </label>;
          const mail = <label style={lbl}>{tx.email}
            <input id="bilet-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={120} placeholder={doiPasi ? "nume@mail.md" : "nume@exemplu.md"} value={camp.email} onChange={scrie("email")} style={inp} />
          </label>;
          if (!doiPasi) return <>{tel}{mail}</>;
          return <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>{tel}{mail}</div>
            <span className="cump-mic">{tx.telNota}</span>
          </div>;
        })()}
        {arePromo && <PromoReduceri fundal faraStudent={Boolean(retur)} locale={locale} trip={trip} fromRo={fromRo} toRo={toRo} seats={seats} nume={numeComplet} telefon={camp.phone} onChange={setReducere} />}
        {!doiPasi && <div style={{ padding: "10px 12px", borderRadius: 12, background: "#eef6fb", border: "1px solid #b9d7ea", fontSize: 13, color: "#1f3a4d", lineHeight: 1.45 }}>
          {tx.retur}{" "}<a href={`/${locale}/conditii-vanzare`} target="_blank" rel="noopener" style={{ color: "#1b6f9a", fontWeight: 600 }}>{tx.grila}</a>
        </div>}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#4A3E41", minHeight: 44 }}>
          <input type="checkbox" name="consent" required checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ accentColor: RED, width: 22, height: 22, margin: "1px 0 0", flexShrink: 0 }} />
          {/* ION-208: acceptarea condițiilor de vânzare (HG 854/2006) și a politicii, la cumpărare. */}
          <span>{tx.consent}{" "}<a href={`/${locale}/conditii-vanzare`} target="_blank" rel="noopener" style={{ color: RED }}>{tx.terms}</a>{" "}{tx.and}{" "}<a href={`/${locale}/confidentialitate`} target="_blank" rel="noopener" style={{ color: RED }}>{tx.policy}</a></span>
        </label>
        {doiPasi && <div className="cump-mic" style={{ marginTop: -6 }}>{tx.returScurt}</div>}
        {retur && <div style={{ fontSize: 13, color: "#4A3E41", lineHeight: 1.45, marginTop: -4 }}>{locale === "ru" ? "Туда-обратно отменяется только вместе, до отправления рейса туда." : "Tur-returul se anulează doar împreună, până la plecarea cursei tur."}</div>}
        {stare.eroare && <div role="alert" style={{ fontSize: 15, color: RED, fontWeight: 600 }}>{stare.eroare}</div>}
        <div className="cump-plata">
          {/* Rezumatul dinaintea plății (ION-238): ziua, ora, unde urci, locurile, suma. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 14, color: "#6B5B5F", lineHeight: 1.35 }}>
              {ziuaSiOra(trip.trip_date, trip.time, locale, doiPasi)}{doiPasi && trip.arrivalTime && <> → {trip.arrivalTime}</>}
              {ales && <> · {locale === "ru" ? ales.nume_ru : ales.nume_ro}</>}
              <br />{tx.loc(seats)}{hartaActiva && alese.length > 0 && <> · {alese.length === 1 ? tx.locul : tx.locurile} <b style={{ color: "#231A1C" }}>{listaLocuri(alese)}</b></>}
              {doiPasi && <> · <button type="button" className="cump-schimba" style={{ padding: 0, fontSize: 14 }} onClick={() => setLocGata(false)}>{tx.schimba}</button></>}
            </span>
            <span style={{ fontSize: 24, fontWeight: 800, whiteSpace: "nowrap" }}>{reducere.pret != null && <s style={{ fontSize: 15, fontWeight: 600, color: "#8A7A7D", marginRight: 6 }}>{trip.price * seats}</s>}{pretLoc * seats + (retur ? retur.pret * seats : 0)} lei</span>
          </div>
          {retur && <div style={{ fontSize: 13, color: "#2b6b3a", fontWeight: 700 }}>{locale === "ru" ? `Туда ${pretLoc * seats} + обратно ${retur.pret * seats} лей (${retur.trip.trip_date.split("-").reverse().join(".")}, ${retur.trip.time}) — одна оплата` : `Tur ${pretLoc * seats} + retur ${retur.pret * seats} lei (${retur.trip.trip_date.split("-").reverse().join(".")}, ${retur.trip.time}) — o singură plată`}</div>}
          <Trimite locale={locale} lei={pretLoc * seats + (retur ? retur.pret * seats : 0)} blocat={locuriIncomplete || locuriReturIncomplete || reducere.blocheazaPlata} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#8A7A7D" }}>{tx.note}</span>
            {!doiPasi && <button type="button" onClick={onCancel} style={{ minHeight: 44, padding: "0 6px", border: "none", background: "none", color: "#6B5B5F", fontSize: 14, cursor: "pointer" }}>{tx.cancel}</button>}
          </div>
        </div>
      </div>
      </>}
    </form>
  );
}
