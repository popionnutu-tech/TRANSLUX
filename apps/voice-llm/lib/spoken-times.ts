// Garda orelor: NICIO oră nu pleacă spre TTS dacă nu vine dintr-un rezultat de tool
// (sau din gura clientului) în conversația curentă.
//
// Apel real 07.09 (conv_3201m1ygxgnjefprgw97vw05n664, Chișinău→Bălți, 21:09):
// search_trips a întors count 0 pe azi. Promptul cerea recăutarea pe «mâine» cu
// tool-ul; modelul a sărit peste tool și a anunțat «mâine la patru și douăzeci, apoi
// la șase și jumătate». Ambele inventate — prima cursă reală de a doua zi era 06:55.
// Ion, 07.09: «să nu inventeze niciodată orele agentul, niciodată».
//
// Promptul interzicea deja. O regulă în prompt e un ÎNDEMN; asta e o POARTĂ:
// fiecare propoziție a modelului care conține o oră e reținută până e completă,
// orele din ea se parsează și se compară cu mulțimea orelor «cunoscute» din istoric.
// O oră necunoscută taie propoziția și tot ce urmează după ea în replica aceea.
//
// Tabelele sunt COPIA celor din apps/admin/src/lib/time-spoken.ts (emițătorul
// departure_spoken_*) și a parserului invers din voice-controller.ts. Proiectul ăsta
// e standalone (Vercel iad1, fără dependențe pe apps/admin) — de aici copia. O
// formă nouă emisă acolo trebuie adăugată și aici, altfel ora corectă e tăiată.

import type { OpenAIMessage } from "./openai-compat";

export const RO_UNITS = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă",
  "zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece", "cincisprezece",
  "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece"];
export const RO_TENS = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci"];
export const RU_UNITS = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
  "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
export const RU_TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят"];

// Cuvânt → număr (0-59), inclusiv compusele «douăzeci și cinci» / «двадцать пять».
const RO_W: Record<string, number> = {};
const RU_W: Record<string, number> = {};
{
  RO_UNITS.forEach((w, i) => { RO_W[w] = i; });
  RU_UNITS.forEach((w, i) => { RU_W[w] = i; });
  for (let t = 2; t <= 5; t++) {
    RO_W[RO_TENS[t]] = t * 10;
    RU_W[RU_TENS[t]] = t * 10;
    for (let u = 1; u <= 9; u++) {
      RO_W[`${RO_TENS[t]} și ${RO_UNITS[u]}`] = t * 10 + u;
      RU_W[`${RU_TENS[t]} ${RU_UNITS[u]}`] = t * 10 + u;
    }
  }
  // Formele pe care modelul le SPUNE deși emițătorul nu le emite: femininul
  // («două», «douăsprezece», «una»), variantele regionale și rusescul «час»
  // (= ora unu: «в час дня»). Doar ca oră, nu ca minute — vezi RO_HOUR_ALT.
  RO_W["una"] = 1;
  RO_W["două"] = 2;
  RO_W["douăsprezece"] = 12;
  RO_W["patrusprezece"] = 14;
  RO_W["șasesprezece"] = 16;
  RO_W["douăzeci și una"] = 21;
  RO_W["douăzeci și două"] = 22;
  RU_W["одна"] = 1;
  RU_W["одну"] = 1;
  RU_W["две"] = 2;
  RU_W["час"] = 1;
}

const byLen = (a: string, b: string) => b.length - a.length;
const alt = (words: string[]) => words.sort(byLen).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

const RO_HOUR_ALT = alt(Object.keys(RO_W).filter((k) => RO_W[k] <= 23));
const RU_HOUR_ALT = alt(Object.keys(RU_W).filter((k) => RU_W[k] <= 23));
// Minute — DOAR formele emise de time-spoken: «fix»/«ноль-ноль», «zero X»/«ноль X»,
// zecile și compusele ≥10. Unitățile goale 1-9 lipsesc dinadins: «douăzeci și trei
// august», «двадцать шесть лей» nu sunt ore.
const RO_MIN_ALT = alt(["fix", ...Object.keys(RO_W).filter((k) => RO_W[k] >= 10 && RO_W[k] <= 59), ...RO_UNITS.slice(1, 10).map((u) => `zero ${u}`)]);
const RU_MIN_ALT = alt(["ноль-ноль", ...Object.keys(RU_W).filter((k) => RU_W[k] >= 10 && RU_W[k] <= 59), ...RU_UNITS.slice(1, 10).map((u) => `ноль ${u}`)]);
// Minutele pe care le poate scădea «fără»/«без»: «opt fără zece», «без четверти девять».
const RO_MINUS_ALT = alt(["un sfert", "cinci", "zece", "cincisprezece", "douăzeci", "douăzeci și cinci"]);
const RU_MINUS_ALT = alt(["четверти", "пяти", "десяти", "пятнадцати", "двадцати", "двадцати пяти"]);
const RU_MINUS_W: Record<string, number> = { "четверти": 15, "пяти": 5, "десяти": 10, "пятнадцати": 15, "двадцати": 20, "двадцати пяти": 25 };
// Ordinalele la genitiv pentru «половина седьмого» (= 6:30), «четверть восьмого» (= 7:15).
const RU_ORD_GEN = ["", "первого", "второго", "третьего", "четвёртого", "пятого", "шестого", "седьмого",
  "восьмого", "девятого", "десятого", "одиннадцатого", "двенадцатого"];
const RU_ORD_ALT = alt(RU_ORD_GEN.filter(Boolean));

// Calificativele zilei. PM: ora <12 poate însemna și +12 («patru după-amiaza» = 16).
const RO_QUAL = "dimineața|dimineață|seara|seară|după-amiaza|după amiaza|după-amiază|după amiază|după-masă|după masă|după-masa|noaptea|ziua|la prânz";
const RU_QUAL = "утра|вечера|дня|ночи";
const AM_QUAL = new Set(["dimineața", "dimineață", "утра"]);

// Prețuri, date, numărători — NU sunt ore. Lookahead după număr.
const NOT_TIME_AFTER = "(?!\\s*(?:de\\s+lei|lei|bani|euro|dolari|procente|la sută|лей|лея|леев|евро|доллар|процент"
  + "|august|septembrie|octombrie|noiembrie|decembrie|ianuarie|februarie|martie|aprilie|mai|iunie|iulie"
  + "|августа|сентября|октября|ноября|декабря|января|февраля|марта|апреля|мая|июня|июля"
  + "|minute|minut|secunde|ore(?![\\p{L}])|ori(?![\\p{L}])|zile|zi(?![\\p{L}])|luni|săptămâni|ani(?![\\p{L}])"
  + "|persoane|pasageri|copii|adulți|locuri|loc(?![\\p{L}])|bilete|bilet|pași|curse|cursă|stații|stație|opriri|oprire|kilometri|km|metri|tone|kilograme|kg|litri|colete|colet|bagaje|bagaj|numere|cifre|rânduri"
  + "|минут|секунд|часа(?![\\p{L}])|часов|дн(?:я|ей)|недел|месяц|лет(?![\\p{L}])|год"
  + "|человек|людей|пассажир|детей|взросл|мест(?:а|о)?(?![\\p{L}])|билет|раз(?![\\p{L}])|рейс|остановк|километр|метр|тонн|килограмм|кг|литр|посыл|багаж|номер|цифр|ряд))";
const NB = "(?<![\\p{L}\\p{N}])";
const NA = "(?![\\p{L}\\p{N}])";

// Cifre: «4:20», «04:20». Doar cu două puncte — «4.20» e prea aproape de un preț.
const DIGIT_RE = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g;
// RO compus: «patru și douăzeci», «opt fix», «șase și jumătate», «nouă și un sfert»,
// «opt fără zece», «douăzeci zero cinci» — cu calificativ opțional după.
const RO_FULL_RE = new RegExp(
  `${NB}(${RO_HOUR_ALT})\\s+(?:(și\\s+)?(${RO_MIN_ALT})|și\\s+(jumătate|un sfert)|fără\\s+(${RO_MINUS_ALT}))${NOT_TIME_AFTER}(?:\\s+(${RO_QUAL}))?${NA}`,
  "giu",
);
// RO oră goală: «la opt», «ora zece», «pe la șapte seara», «de la șase», «opt seara».
const RO_BARE_RE = new RegExp(
  `${NB}(?:(?:la|ora|orele|pe la|de la|până la|pînă la|pana la|către|spre|după|înainte de|în jurul orei|jurul orei)\\s+(${RO_HOUR_ALT})(?:\\s+(${RO_QUAL}))?|(${RO_HOUR_ALT})\\s+(${RO_QUAL}))${NOT_TIME_AFTER}${NA}`,
  "giu",
);
// RU compus: «четыре двадцать», «восемь ноль-ноль», «шесть ноль пять», «восемь с половиной»,
// «половина седьмого», «четверть восьмого», «без четверти девять», «без десяти восемь».
const RU_FULL_RE = new RegExp(
  `${NB}(?:(${RU_HOUR_ALT})\\s+(${RU_MIN_ALT})|(${RU_HOUR_ALT})\\s+с\\s+половиной|(?:половина|половине|пол|полов[а-я]*)\\s*(${RU_ORD_ALT})|четверть\\s+(${RU_ORD_ALT})|без\\s+(${RU_MINUS_ALT})\\s+(${RU_HOUR_ALT}))${NOT_TIME_AFTER}(?:\\s+(${RU_QUAL}))?${NA}`,
  "giu",
);
// RU oră goală: «в восемь», «в два часа дня», «к десяти» NU (genitiv/dativ nu-l parsăm), «восемь утра».
const RU_BARE_RE = new RegExp(
  `${NB}(?:(?:в|во|до|после|около|с|со|к)\\s+(${RU_HOUR_ALT})(?:\\s+(?:часов|часа|час))?(?:\\s+(${RU_QUAL}))?|(${RU_HOUR_ALT})(?:\\s+(?:часов|часа|час))?\\s+(${RU_QUAL}))${NOT_TIME_AFTER}${NA}`,
  "giu",
);

// Telefoanele dictate («zero. șase. nouă...», «ноль шесть девять...») conțin perechi
// «nouă zero cinci» care ar parsa ca 09:05. Un lanț de ≥7 cifre-cuvânt se maschează.
const DIGIT_WORDS = alt([...RO_UNITS.slice(0, 10), ...RU_UNITS.slice(0, 10)]);
const PHONE_RUN_RE = new RegExp(`${NB}(?:(?:${DIGIT_WORDS})[\\s.,…]+){6,}(?:${DIGIT_WORDS})${NA}`, "giu");

export interface SpokenTime {
  /** Textul exact potrivit — pentru log. */
  raw: string;
  /** HH:MM posibile: una, sau două când calificativul PM lasă ora <12 ambiguă. */
  candidates: string[];
}

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function withQual(h: number, m: number, qual: string | undefined): string[] {
  if (h > 23 || m > 59) return [];
  const out = [hhmm(h, m)];
  const q = qual?.toLowerCase();
  if (q && !AM_QUAL.has(q) && h < 12) out.push(hhmm(h + 12, m));
  return out;
}

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/ş/g, "ș").replace(/ţ/g, "ț")
    .replace(/ё/g, "е")
    .replace(/[ \t]+/g, " ");
}

/** Toate orele rostite în text, în ordinea apariției. Strict: doar formele pe care
 *  le emite time-spoken sau pe care omul le zice fără echivoc. */
export function parseSpokenTimes(text: string): SpokenTime[] {
  const out: SpokenTime[] = [];
  let s = normalizeSpeech(text).replace(PHONE_RUN_RE, (m) => " ".repeat(m.length));
  const blank = (m: string) => " ".repeat(m.length);

  s = s.replace(DIGIT_RE, (m, h: string, mm: string) => {
    const c = withQual(Number(h), Number(mm), undefined);
    if (c.length) out.push({ raw: m, candidates: c });
    return blank(m);
  });

  s = s.replace(RO_FULL_RE, (m, hour: string, si: string | undefined, min: string | undefined, half: string | undefined, minus: string | undefined, qual: string | undefined) => {
    const h = RO_W[hour];
    let mi: number | undefined;
    if (min !== undefined) {
      // Minutele obișnuite se leagă OBLIGATORIU cu «și» («douăzeci trei» dintr-o
      // enumerare nu e 20:03); «fix» și «zero X» sunt singurele forme fără «și».
      if (min === "fix") mi = 0;
      else if (min.startsWith("zero ")) mi = RO_W[min.slice(5)];
      else if (si) mi = RO_W[min];
      else return m; // nu e oră — lăsăm textul, poate RO_BARE_RE îl vede altfel
    } else if (half === "jumătate") mi = 30;
    else if (half === "un sfert") mi = 15;
    if (minus !== undefined) {
      const sub = minus === "un sfert" ? 15 : RO_W[minus];
      if (h === undefined || sub === undefined) return m;
      const c = withQual((h + 23) % 24, 60 - sub, qual);
      if (c.length) out.push({ raw: m.trim(), candidates: c });
      return blank(m);
    }
    if (h === undefined || mi === undefined) return m;
    const c = withQual(h, mi, qual);
    if (c.length) out.push({ raw: m.trim(), candidates: c });
    return blank(m);
  });

  s = s.replace(RO_BARE_RE, (m, h1: string | undefined, q1: string | undefined, h2: string | undefined, q2: string | undefined) => {
    const h = RO_W[(h1 ?? h2) as string];
    if (h === undefined) return m;
    const c = withQual(h, 0, q1 ?? q2);
    if (c.length) out.push({ raw: m.trim(), candidates: c });
    return blank(m);
  });

  s = s.replace(RU_FULL_RE, (m, hour: string | undefined, min: string | undefined, hHalf: string | undefined, ordHalf: string | undefined, ordQuarter: string | undefined, minus: string | undefined, hMinus: string | undefined, qual: string | undefined) => {
    let h: number | undefined;
    let mi: number | undefined;
    if (hour !== undefined && min !== undefined) {
      h = RU_W[hour];
      if (min === "ноль-ноль") mi = 0;
      else if (min.startsWith("ноль ")) mi = RU_W[min.slice(5)];
      else mi = RU_W[min];
    } else if (hHalf !== undefined) { h = RU_W[hHalf]; mi = 30; }
    else if (ordHalf !== undefined) { h = RU_ORD_GEN.indexOf(ordHalf) - 1; mi = 30; }
    else if (ordQuarter !== undefined) { h = RU_ORD_GEN.indexOf(ordQuarter) - 1; mi = 15; }
    else if (minus !== undefined && hMinus !== undefined) {
      const base = RU_W[hMinus];
      const sub = RU_MINUS_W[minus];
      if (base === undefined || sub === undefined) return m;
      h = (base + 23) % 24; mi = 60 - sub;
    }
    if (h === undefined || h < 0 || mi === undefined) return m;
    const c = withQual(h, mi, qual);
    if (c.length) out.push({ raw: m.trim(), candidates: c });
    return blank(m);
  });

  s = s.replace(RU_BARE_RE, (m, h1: string | undefined, q1: string | undefined, h2: string | undefined, q2: string | undefined) => {
    const h = RU_W[(h1 ?? h2) as string];
    if (h === undefined) return m;
    const c = withQual(h, 0, q1 ?? q2);
    if (c.length) out.push({ raw: m.trim(), candidates: c });
    return blank(m);
  });

  return out;
}

// ---- Mulțimea orelor «cunoscute» din istoric ----

const LENIENT_RO_RE = new RegExp(`${NB}(${RO_HOUR_ALT})(?:\\s+(?:și\\s+)?(${RO_MIN_ALT}|${alt(RO_UNITS.slice(1, 10))}))?${NA}`, "giu");
const LENIENT_RU_RE = new RegExp(`${NB}(${RU_HOUR_ALT})(?:\\s+(${RU_MIN_ALT}|${alt(RU_UNITS.slice(1, 10))}))?${NA}`, "giu");
const LENIENT_DIGIT_RE = /(?<![\d:])(\d{1,2})(?::(\d{2}))?(?![\d:])/g;

/** Ce a spus CLIENTUL se poate repeta: a lui e, nu inventată. Parsare largă —
 *  orice număr 0-23 e o oră posibilă (și +12), «patru douăzeci» fără «și» e 04:20. */
export function lenientTimes(text: string): string[] {
  const out = new Set<string>();
  for (const t of parseSpokenTimes(text)) t.candidates.forEach((c) => out.add(c));
  const s = normalizeSpeech(text);
  const add = (h: number, m: number) => {
    if (h > 23 || m > 59) return;
    out.add(hhmm(h, m));
    if (m === 0 && h < 12) out.add(hhmm(h + 12, 0));
  };
  for (const re of [LENIENT_RO_RE, LENIENT_RU_RE]) {
    const dict = re === LENIENT_RO_RE ? RO_W : RU_W;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const h = dict[m[1]];
      if (h === undefined) continue;
      const mw = m[2];
      let mi = 0;
      if (mw) {
        if (mw === "fix" || mw === "ноль-ноль") mi = 0;
        else if (mw.startsWith("zero ") || mw.startsWith("ноль ")) mi = dict[mw.slice(5)] ?? 0;
        else mi = dict[mw] ?? 0;
      }
      add(h, mi);
      if (mw) add(h, 0); // «opt și zece» → și ora opt rămâne rostibilă
    }
  }
  LENIENT_DIGIT_RE.lastIndex = 0;
  let d: RegExpExecArray | null;
  while ((d = LENIENT_DIGIT_RE.exec(s))) add(Number(d[1]), d[2] ? Number(d[2]) : 0);
  return [...out];
}

function jsonStrings(raw: string): string[] {
  try {
    const acc: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") acc.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(JSON.parse(raw));
    return acc;
  } catch {
    return [raw];
  }
}

function textOf(content: OpenAIMessage["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("");
}

/** Orele pe care agentul are voie să le rostească în tura curentă: tot ce a întors
 *  un tool (strict, plus HH:MM din cifre), tot ce a rostit clientul (larg) și ce a
 *  trimis modelul ca parametru de tool (cifre — «departure»). Promptul de sistem și
 *  replicile vechi ale agentului NU intră: exemplele din prompt nu sunt curse, iar
 *  o replică veche putea fi inventată. */
export function allowedTimes(messages: OpenAIMessage[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    if (m.role === "tool") {
      for (const s of jsonStrings(textOf(m.content))) {
        for (const t of parseSpokenTimes(s)) t.candidates.forEach((c) => out.add(c));
        for (const mm of s.matchAll(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/g)) {
          const h = Number(mm[1]);
          const mi = Number(mm[2]);
          if (h <= 23 && mi <= 59) out.add(hhmm(h, mi));
        }
      }
    } else if (m.role === "user") {
      lenientTimes(textOf(m.content)).forEach((c) => out.add(c));
    } else if (m.role === "assistant") {
      for (const tc of m.tool_calls ?? []) {
        for (const s of jsonStrings(tc.function?.arguments ?? "")) lenientTimes(s).forEach((c) => out.add(c));
      }
    }
  }
  return out;
}

// ---- Poarta pe stream ----

// Poate propoziția de până acum să conțină o oră neterminată? Dacă nu are niciun
// cuvânt-număr și nicio cifră, pleacă imediat — latența rămâne zero pe replicile
// fără numere (majoritatea). Cu un număr înăuntru, așteaptă capătul propoziției.
const NUMBERISH_RE = new RegExp(`${NB}(?:${alt([...Object.keys(RO_W), ...Object.keys(RU_W), "jumătate", "sfert", "половина", "половине", "половиной", "четверть", "fix", "ноль-ноль"])})${NA}|\\d`, "iu");
const SENTENCE_END_RE = /[.!?…]+["»”')\]]*\s/u;
// Începutul propoziției se ține puțin chiar fără număr: «Mâine am cursă la» + «patru
// și douăzeci» vin în chunk-uri diferite, iar un cap deja rostit nu se mai retrage —
// clientul ar auzi «Mâine am cursă la» și apoi fraza de rezervă. 48 de caractere
// acoperă capul obișnuit; TtsGate ține oricum primele ~30 pentru narare.
const HEAD_MAX = 48;
// O propoziție cu număr dar fără capăt vizibil nu se ține la nesfârșit: peste pragul
// ăsta eliberăm ce e ÎNAINTE de primul cuvânt-număr (partea aceea nu poate fi oră).
const HOLD_MAX = 160;

export class TimeGuard {
  private buf = "";
  private muted = false;
  /** Propozițiile tăiate, cu ora care le-a condamnat — pentru log. */
  readonly dropped: Array<{ sentence: string; time: string }> = [];

  constructor(private allowed: ReadonlySet<string>) {}

  get violated(): boolean { return this.dropped.length > 0; }

  /** Ora din propoziție care nu e cunoscută — sau null dacă totul e acoperit. */
  offending(sentence: string): string | null {
    for (const t of parseSpokenTimes(sentence)) {
      if (!t.candidates.some((c) => this.allowed.has(c))) return `${t.raw} → ${t.candidates.join("/")}`;
    }
    return null;
  }

  private judge(sentence: string): string {
    const bad = this.offending(sentence);
    if (bad === null) return sentence;
    this.dropped.push({ sentence: sentence.trim(), time: bad });
    this.muted = true;
    this.buf = "";
    return "";
  }

  /** Primește text deja curățat pentru TTS (la limită de cuvânt); întoarce ce poate
   *  fi rostit ACUM. */
  push(speech: string): string {
    if (!speech) return "";
    if (this.muted) return "";
    this.buf += speech;
    let out = "";
    for (;;) {
      const m = SENTENCE_END_RE.exec(this.buf);
      if (!m) break;
      const end = m.index + m[0].length;
      const sentence = this.buf.slice(0, end);
      this.buf = this.buf.slice(end);
      const ok = this.judge(sentence);
      if (this.muted) return out;
      out += ok;
    }
    if (!this.buf) return out;
    const num = NUMBERISH_RE.exec(this.buf);
    if (!num) {
      if (this.buf.length >= HEAD_MAX) {
        const cut = this.buf.lastIndexOf(" ");
        if (cut > 0) {
          out += this.buf.slice(0, cut + 1);
          this.buf = this.buf.slice(cut + 1);
        }
      }
    } else if (this.buf.length > HOLD_MAX) {
      const cut = this.buf.lastIndexOf(" ", num.index);
      if (cut > 0) {
        out += this.buf.slice(0, cut + 1);
        this.buf = this.buf.slice(cut + 1);
      }
    }
    return out;
  }

  /** Capăt de replică (sau tool call imediat după text): ce e în buffer e o
   *  propoziție întreagă și se judecă acum. */
  flush(): string {
    if (this.muted || !this.buf) { this.buf = ""; return ""; }
    const rest = this.buf;
    this.buf = "";
    return this.judge(rest);
  }
}
