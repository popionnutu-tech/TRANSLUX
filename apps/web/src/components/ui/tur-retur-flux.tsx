"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cautaCurse, type RezultatCautare, type TripResult } from "@/app/(public)/actions";
import { cumparaBilet, type StareComanda } from "@/app/(public)/bilete-actions";
import { incarcaLocuri, preconecteazaBanca, procentReturBrowser } from "@/lib/bilete-browser";
import { citesteInitData } from "@/components/telegram/telegram-webapp";
import { comutaLoc, listaLocuri, potrivesteAlese } from "@/lib/locuri";
import { phoneText } from "@/lib/phone";
import type { ContactPrecompletat } from "@/lib/telegram-client";
import { curseReturPotrivite, pasageriText, politicaChei, rezumatTurRetur } from "@/lib/tur-retur";
import { BiletCursa } from "./bilet-cursa";
import { MiniCalendar } from "./mini-calendar";
import { SeatMap } from "./seat-map";
import { salveazaCumpararea, type CumparareSalvata } from "@/lib/cumparare-salvata";

// Tur-retur Bălți ⇄ Chișinău în 3 pași (Ion, 10.10.2026: «întâi alege ruta de pe tur și vede clar data sus, apoi alege
// cursa pe retur și vede data clar sus, apoi locul din Chișinău»; «gândește-te tot acest proces să fie ușor pentru client
// și intuitiv»; «ok aplică, dar totul într-o stilistică elegantă»). Planul: docs/plans/2026-10-10-tur-retur-ux-simplu.md
// (3 runde Claude + Codex). O singură plată (migr. 548); o încercare eșuată se înlocuiește cu cheia ei (migr. 550).

const RED = "#9B1B30";
const REINCARCA_HARTA_MS = 30_000;

const TXT = {
  ro: {
    titlu: "Tur-retur", pas: (n: number) => `${n} / 3`, tur: "Tur", retur: "Retur", locPlata: "Plata", locNr: (l: string) => `loc ${l}`, laUrcare: "locul la urcare",
    locTur: "Locul la tur", locRetur: "Locul la retur", continua: "Continuă", returAles: "Retur ales", locAuto: "Locul se dă la urcare (cursa nu pleacă din Chișinău).",
    turAles: "Tur ales", schimba: "schimbă", cautaRetur: "Se caută cursele de retur…",
    zigoala: "În ziua aceasta nu sunt curse de retur cu bilet online.", altaZi: "Alege altă zi de întoarcere",
    limita: "Prea multe căutări într-un timp scurt. Încearcă peste câteva minute.", indisponibil: "Cursele nu se pot încărca acum. Încearcă din nou.",
    reincearca: "Încearcă din nou", cand: "Când te întorci?", locLa: (s: string) => `Locul la ${s}`, alese: (a: number, n: number) => `${a} din ${n}`,
    hartaInc: "Se încarcă locurile…", hartaNu: "Locul se dă la urcare.", pasageri: "Pasageri",
    nume: "Nume", prenume: "Prenume", telefon: "Telefon", email: "E-mail (opțional)", telNota: "Șoferul te sună pe acest număr dacă e nevoie.",
    regula: "Tur-returul se anulează doar împreună, până la plecarea cursei tur.",
    acord: "Am citit și accept", conditii: "condițiile de vânzare", si: "și", politica: "politica de confidențialitate",
    platesti: "O singură plată", total: "Total", plateste: (l: number) => `Plătește ${l} lei cu cardul`, seDeschide: "Se deschide pagina băncii…",
    mai: (n: number, unde: string) => `Alege încă ${n === 1 ? "1 loc" : `${n} locuri`} la ${unde} ↑`, faraRed: "Returul nu are reducere la acest preț — alege altă cursă.",
    maiTarziu: "Derulează în jos — curse mai târziu",
    dupa: "După plată primești ambele bilete cu cod QR.", unde: "Unde urci în autobuz",
  },
  ru: {
    titlu: "Туда и обратно", pas: (n: number) => `${n} / 3`, tur: "Туда", retur: "Обратно", locPlata: "Оплата", locNr: (l: string) => `место ${l}`, laUrcare: "место при посадке",
    locTur: "Место туда", locRetur: "Место обратно", continua: "Продолжить", returAles: "Рейс обратно", locAuto: "Место дадут при посадке (рейс не из Кишинёва).",
    turAles: "Рейс туда", schimba: "изменить", cautaRetur: "Ищем обратные рейсы…",
    zigoala: "В этот день нет обратных рейсов с онлайн-билетом.", altaZi: "Выбрать другой день возвращения",
    limita: "Слишком много поисков за короткое время. Попробуйте через несколько минут.", indisponibil: "Рейсы сейчас не загружаются. Попробуйте ещё раз.",
    reincearca: "Попробовать ещё раз", cand: "Когда возвращаетесь?", locLa: (s: string) => `Место: ${s.toLowerCase()}`, alese: (a: number, n: number) => `${a} из ${n}`,
    hartaInc: "Загружаем места…", hartaNu: "Место дадут при посадке.", pasageri: "Пассажиры",
    nume: "Фамилия", prenume: "Имя", telefon: "Телефон", email: "E-mail (необязательно)", telNota: "Водитель позвонит на этот номер, если нужно.",
    regula: "Туда-обратно отменяется только вместе, до отправления рейса туда.",
    acord: "Я прочитал(а) и принимаю", conditii: "условия продажи", si: "и", politica: "политику конфиденциальности",
    platesti: "Одна оплата", total: "Итого", plateste: (l: number) => `Оплатить ${l} лей картой`, seDeschide: "Открываем страницу банка…",
    mai: (n: number, unde: string) => `Выберите ещё ${n} мест${n === 1 ? "о" : "а"}: ${unde.toLowerCase()} ↑`, faraRed: "На этот рейс скидка не применяется — выберите другой.",
    maiTarziu: "Листайте вниз — более поздние рейсы",
    dupa: "После оплаты вы получите оба билета с QR-кодом.", unde: "Где вы сядете в автобус",
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
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function ziLunga(iso: string, locale: "ro" | "ru"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function ziScurta(iso: string, locale: "ro" | "ru"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "ru" ? "ru-RU" : "ro-RO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

type Harta = { stare: "incarca" | "ok" | "indisponibila"; ocupate: number[] };

/** Harta locurilor unei curse din Chișinău (spre nord), reîncărcată la 30 s; null = cursa nu pleacă din Chișinău. */
// La «Reia plata» locurile alese înainte le ține chiar comanda veche (deschisă la bancă): pentru acest om nu sunt ocupate.
function useHarta(trip: TripResult | null, seats: number, setAlese: React.Dispatch<React.SetStateAction<number[]>>, proprii: readonly number[] = FARA): Harta | null {
  const [h, setH] = React.useState<Harta>({ stare: "incarca", ocupate: [] });
  const activ = trip?.going_north === true;
  React.useEffect(() => {
    if (!activ || !trip) return;
    let viu = true;
    setH({ stare: "incarca", ocupate: [] });
    const incarca = async () => {
      if (document.visibilityState === "hidden") return;
      const r = await incarcaLocuri(trip.crm_route_id, trip.trip_date);
      if (!viu) return;
      if (!r) { setH((x) => (x.stare === "ok" ? x : { stare: "indisponibila", ocupate: [] })); return; }
      const ocupate = r.ocupate.filter((x) => !proprii.includes(x));
      setH({ stare: "ok", ocupate });
      setAlese((a) => potrivesteAlese(a, seats, ocupate).alese);
    };
    void incarca();
    const t = setInterval(incarca, REINCARCA_HARTA_MS);
    return () => { viu = false; clearInterval(t); };
  }, [activ, trip, seats, setAlese, proprii]);
  return activ ? h : null;
}

const FARA: readonly number[] = [];

function Trimite({ text, blocat }: { text: string; blocat: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="trf-plata" disabled={pending || blocat}>{pending ? "…" : text}</button>;
}

export function TurReturFlux({ from, to, fromRo, toRo, tripsTur, dataRetur: ziReturInitiala, pasageri: pasageriInitial, locale, onClose, contact = null, reluare = null }: {
  from: string; to: string; fromRo: string; toRo: string; tripsTur: TripResult[]; dataRetur: string; pasageri: number;
  locale: "ro" | "ru"; onClose: () => void; contact?: ContactPrecompletat | null;
  /** Plată eșuată reluată (Ion, 10.10: «am pierdut toți pașii»): turul, returul, locurile și datele de dinainte, la plată. */
  reluare?: CumparareSalvata | null;
}) {
  const tx = TXT[locale];
  const [tur, setTur] = React.useState<TripResult | null>(reluare?.trip ?? null);
  const [retur, setRetur] = React.useState<TripResult | null>(reluare?.retur ?? null);
  const [ziRetur, setZiRetur] = React.useState(ziReturInitiala);
  const [calendar, setCalendar] = React.useState(false);
  const [pasageri, setPasageri] = React.useState(Math.max(1, Math.min(4, reluare?.seats ?? pasageriInitial)));
  const [pct, setPct] = React.useState<number | null>(null);
  const [cache, setCache] = React.useState<Record<string, RezultatCautare>>({});
  const [incarca, setIncarca] = React.useState(false);
  const [camp, setCamp] = React.useState(() => reluare?.camp ?? ({ lastName: contact?.nume ?? "", firstName: contact?.prenume ?? "", phone: contact ? phoneText(contact.telefon) : "", email: contact?.email ?? "" }));
  const [consent, setConsent] = React.useState(false);
  const [punct, setPunct] = React.useState<number | null>(reluare?.punct ?? null);
  const [aleseTur, setAleseTur] = React.useState<number[]>(reluare?.alese ?? []);
  const [aleseRetur, setAleseRetur] = React.useState<number[]>(reluare?.aleseRetur ?? []);
  const [tgInitData, setTgInitData] = React.useState("");
  React.useEffect(() => { setTgInitData(citesteInitData()); }, []);
  // GET-uri din browser, nu acțiuni de server (care merg la coadă înaintea «Plătește»); banca maib preconectată din timp.
  React.useEffect(() => { preconecteazaBanca(); void procentReturBrowser().then(setPct); }, []);

  // Escape: întâi calendarul, apoi un pas înapoi, abia la pasul 1 închide (plan R3).
  // Ion, 10.10.2026: «alegerea locului îndată ce am ales ruta, apoi ruta retur (dacă de la nord — locul automat), apoi
  // datele personale și achitarea». Cursa din Chișinău (going_north) are harta; cea din nord trece direct mai departe.
  const [locTurGata, setLocTurGata] = React.useState(reluare != null);
  const [locReturGata, setLocReturGata] = React.useState(reluare != null);
  const pasLoc: "tur" | "retur" | null = tur && tur.going_north && !locTurGata ? "tur" : tur && retur && retur.going_north && !locReturGata ? "retur" : null;
  const pas: 1 | 2 | 3 = !tur || pasLoc === "tur" ? 1 : !retur || pasLoc === "retur" ? 2 : 3;
  const alegeTur = (t: TripResult | null) => { setTur(t); setLocTurGata(false); };
  const alegeRetur = (t: TripResult | null) => { setRetur(t); setLocReturGata(false); };
  const inapoi = React.useCallback(() => {
    if (pas === 3) { if (retur?.going_north) setLocReturGata(false); else setRetur(null); }
    else if (pas === 2) { if (pasLoc === "retur") setRetur(null); else if (tur?.going_north) setLocTurGata(false); else setTur(null); }
    else if (pasLoc === "tur") setTur(null);
    else onClose();
  }, [pas, pasLoc, tur, retur, onClose]);
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (calendar) setCalendar(false); else inapoi(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [calendar, inapoi]);

  // Pasul 2: o singură căutare pe zi de retur (plan E1/U4); rezultatul rămâne în fereastră.
  const cheieCautare = `${toRo}|${fromRo}|${ziRetur}`;
  const rez = cache[cheieCautare];
  const cauta = React.useCallback(async () => {
    setIncarca(true);
    const r = await cautaCurse(toRo, fromRo, ziRetur).catch((): RezultatCautare => ({ stare: "indisponibil", curse: [] }));
    setCache((c) => ({ ...c, [cheieCautare]: r }));
    setIncarca(false);
  }, [toRo, fromRo, ziRetur, cheieCautare]);
  React.useEffect(() => { if (tur && !rez && !incarca) void cauta(); }, [tur, rez, incarca, cauta]);
  const curseRetur = tur && rez ? curseReturPotrivite(tur, rez.curse) : [];

  // Pasul 3: locurile pe cursele din Chișinău, prețul, cheile.
  const hartaTur = useHarta(tur, pasageri, setAleseTur, reluare?.alese);
  const hartaRetur = useHarta(retur, pasageri, setAleseRetur, reluare?.aleseRetur);
  const rezumat = tur && retur && pct != null ? rezumatTurRetur({ pretTur: tur.price, pretRetur: retur.price, pasageri, pct }) : null;
  const lipsaTur = hartaTur?.stare === "ok" ? pasageri - aleseTur.length : 0;
  const lipsaRetur = hartaRetur?.stare === "ok" ? pasageri - aleseRetur.length : 0;
  const refHartaTur = React.useRef<HTMLDivElement>(null);
  const refHartaRetur = React.useRef<HTMLDivElement>(null);
  const schimbaPasageri = (n: number) => {
    setPasageri(n);
    setAleseTur((a) => potrivesteAlese(a, n, hartaTur?.ocupate ?? []).alese);
    setAleseRetur((a) => potrivesteAlese(a, n, hartaRetur?.ocupate ?? []).alese);
  };

  // Politica cheilor (Codex r2 C4, Claude r3 S1): orice schimbare după o trimitere → chei noi + înlocuirea încercării vechi.
  const [cheieTur, setCheieTur] = React.useState(uuid);
  const [cheieRetur, setCheieRetur] = React.useState(uuid);
  // Toate cheile de tur trimise înainte (cel mult 4): serverul le încearcă pe toate (audit #1).
  const [cheiVechi, setCheiVechi] = React.useState<string[]>(reluare?.chei ?? []);
  const [trimisCu, setTrimisCu] = React.useState<string | null>(null);
  // Alegerea completă, cu locurile și punctul de urcare (audit #3): orice schimbare după o trimitere → chei noi.
  // 564 (N3): și numele, telefonul, e-mailul — panoul compară amprenta întreagă; cheile se schimbă înaintea refuzului.
  const alegere = tur && retur ? [tur.crm_route_id, tur.trip_date, tur.time, retur.crm_route_id, retur.trip_date, retur.time, pasageri,
    [...aleseTur].sort((a, b) => a - b).join(','), [...aleseRetur].sort((a, b) => a - b).join(','), punct ?? '',
    camp.lastName.trim(), camp.firstName.trim(), camp.phone.trim(), camp.email.trim().toLowerCase()].join('|') : "";
  const roteste = React.useCallback(() => {
    setCheiVechi((v) => [...v.filter((k) => k !== cheieTur), cheieTur].slice(-4)); setCheieTur(uuid()); setCheieRetur(uuid()); setTrimisCu(null);
  }, [cheieTur]);
  React.useEffect(() => {
    if (trimisCu && alegere && trimisCu !== alegere && politicaChei({ alegereSchimbata: true }).chei === "noi") roteste();
  }, [alegere, trimisCu, roteste]);
  const [stare, action] = useActionState<StareComanda, FormData>(cumparaBilet, {});
  // Spre banca maib din browser (nu redirect din acțiune): «Înapoi» de pe pagina băncii nu mai strică pagina.
  React.useEffect(() => { if (stare.url) window.location.assign(stare.url); }, [stare.url, stare.nr]);
  React.useEffect(() => {
    const laIntoarcere = (e: PageTransitionEvent) => { if (e.persisted) window.location.reload(); };
    window.addEventListener("pageshow", laIntoarcere);
    return () => window.removeEventListener("pageshow", laIntoarcere);
  }, []);
  React.useEffect(() => {
    if (stare.nr && politicaChei({ alegereSchimbata: false, codEroare: stare.cod ?? null }).chei === "noi") roteste();
  }, [stare.nr]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrie = (k: keyof typeof camp) => (e: React.ChangeEvent<HTMLInputElement>) => setCamp((c) => ({ ...c, [k]: e.target.value }));
  const blocat = lipsaTur > 0 || lipsaRetur > 0 || !rezumat || rezumat.pretRetur == null || Boolean(stare.url);
  const motiv = lipsaTur > 0 ? { t: tx.mai(lipsaTur, tx.tur), du: () => setLocTurGata(false) } : lipsaRetur > 0 ? { t: tx.mai(lipsaRetur, tx.retur), du: () => setLocReturGata(false) } : null;

  // Antet modern, un singur bloc (Ion, 10.10: «foarte arhaic»): sus sensul pasului, dedesubt ziua și pasagerii, apoi o
  // bară subțire de progres în 3 segmente.
  const ziTur = tripsTur[0]?.trip_date ?? tur?.trip_date ?? "";
  // Pe pasul locului eticheta rămâne scurtă (TUR/RETUR), ca ruta să încapă pe telefon; «Locul la tur» trece dedesubt.
  const titlu = pasLoc === "tur" && tur ? { eticheta: tx.tur, ruta: `${from} → ${to}`, sub: `${tx.locTur} · ${ziScurta(tur.trip_date, locale)} · ${tur.time}` }
    : pasLoc === "retur" && retur ? { eticheta: tx.retur, ruta: `${to} → ${from}`, sub: `${tx.locRetur} · ${ziScurta(retur.trip_date, locale)} · ${retur.time}` }
    : pas === 1 ? { eticheta: tx.tur, ruta: `${from} → ${to}`, sub: `${ziLunga(ziTur, locale)} · ${pasageriText(pasageri, locale)}` }
    : pas === 2 ? { eticheta: tx.retur, ruta: `${to} → ${from}`, sub: `${ziLunga(ziRetur, locale)} · −${pct ?? 20}%` }
    : { eticheta: tx.locPlata, ruta: `${from} ⇄ ${to}`, sub: pasageriText(pasageri, locale) };

  const paxRand = (
    <div className="trf-pax">
      <span>{tx.pasageri}</span>
      <div className="trf-pas-numar">
        <button type="button" aria-label="−" disabled={pasageri <= 1} onClick={() => schimbaPasageri(pasageri - 1)}>−</button>
        <b aria-live="polite">{pasageri}</b>
        <button type="button" aria-label="+" disabled={pasageri >= 4} onClick={() => schimbaPasageri(pasageri + 1)}>+</button>
      </div>
    </div>
  );
  const pasLocCorp = (x: { ales: string; trip: TripResult; pret: number; harta: Harta | null; alese: number[]; setAlese: React.Dispatch<React.SetStateAction<number[]>>;
    ref: React.RefObject<HTMLDivElement | null>; schimba: () => void; gata: () => void }) => {
    const gataOk = x.harta?.stare === "indisponibila" || (x.harta?.stare === "ok" && x.alese.length === pasageri);
    return (
      // Minimalist, tot pe un ecran (Ion, 10.10: «minimalist să apară tot pe o pagină»): o linie cu cursa, o linie cu
      // pasagerii și numărul de locuri alese, harta mică, butonul lipit jos.
      <div className="trf-loc-pas">
        <div className="trf-loc-linie">
          <span><b>{x.trip.time}</b> → {x.trip.arrivalTime} · {x.pret} lei</span>
          <button type="button" className="trf-link-mic" onClick={x.schimba}>{tx.schimba}</button>
        </div>
        <div className="trf-loc-linie">
          <div className="trf-pas-numar mic">
            <button type="button" aria-label="−" disabled={pasageri <= 1} onClick={() => schimbaPasageri(pasageri - 1)}>−</button>
            <b aria-live="polite">{pasageriText(pasageri, locale)}</b>
            <button type="button" aria-label="+" disabled={pasageri >= 4} onClick={() => schimbaPasageri(pasageri + 1)}>+</button>
          </div>
          {x.harta?.stare === "ok" && <em className={x.alese.length === pasageri ? "ok" : ""} aria-live="polite">{x.alese.length ? listaLocuri(x.alese) : tx.alese(0, pasageri)}</em>}
        </div>
        <div ref={x.ref} className="trf-harta">
          {x.harta?.stare === "incarca" && <p className="trf-mic">{tx.hartaInc}</p>}
          {x.harta?.stare === "indisponibila" && <p className="trf-mic">{tx.hartaNu}</p>}
          {x.harta?.stare === "ok" && <SeatMap mic ocupate={x.harta.ocupate} alese={x.alese} locale={locale}
            onToggle={(nr) => x.setAlese((a) => comutaLoc(a, nr, pasageri, x.harta!.ocupate))} />}
        </div>
        <button type="button" className="trf-plata trf-lipit" disabled={!gataOk} onClick={x.gata}>{tx.continua} →</button>
      </div>
    );
  };

  // Listele lungi se estompează jos cât mai e ceva de derulat (Ion, 10.10: «mai aproape de jos să devină mai transparent
  // și scroll»). Doar pe liste: pe pasul locului și la plată butonul lipit jos trebuie să rămână plin.
  const refCorp = React.useRef<HTMLDivElement>(null);
  const [maiJos, setMaiJos] = React.useState(false);
  const listaPas = !pasLoc && pas !== 3;
  const masoara = React.useCallback(() => {
    const el = refCorp.current;
    if (el) setMaiJos(el.scrollHeight - el.scrollTop - el.clientHeight > 12);
  }, []);
  React.useEffect(() => {
    masoara();
    const el = refCorp.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(masoara);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [masoara, pas, pasLoc, rez, incarca]);

  return (
    <div className="trf" role="dialog" aria-modal="true" aria-label={`${tx.titlu} · ${from} ⇄ ${to}`}>
      <style>{CSS}</style>
      <div className="trf-fundal" onClick={onClose} />
      <div className="trf-fereastra">
        {/* Antetul evidențiat (Ion, 10.10: «să se vadă evidențiat partea de sus tur-retur și direcția»): bandă plină,
            bordo la tur, chihlimbar la retur, cu ruta mare în alb. */}
        <div className={`trf-cap ${pas === 2 ? "ret" : ""}`}>
        <header className="trf-antet">
          <button type="button" className="trf-rotund" onClick={inapoi} aria-label="←">&larr;</button>
          <div className="trf-antet-text">
            <div className="trf-sus"><span className={`trf-eticheta ${pas === 2 ? "ret" : ""}`}>{titlu.eticheta}</span><span className="trf-ruta">{titlu.ruta}</span></div>
            <div className="trf-sub">{titlu.sub}</div>
          </div>
          <button type="button" className="trf-rotund" onClick={onClose} aria-label="×">&times;</button>
        </header>
        <div className="trf-progres" aria-label={tx.pas(pas)}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= pas ? "on" : ""} />)}
        </div>
        </div>

        <div ref={refCorp} className={`trf-corp ${maiJos && listaPas ? "umbra" : ""}`} onScroll={masoara}>
          {pas === 1 && !pasLoc && (
            <div className="trf-lista">
              {paxRand}
              {tripsTur.map((t, i) => (
                <BiletCursa key={`${t.time}-${i}`} trip={{ ...t, originalPrice: null }} locale={locale} cotor="lista"
                  onCumpara={t.sale_open ? () => alegeTur(t) : undefined} />
              ))}
            </div>
          )}

          {pasLoc === "tur" && tur && pasLocCorp({ ales: tx.turAles, trip: tur, pret: tur.price, harta: hartaTur, alese: aleseTur, setAlese: setAleseTur, ref: refHartaTur,
            schimba: () => alegeTur(null), gata: () => setLocTurGata(true) })}

          {pasLoc === "retur" && retur && pasLocCorp({ ales: tx.returAles, trip: retur, pret: rezumat?.pretRetur ?? retur.price, harta: hartaRetur, alese: aleseRetur, setAlese: setAleseRetur, ref: refHartaRetur,
            schimba: () => alegeRetur(null), gata: () => setLocReturGata(true) })}

          {pas === 2 && tur && !pasLoc && (
            <>
              <button type="button" className="trf-ales" onClick={() => alegeTur(null)}>
                <span className="trf-ales-eticheta">✓ {tx.tur}</span>
                <span className="trf-ales-text">{ziScurta(tur.trip_date, locale)} · {tur.time} → {tur.arrivalTime} · {tur.price} lei</span>
                <u>{tx.schimba}</u>
              </button>
              {(!rez || incarca) && <p className="trf-gol">{tx.cautaRetur}</p>}
              {rez && !incarca && rez.stare !== "ok" && (
                <div className="trf-gol">
                  <p>{rez.stare === "limita" ? tx.limita : tx.indisponibil}</p>
                  <button type="button" className="trf-secundar" onClick={() => void cauta()}>{tx.reincearca}</button>
                </div>
              )}
              {rez && !incarca && rez.stare === "ok" && curseRetur.length === 0 && (
                <div className="trf-gol">
                  <p>{tx.zigoala}</p>
                  <button type="button" className="trf-secundar" onClick={() => setCalendar(true)}>{tx.altaZi}</button>
                </div>
              )}
              {rez && !incarca && curseRetur.length > 0 && (
                <div className="trf-lista">
                  {curseRetur.map((t, i) => {
                    const r = pct != null ? rezumatTurRetur({ pretTur: 0, pretRetur: t.price, pasageri: 1, pct }).pretRetur : null;
                    return <BiletCursa key={`r-${t.time}-${i}`} trip={r != null ? { ...t, originalPrice: t.price, price: r } : t} locale={locale} cotor="lista" onCumpara={() => alegeRetur(t)} />;
                  })}
                  <button type="button" className="trf-link" onClick={() => setCalendar(true)}>{tx.altaZi}</button>
                </div>
              )}
            </>
          )}

          {pas === 3 && !pasLoc && tur && retur && (
            <form action={(fd) => {
              setTrimisCu(alegere);
              salveazaCumpararea({ tip: "tur-retur", from, to, fromRo, toRo, trip: tur, retur, seats: pasageri, alese: aleseTur, aleseRetur, punct, camp,
                chei: [...cheiVechi.filter((k) => k !== cheieTur), cheieTur] });
              return action(fd);
            }} className="trf-plata-grid">
              <input type="hidden" name="lang" value={locale} />
              <input type="hidden" name="idempotencyKey" value={cheieTur} />
              <input type="hidden" name="crmRouteId" value={tur.crm_route_id} />
              <input type="hidden" name="goingNorth" value={String(tur.going_north)} />
              <input type="hidden" name="tripDate" value={tur.trip_date} />
              <input type="hidden" name="fromRo" value={fromRo} />
              <input type="hidden" name="toRo" value={toRo} />
              <input type="hidden" name="seats" value={pasageri} />
              {hartaTur?.stare === "ok" && <input type="hidden" name="locuriAlese" value={JSON.stringify(aleseTur)} />}
              <input type="hidden" name="returTripDate" value={retur.trip_date} />
              <input type="hidden" name="returCrmRouteId" value={retur.crm_route_id} />
              <input type="hidden" name="returGoingNorth" value={String(retur.going_north)} />
              <input type="hidden" name="returFromRo" value={toRo} />
              <input type="hidden" name="returToRo" value={fromRo} />
              <input type="hidden" name="returKey" value={cheieRetur} />
              {hartaRetur?.stare === "ok" && <input type="hidden" name="returLocuri" value={JSON.stringify(aleseRetur)} />}
              {cheiVechi.map((k) => <input key={k} type="hidden" name="inlocuieste" value={k} />)}
              {tgInitData && <input type="hidden" name="tgInitData" value={tgInitData} />}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="trf-capcana" />

              <section className="trf-calatorie">
                {[{ eticheta: tx.tur, trip: tur, de: from, spre: to, harta: hartaTur, alese: aleseTur, setAlese: setAleseTur, ref: refHartaTur, red: false },
                  { eticheta: tx.retur, trip: retur, de: to, spre: from, harta: hartaRetur, alese: aleseRetur, setAlese: setAleseRetur, ref: refHartaRetur, red: true }].map((x) => (
                  // Minimalist (Ion, 10.10: «tot pe o pagină»): fiecare drum pe două rânduri, fără cartela mare.
                  <div key={x.eticheta} className="trf-drum">
                    <div className="trf-drum-sus">
                      <b className={x.red ? "ret" : ""}>{x.eticheta}</b><span>{x.de} → {x.spre}</span>
                      <strong>{x.red && rezumat?.pretRetur != null ? <><s>{x.trip.price}</s> {rezumat.pretRetur}</> : x.trip.price} lei</strong>
                    </div>
                    <div className="trf-drum-jos">{ziScurta(x.trip.trip_date, locale)} · {x.trip.time} → {x.trip.arrivalTime} · {x.harta?.stare === "ok" && x.alese.length ? <b>{tx.locNr(listaLocuri(x.alese))}</b> : tx.laUrcare}</div>
                  </div>
                ))}
              </section>

              <section className="trf-date">
                {(tur.puncte?.length ?? 0) >= 2 && (
                  <fieldset className="trf-puncte">
                    <input type="hidden" name="punctObligatoriu" value="1" />
                    <legend>{tx.unde}</legend>
                    {tur.puncte.map((p) => (
                      <label key={p.id} className={punct === p.id ? "on" : ""}>
                        <input type="radio" name="punctUrcareId" value={p.id} required checked={punct === p.id} onChange={() => setPunct(p.id)} />
                        {locale === "ru" ? p.nume_ru : p.nume_ro}
                      </label>
                    ))}
                  </fieldset>
                )}
                {/* Ion, 10.10.2026: «totul să nimerească într-o pagină — telefonul, e-mailul și acordul»: etichetele stau
                    în câmpuri, telefonul și e-mailul pe un rând, regula tur-returului în textul acordului, totalul pe un rând. */}
                <div className="trf-doua">
                  <label className="trf-camp"><input name="lastName" required minLength={2} maxLength={40} autoComplete="family-name" placeholder=" " value={camp.lastName} onChange={scrie("lastName")} /><span>{tx.nume}</span></label>
                  <label className="trf-camp"><input name="firstName" required minLength={2} maxLength={40} autoComplete="given-name" placeholder=" " value={camp.firstName} onChange={scrie("firstName")} /><span>{tx.prenume}</span></label>
                </div>
                <div className="trf-doua">
                  <label className="trf-camp"><input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder=" " value={camp.phone} onChange={scrie("phone")} /><span>{tx.telefon}</span></label>
                  <label className="trf-camp"><input name="email" type="email" inputMode="email" autoComplete="email" maxLength={120} placeholder=" " value={camp.email} onChange={scrie("email")} /><span>{tx.email}</span></label>
                </div>
                <label className="trf-acord">
                  <input type="checkbox" name="consent" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{tx.acord} <a href={`/${locale}/conditii-vanzare`} target="_blank" rel="noopener">{tx.conditii}</a> {tx.si} <a href={`/${locale}/confidentialitate`} target="_blank" rel="noopener">{tx.politica}</a>. {tx.regula}</span>
                </label>
                {stare.eroare && <p className="trf-eroare" role="alert">{stare.eroare}</p>}
                <div className="trf-total">
                  <div className="trf-total-rand mare"><span>{tx.total} <small>{tx.tur} {rezumat?.tur ?? "—"} + {tx.retur.toLowerCase()} {rezumat?.retur ?? "—"} (−{pct ?? 0}%)</small></span><span>{rezumat?.total ?? "—"} lei</span></div>
                  {rezumat && rezumat.pretRetur == null && <p className="trf-eroare">{tx.faraRed}</p>}
                  <Trimite text={tx.plateste(rezumat?.total ?? 0)} blocat={blocat} />
                  {motiv && <button type="button" className="trf-motiv" onClick={motiv.du}>{motiv.t}</button>}
                  <p className="trf-mic">{tx.dupa}</p>
                </div>
              </section>
            </form>
          )}
        </div>

        {/* Liniuța și îndemnul unde lista se estompează (Ion, 10.10: «să fie liniuța unde devine transparent și un cuvânt
            în română sau rusă ca omul să dea mai în jos scroll pentru ore mai târziu»). Apăsat, derulează un ecran. */}
        {maiJos && listaPas && (
          <button type="button" className="trf-indiciu" onClick={() => refCorp.current?.scrollBy({ top: refCorp.current.clientHeight * 0.75, behavior: "smooth" })}>
            <span className="trf-indiciu-linie" aria-hidden="true" />
            <span className="trf-indiciu-text">{tx.maiTarziu} <span aria-hidden="true">↓</span></span>
          </button>
        )}

        {calendar && (
          <div className="trf-cal" onClick={() => setCalendar(false)}>
            <div className="trf-cal-cutie" role="dialog" aria-modal="true" aria-label={tx.cand} onClick={(e) => e.stopPropagation()}>
              <div className="trf-cal-cap"><span>{tx.cand}</span><button type="button" className="trf-rotund" onClick={() => setCalendar(false)} aria-label="×">&times;</button></div>
              <MiniCalendar value={new Date(`${ziRetur}T12:00:00`)} locale={locale} onChange={(d) => {
                const x = ymd(d);
                const tz = tur?.trip_date ?? ziRetur;
                const max = ymd(new Date(new Date(`${tz}T12:00:00`).getTime() + 30 * 86_400_000));
                setZiRetur(x < tz ? tz : x > max ? max : x); alegeRetur(null); setCalendar(false);
              }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.trf{--trf-fond:#FAF6F5;--trf-linie:rgba(155,27,48,.12);--trf-text:#231A1C;--trf-gri:#857579;--trf-cald:#FDF3E7;--trf-calda-linie:#E6B57B;
  position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;font-family:var(--font-opensans),"Open Sans",system-ui,sans-serif;color:var(--trf-text)}
.trf-fundal{position:absolute;inset:0;background:rgba(35,20,24,.38);backdrop-filter:blur(6px)}
.trf-fereastra{position:relative;width:min(94vw,860px);max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 30px 70px rgba(60,20,30,.2)}
.trf-cap{background:linear-gradient(135deg,#A41F36 0%,${RED} 55%,#74121F 100%);color:#fff;position:relative;z-index:1;box-shadow:0 6px 18px rgba(116,18,31,.18)}
.trf-cap.ret{background:linear-gradient(135deg,#D48A2A 0%,#C47A1C 55%,#9C5E10 100%);box-shadow:0 6px 18px rgba(156,94,16,.18)}
.trf-antet{display:flex;align-items:center;gap:12px;padding:14px 16px 12px}
.trf-cap .trf-rotund{background:rgba(255,255,255,.16);color:#fff}
.trf-cap .trf-eticheta{background:#fff;color:${RED}}
.trf-cap .trf-eticheta.ret{background:#fff;color:#9C5E10}
/* Ion, 10.10 (captura RU «Бельцы → Ки…»): «nu se vede Bălți–Chișinău, trebuie mare dar să se vadă» — eticheta urcă
   deasupra, ruta are tot rândul și se rupe pe două rânduri în loc să fie tăiată. */
.trf-cap .trf-sus{flex-direction:column;align-items:flex-start;gap:4px}
.trf-cap .trf-eticheta{font-size:10.5px;padding:2px 8px}
.trf-cap .trf-ruta{font-size:clamp(20px,6vw,24px);line-height:1.15;white-space:normal;overflow:visible;text-overflow:clip;text-wrap:balance}
.trf-cap .trf-sub{color:rgba(255,255,255,.86)}
.trf-cap .trf-progres{border-bottom:none;padding-bottom:12px}
.trf-cap .trf-progres span{background:rgba(255,255,255,.28)}
.trf-cap .trf-progres span.on{background:#fff}
.trf-antet-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.trf-sus{display:flex;align-items:center;gap:8px;min-width:0}
.trf-eticheta{flex:none;font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#fff;background:${RED};border-radius:6px;padding:3px 8px}
.trf-eticheta.ret{background:#C47A1C}
.trf-ruta{font-size:clamp(16px,4.6vw,19px);font-weight:800;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trf-sub{font-size:14px;color:#6B5B5F;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trf-progres{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:0 16px 10px;border-bottom:1px solid var(--trf-linie)}
.trf-progres span{height:4px;border-radius:4px;background:#EFE4E6;transition:background .25s}
.trf-progres span.on{background:${RED}}
.trf-rotund{width:40px;height:40px;flex:none;border-radius:50%;border:none;background:#F4EEEF;color:#6B5B5F;font-size:19px;cursor:pointer}
.trf-corp{flex:1;min-height:0;overflow-y:auto;background:var(--trf-fond)}
.trf-indiciu{all:unset;position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 16px 14px;cursor:pointer;z-index:2}
.trf-indiciu-linie{width:100%;height:1.5px;background:linear-gradient(90deg,transparent,rgba(155,27,48,.45) 20%,rgba(155,27,48,.45) 80%,transparent)}
.trf-indiciu-text{font-size:14px;font-weight:800;color:${RED};background:rgba(255,255,255,.92);border:1px solid var(--trf-linie);border-radius:999px;padding:7px 14px;box-shadow:0 4px 14px rgba(60,20,30,.12)}
.trf-corp.umbra{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 120px),rgba(0,0,0,.12));mask-image:linear-gradient(to bottom,#000 calc(100% - 120px),rgba(0,0,0,.12))}
.trf-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;padding:16px 14px 22px}
.trf-ales{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;flex-wrap:nowrap;margin:14px 14px 0;padding:10px 14px;border-radius:14px;background:#fff;border:1px solid var(--trf-linie);font-size:14px;cursor:pointer}
.trf-ales-eticheta{flex:none;font-weight:800;color:#2B6B3A}
.trf-ales-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trf-ales-plin{margin:0}
.trf-lista>.trf-pax{grid-column:1/-1;max-width:420px}
.trf-loc-pas{display:flex;flex-direction:column;gap:10px;padding:10px 16px 12px;max-width:560px;margin:0 auto;width:100%;box-sizing:border-box}
.trf-loc-pas .trf-plata:disabled{background:#E9DFE1;color:#A8979B;cursor:default;box-shadow:none}
.trf-loc-linie{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:15px;min-height:36px}
.trf-loc-linie em{font-style:normal;font-size:14px;font-weight:800;color:${RED}}
.trf-loc-linie em.ok{color:#2B6B3A}
.trf-link-mic{all:unset;cursor:pointer;color:${RED};font-weight:700;font-size:14px;padding:6px 0}
.trf-pas-numar.mic{gap:8px}
.trf-pas-numar.mic button{width:36px;height:36px;border-radius:10px;font-size:18px}
.trf-pas-numar.mic b{min-width:0;font-size:15px}
.trf-lipit{position:sticky;bottom:10px;margin-top:0}
.trf-loc-ales{margin:0;font-size:14px;color:var(--trf-gri)}
.trf-loc-ales b{color:var(--trf-text)}
.trf-ales u{flex:none;margin-left:auto;color:${RED};font-weight:700;text-decoration:none}
.trf-gol{padding:34px 20px;text-align:center;color:var(--trf-gri);display:flex;flex-direction:column;align-items:center;gap:12px;margin:0}
.trf-gol p{margin:0}
.trf-secundar{min-height:44px;padding:0 18px;border-radius:12px;border:1.5px solid ${RED};background:#fff;color:${RED};font:700 15px inherit;font-family:inherit;cursor:pointer}
.trf-link{grid-column:1/-1;justify-self:center;background:none;border:none;color:${RED};font:700 14px inherit;font-family:inherit;cursor:pointer;padding:6px}
.trf-plata-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.trf-calatorie{padding:14px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--trf-linie);min-width:0}
.trf-drum{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:14px;background:#fff;border:1px solid var(--trf-linie)}
.trf-drum-sus{display:flex;align-items:center;gap:8px;min-width:0}
.trf-drum-sus b{flex:none;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#fff;background:${RED};border-radius:6px;padding:2px 7px}
.trf-drum-sus b.ret{background:#C47A1C}
.trf-drum-sus span{flex:1;min-width:0;font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trf-drum-sus strong{flex:none;font-size:15px;font-weight:800}
.trf-drum-sus s{color:var(--trf-gri);font-weight:600;font-size:13px}
.trf-drum-jos{font-size:13px;color:#4A3E41}
.trf-drum-jos b{color:var(--trf-text)}
.trf-harta{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.trf-harta-cap{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:15px;font-weight:800}
.trf-harta-cap em{font-style:normal;font-size:13px;color:${RED}}
.trf-harta-cap em.ok{color:#2B6B3A}
.trf-date{padding:18px 20px;background:#fff;display:flex;flex-direction:column;gap:10px;min-width:0}
.trf-camp{position:relative;display:block!important}
.trf-camp input{width:100%;box-sizing:border-box;padding:16px 12px 4px!important;height:50px!important}
.trf-camp span{position:absolute;left:13px;top:15px;font-size:15px;font-weight:600;color:var(--trf-gri);pointer-events:none;transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 20px)}
.trf-camp input:focus+span,.trf-camp input:not(:placeholder-shown)+span{top:6px;font-size:11px;font-weight:700;color:${RED}}
.trf-date label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:700;color:#6B5B5F;min-width:0}
.trf-date input:not([type=checkbox]):not([type=radio]){height:48px;padding:0 12px;border-radius:12px;border:1.5px solid #E6DADC;font-size:16px;font-family:inherit;background:#fff;color:var(--trf-text)}
.trf-date input:focus-visible{outline:2px solid ${RED};outline-offset:1px}
.trf-date small{font-weight:400;color:var(--trf-gri);font-size:12px}
.trf-doua{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.trf-pax{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:800}
.trf-pas-numar{display:flex;align-items:center;gap:10px}
.trf-pas-numar button{width:42px;height:42px;border-radius:12px;border:1.5px solid #E6DADC;background:#fff;font-size:20px;font-weight:700;color:var(--trf-text);cursor:pointer}
.trf-pas-numar button:disabled{color:#CDBFC2;cursor:default}
.trf-pas-numar b{min-width:22px;text-align:center;font-size:19px}
.trf-puncte{border:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.trf-puncte legend{font-size:13px;font-weight:700;color:#6B5B5F;margin-bottom:6px;padding:0}
.trf-puncte label{flex-direction:row!important;align-items:center;gap:10px!important;min-height:46px;padding:0 12px;border-radius:12px;border:1.5px solid #E6DADC;font-size:15px!important;color:var(--trf-text)!important;cursor:pointer}
.trf-puncte label.on{border-color:${RED}}
.trf-regula{margin:0;font-size:13px;color:#4A3E41;padding:10px 12px;border-radius:12px;background:var(--trf-cald)}
.trf-acord{flex-direction:row!important;align-items:flex-start;gap:10px!important;font-weight:400!important;color:#4A3E41!important;font-size:13px!important;line-height:1.4}
.trf-acord input{width:22px;height:22px;margin:1px 0 0;accent-color:${RED};flex:none}
.trf-acord a{color:${RED}}
.trf-eroare{margin:0;color:${RED};font-weight:700;font-size:15px}
.trf-total{background:#fff;display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px dashed #E3D3D6;font-variant-numeric:tabular-nums}
.trf-total-rand small{display:block;font-size:12px;font-weight:600;color:var(--trf-gri)}
.trf-total-rand{display:flex;justify-content:space-between;gap:10px;font-size:14px;color:#4A3E41}
.trf-total-rand s{color:var(--trf-gri)}
.trf-total-rand.mare{font-size:17px;font-weight:800;color:var(--trf-text);padding-top:4px}
.trf-plata{min-height:54px;border:none;border-radius:14px;background:${RED};color:#fff;font:800 17px inherit;font-family:inherit;cursor:pointer;margin-top:4px;box-shadow:0 10px 22px rgba(155,27,48,.22)}
.trf-plata:disabled{background:#C9A0A8;box-shadow:none;cursor:default}
.trf-motiv{background:none;border:none;color:${RED};font:700 13px inherit;font-family:inherit;cursor:pointer;padding:2px}
.trf-mic{margin:0;font-size:12px;color:var(--trf-gri);text-align:center}
.trf-capcana{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.trf-cal{position:absolute;inset:0;z-index:5;background:rgba(40,12,18,.35);display:flex;align-items:center;justify-content:center;padding:16px}
.trf-cal-cutie{width:100%;max-width:340px;background:#fff;border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 60px rgba(40,10,18,.3)}
.trf-cal-cap{display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:800}
@media (max-width:760px){
  .trf{align-items:stretch}
  .trf-fereastra{width:100%;max-height:100vh;max-height:100dvh;height:100vh;height:100dvh;border-radius:0}
  .trf-plata-grid{grid-template-columns:1fr}
  .trf-calatorie{border-right:none;padding:10px 12px 2px;gap:6px}
  .trf-drum{padding:8px 11px}
  .trf-date{padding:10px 12px 12px}
  .trf-lista{grid-template-columns:1fr;padding:14px 12px 22px}
  .trf-ruta{font-size:17px}
}
@media (prefers-reduced-motion:reduce){.trf *{scroll-behavior:auto!important}}
`;
