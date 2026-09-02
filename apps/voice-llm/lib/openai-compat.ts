// AI PBX — conversie OpenAI Chat Completions <-> Anthropic Messages.
// ElevenLabs vorbește doar formatul OpenAI; creierul nostru e Anthropic.
// Funcții pure, fără I/O — testabile izolat.

import type Anthropic from "@anthropic-ai/sdk";
import { langOfUtterance, vetoedRussian, UA_LETTER_RE, UA_WORDS } from "./language";

// ---- Formatul OpenAI primit de la ElevenLabs ----

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null | Array<{ type: string; text?: string }>;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAITool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

// Istoria lungă se taie, nu se răspunde 413 — un apel telefonic nu are voie
// să moară la mijloc. Păstrăm system + coada conversației.
const MAX_HISTORY_MESSAGES = 40;

function contentToText(content: OpenAIMessage["content"]): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("");
}

export function toAnthropic(openaiMessages: OpenAIMessage[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  const system = openaiMessages
    .filter((m) => m.role === "system")
    .map((m) => contentToText(m.content))
    .join("\n\n");

  let rest = openaiMessages.filter((m) => m.role !== "system");
  if (rest.length > MAX_HISTORY_MESSAGES) rest = rest.slice(-MAX_HISTORY_MESSAGES);
  // Istoria nu are voie să înceapă cu un tool-result orfan după tăiere.
  while (rest.length && rest[0].role === "tool") rest = rest.slice(1);

  const messages: Anthropic.MessageParam[] = [];
  for (const m of rest) {
    if (m.role === "tool") {
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        // Anthropic poate refuza conținut gol — un rezultat gol devine explicit.
        content: contentToText(m.content) || "(fără rezultat)",
      };
      const last = messages[messages.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        messages.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      const text = contentToText(m.content);
      if (text) blocks.push({ type: "text", text });
      for (const tc of m.tool_calls ?? []) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function.arguments || "{}"); } catch { input = {}; }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      if (blocks.length === 0) continue;
      messages.push({ role: "assistant", content: blocks });
      continue;
    }

    const text = contentToText(m.content);
    // Transcrierea unei tăceri / barge-in produce replici goale — Anthropic
    // refuză blocurile de text goale, deci le sărim complet.
    if (!text) continue;
    const last = messages[messages.length - 1];
    if (last && last.role === "user" && Array.isArray(last.content)) {
      (last.content as Anthropic.ContentBlockParam[]).push({ type: "text", text });
    } else if (last && last.role === "user" && typeof last.content === "string") {
      last.content = `${last.content}\n${text}`;
    } else {
      messages.push({ role: "user", content: text });
    }
  }

  // Anthropic cere ca primul mesaj să fie user...
  while (messages.length && messages[0].role !== "user") messages.shift();
  // ...și fereastra tăiată poate începe cu tool_result-uri al căror tool_use
  // tocmai a fost aruncat — orfanele de la cap se elimină, altfel 400.
  while (messages.length) {
    const first = messages[0];
    if (first.role === "user" && Array.isArray(first.content)) {
      first.content = (first.content as Anthropic.ContentBlockParam[]).filter(
        (b) => b.type !== "tool_result",
      );
      if (first.content.length === 0) {
        messages.shift();
        while (messages.length && messages[0].role !== "user") messages.shift();
        continue;
      }
    }
    break;
  }
  // ORICE tool_use fără tool_result ulterior => 400 de la Anthropic. Posibil
  // cu tool-urile de SISTEM (language_detection): nu e garantat că ElevenLabs
  // întoarce rezultatul lor în istoricul următorului request — orfanul poate
  // rămâne și la mijloc (tura după comutarea limbii), nu doar la coadă.
  const resultIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "user" && Array.isArray(m.content)) {
      for (const b of m.content as Anthropic.ContentBlockParam[]) {
        if (b.type === "tool_result") resultIds.add(b.tool_use_id);
      }
    }
  }
  for (let k = messages.length - 1; k >= 0; k--) {
    const m = messages[k];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    m.content = (m.content as Anthropic.ContentBlockParam[]).filter(
      (b) => b.type !== "tool_use" || resultIds.has(b.id),
    );
    if (m.content.length === 0) messages.splice(k, 1);
  }
  if (messages.length === 0) messages.push({ role: "user", content: "(fără mesaj)" });

  return { system, messages };
}

export function toAnthropicTools(tools: OpenAITool[] | undefined): Anthropic.Tool[] {
  if (!tools?.length) return [];
  return tools
    .filter((t) => t.type === "function" && t.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
    }));
}

// ---- Chunk-uri SSE în format OpenAI ----

export function sseChunk(id: string, model: string, delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

export const SSE_DONE = "data: [DONE]\n\n";

// Filtrul „gândurilor cu voce tare": în chat un preambul meta e tolerabil,
// la telefon e catastrofă — se TAIE prima propoziție dacă e narare de proces.
const THINKING_ALOUD_RE =
  /^\s*(Bine[,.]|Deci[,.]|Ok(ay)?[,.]|Să (văd|analizez|verific)|Analizez|Utilizatorul (vrea|cere|întreabă)|The user (wants|asks|is asking)|Let me |I('ll| will) (check|look|analyze)|Хорошо[,.]|Итак[,.])/i;

/** Începe replica cu narare de proces? (folosit și pentru flush-ul devreme) */
export function looksLikeThinkingAloud(text: string): boolean {
  return THINKING_ALOUD_RE.test(text);
}

// Alternativele regexului de mai sus, scrise ÎNTREGI. Nu doar primul cuvânt:
// „Bine" singur nu e narare, „Bine," e — iar o replică normală care începe cu
// „Bine ați venit" nu are voie să aștepte degeaba. Ține lista sincronizată cu
// THINKING_ALOUD_RE: o alternativă adăugată acolo și uitată aici lasă narare
// să treacă la TTS.
const NARRATION_OPENERS = [
  "bine,", "bine.", "deci,", "deci.", "ok,", "ok.", "okay,", "okay.",
  "să văd", "să analizez", "să verific", "analizez",
  "utilizatorul vrea", "utilizatorul cere", "utilizatorul întreabă",
  "the user wants", "the user asks", "the user is asking", "let me ",
  "i'll check", "i'll look", "i'll analyze",
  "i will check", "i will look", "i will analyze",
  "хорошо,", "хорошо.", "итак,", "итак.",
];

/**
 * Poate începutul ăsta să fie încă narare de proces? Un „nu" e definitiv:
 * niciun deltă viitor nu mai schimbă începutul deja scris. Înlocuiește pragul
 * fix de 30 de caractere — acela ținea în tăcere și replicile care NU aveau cum
 * să fie narare, iar fiecare caracter așteptat degeaba e tăcere în receptor.
 * (Portat din TLX, 24.08: acolo primul chunk pleacă acum după 3-6 caractere.)
 */
export function couldBeThinkingAloud(lead: string): boolean {
  const s = lead.trimStart().toLowerCase();
  if (!s) return true;
  return NARRATION_OPENERS.some((o) => o.startsWith(s)) || THINKING_ALOUD_RE.test(lead);
}

export function stripThinkingAloud(firstText: string): string {
  if (!THINKING_ALOUD_RE.test(firstText)) return firstText;
  const dot = firstText.search(/[.!?]\s/);
  if (dot === -1 || dot > 120) return firstText;
  // Cifre (în cifre sau cuvinte) în prima propoziție = probabil dictare de număr
  // cu puncte între grupe (phone-spoken) — nu tăiem: am pierde grupe din număr.
  // NU \b: în JS el nu vede diacriticele/chirilicele ca litere (șase, девять ar scăpa).
  if (/\d|(?<![\p{L}\p{N}])(zero|unu|doi|trei|patru|cinci|șase|șapte|opt|nouă|ноль|один|два|три|четыре|пять|шесть|семь|восемь|девять)(?![\p{L}\p{N}])/iu.test(firstText.slice(0, dot + 1))) {
    return firstText;
  }
  return firstText.slice(dot + 1).trimStart();
}

// TTS-ul citește Markdown-ul cu voce tare („asterisc asterisc...").
// Caracterele de formatare nu au ce căuta într-o replică vorbită — se taie
// per-delta (sigur pe stream: sunt caractere individuale, nu perechi).
export function stripMarkdownForTts(delta: string): string {
  // Pe lângă Markdown: tag-uri de emoție scăpate de model („[cald]", „[тепло]")
  // — experimentul v3 din 22.08 le-a lăsat în replici și TTS le rostea.
  // Doar cuvinte scurte fără cifre — nu atinge conținut real între paranteze.
  return delta
    .replace(/\[[a-zA-ZăâîșțĂÂÎȘȚşţа-яёА-ЯЁ][a-zA-ZăâîșțĂÂÎȘȚşţа-яёА-ЯЁ ,-]{1,22}\]/g, "")
    .replace(/[*`#]|^[-•]\s+/gm, "");
}

// Salutul îl spune DOAR sistemul. Modelul ignoră uneori regula — tăiem deterministic
// orice salut din capul replicii (Ion, 23.08: «привет» repetat era problema #1).
const LEADING_GREETING_RE =
  /^\s*(?:(?:Bun[ăa](?: ziua| seara| dimineața)?|Salut(?:are)?|Привет(?:ствую)?|Здравствуйте|Добрый (?:день|вечер)|Доброе утро)[!,.\s]+)+/i;

export function stripLeadingGreeting(text: string): string {
  return text.replace(LEADING_GREETING_RE, '').trimStart();
}

// ---- Tool-вызов, «написанный» текстом (Haiku, звонки 27-28.08) ----
// Модель иногда выдаёт вызов инструмента не структурой tool_use, а голым XML
// в тексте: <invoke name="language_detection">... За 27-28.08 — 5 утечек в 4
// звонках (conv_4001m13y...: румынский голос прочитал XML вслух, клиент услышал
// «чужой язык» и повесил трубку). Текст, начинающийся с <invoke, не озвучивается
// НИКОГДА: либо парсится в настоящий tool-вызов, либо выбрасывается.

/**
 * Парсит текстовый <invoke name="X"><parameter name="p">v</parameter>...</invoke>
 * в {name, args, rest}. rest = текст вокруг XML (обычно пуст). Обрыв без
 * </invoke> тоже парсится — стрим мог оборваться на середине. Не XML → null.
 */
export function parseInvokeToolCall(
  text: string,
): { name: string; args: Record<string, string>; rest: string } | null {
  const m = text.match(/<invoke\s+name="([\w-]+)"\s*>([\s\S]*?)(?:<\/invoke>|$)/);
  if (!m || m.index === undefined) return null;
  const args: Record<string, string> = {};
  const paramRe = /<parameter\s+name="([\w-]+)"\s*>([\s\S]*?)<\/parameter>/g;
  let p: RegExpExecArray | null;
  while ((p = paramRe.exec(m[2]))) args[p[1]] = p[2].trim();
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { name: m[1], args, rest };
}

// ---- Жёсткое правило языка (Ion, 28.08): наружу ТОЛЬКО румынский или русский ----
// Слой EL уже жёсткий (у агента только ro + пресет ru), дыра — текст LLM в TTS.
// Скрипт-чек: >2 букв вне латиницы(+диакритика RO)+кириллицы = нарушение
// (азербайджанский ə, греческий, CJK...). Английский легален по алфавиту,
// поэтому ловится по стоп-словам: ≥3 РАЗНЫХ сильно-английских слова.
// «are» в списке нет — это частый румынский глагол.
const ALLOWED_LETTER_RE = /[a-zA-Zа-яёА-ЯЁăâîșțĂÂÎȘȚşţŞŢ]/;
// Ion (28.08): «никаких английских вообще слов». Порог — 2 РАЗНЫХ слова из
// списка. В списке НЕТ румынских омографов (are, cost, minute, in, sat, mare…) —
// два разных слова отсюда в честной румынской реплике не встречаются
// (проверено на всех исторических репликах агента из voice_calls).
const ENGLISH_MARKERS = new Set([
  // служебные
  "the", "you", "your", "is", "was", "were", "have", "has", "will", "would",
  "can", "could", "please", "hello", "thank", "thanks", "sorry", "what",
  "when", "where", "this", "that", "with", "from", "about", "help", "how",
  "there", "here", "now", "next", "first", "last", "sure", "yes", "okay",
  "and", "for", "not", "but", "they", "them", "then", "than", "of", "at", "to",
  "we", "our", "my", "it", "its",
  // предметные (транспорт, время)
  "bus", "buses", "trip", "trips", "ticket", "tickets", "station", "driver",
  "schedule", "timetable", "route", "price", "number", "phone",
  "leave", "leaves", "leaving", "arrive", "arrives", "arrival", "departure",
  "departs", "going", "coming", "wait", "waiting",
  "today", "tomorrow", "yesterday", "morning", "evening", "afternoon", "night",
  "hour", "hours", "minutes", "clock", "day", "week",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "forty", "fifty",
  "need", "want", "know", "tell", "give", "take", "get", "make", "pay",
  "call", "back", "good", "directly", "available",
]);

// Чужие романские/славянские/немецкие стоп-слова: правило доминирования их
// больше не ловит (короткие улики am/ce/se/te/mi живут и в итальянском с
// испанским — ревью 28.08, H1), поэтому у них СВОЙ словарь с тем же порогом 2.
// Проверено на румынские омографы: «non» (magazin non-stop), «pardon», «voce»,
// «pas», «ne», «merci/mersi» в список НЕ входят.
const FOREIGN_MARKERS = new Set([
  // итальянский
  "scusi", "grazie", "prego", "posso", "puo", "vuole", "capito", "sono",
  "questo", "gli", "anche", "ripetere", "ho",
  // испанский
  "siento", "entiendo", "puede", "usted", "gracias", "hola", "por", "favor", "repetir",
  // французский
  "vous", "je", "comprends", "repetez", "bonjour", "madame", "monsieur",
  // португальский
  "puder", "muito", "obrigado", "devagar", "agradeco", "mais",
  // польский
  "przepraszam", "rozumiem", "prosze", "czy", "mozesz", "dzien",
  // немецкий
  "ich", "nicht", "bitte", "danke", "sprechen", "haben",
]);

// Румынские улики: служебные слова без диакритики. Они отключают ТОЛЬКО правило
// доминирования — словари ENGLISH_MARKERS/FOREIGN_MARKERS срабатывают раньше и
// независимо от улик. «are» намеренно не улика: англ. «there are».
const RO_EVIDENCE = new Set([
  "de", "la", "cu", "pe", "din", "spre", "nu", "este", "sunt", "pentru",
  "lei", "ora", "orele", "cursa", "curse", "rog", "un", "mersi", "bine",
  "va", "sa", "si", "cel", "cea", "doua", "trei", "mai", "dus",
  // короткие частые слова из ложных срабатываний на истории (28.08):
  // «N-am prins localitatea», «Te ascult, spune-mi ce ai nevoie»
  "am", "ce", "se", "te", "ai", "mi", "cum", "unde", "cand", "care",
  "spune", "nevoie", "ascult", "vreti", "doriti", "aveti", "numarul",
  // топливный домен TLX (ревью порта 28.08, M1) — словари в двух репо ИДЕНТИЧНЫ
  "pret", "preturi", "statie", "statii", "motorina", "benzina",
  "litru", "litri", "azi", "costa", "avem", "program",
]);
const RO_DIACRITIC_RE = /[ăâîșțşţĂÂÎȘȚŞŢ]/;

// Украинский (Ion, 02.09, conv_0601m1gtmb3ker5v063fpz51vgqp): на одно слово
// «Палата?» модель ответила «Що вас цікавить — курси, ціни…». Общее правило
// «>2 чужих букв» его не взяло: украинский делит с русским почти весь алфавит.
// Два класса улик с РАЗНЫМИ порогами (ревью 02.09):
//  • СИЛЬНАЯ — слово из UA_WORDS или однобуквенное слово «і»/«є»: ни в румынском,
//    ни в русском не встречается → нарушение с ПЕРВОЙ («Добрий день!», «Дякую»).
//  • СЛАБАЯ — прочее слово с буквой і/ї/є/ґ: нужна вторая улика. За 90 дней в
//    voice_calls единственная такая буква в честной русской реплике — опечатка
//    модели «Кобироі Олег» (аудит 02.09); правило «одна буква» резало бы ответ.
// Признаки — из language.ts, общие с вето апеллянта: второй список уже расходился.
const UA_WORD_SET = new Set(UA_WORDS);
const UA_PHRASES = UA_WORDS.filter((w) => w.includes(" "));

/** Украинские улики: true при сильной улике или ≥2 разных слабых (см. выше).
 *  Текст заканчивается на границе слова: недописанный хвост стрима TtsGate держит
 *  в буфере (аудит 02.09: «Чим» от «Чимишлия» совпадал со словарём). Исключения —
 *  конец стрима (force) и текст перед «<»: там слово уже полное или дальше XML. */
function ukrainianDetected(text: string): boolean {
  const low = text.toLowerCase();
  for (const ph of UA_PHRASES) if (low.includes(ph)) return true;
  const weak = new Set<string>();
  for (const w of low.match(/[а-яёіїєґ]+/g) ?? []) {
    if (UA_WORD_SET.has(w)) return true;
    if (!UA_LETTER_RE.test(w)) continue;
    if (w.length === 1) return true;
    weak.add(w);
    if (weak.size >= 2) return true;
  }
  return false;
}

// Хвост накопленного текста, который ещё может быть НЕДОПИСАННЫМ словом. Пока не
// пришла граница (пробел, знак), он не озвучивается и не проверяется: русский
// префикс мог совпасть с украинской уликой, а украинское слово — уйти в TTS по
// буквам до того, как гейт его увидел (ревью 02.09). Слов длиннее 40 букв нет —
// такой «хвост» отдаём как есть, чтобы буфер не рос.
const HOLD_MAX = 40;
function splitTrailingWord(text: string): { emit: string; keep: string } {
  const m = /[\p{L}\p{N}'’-]+$/u.exec(text);
  if (!m || m[0].length > HOLD_MAX) return { emit: text, keep: "" };
  return { emit: text.slice(0, m.index), keep: m[0] };
}

/**
 * Порог правила «латиница без румынских улик» — единый 12: улика в честной
 * румынской реплике могла прийти поздно (стрим — «Soferul va suna cand...»),
 * а в батче порог 5 резал «Pasagerul José Müller are loc rezervat» и
 * «Sigur, verific imediat orarul complet» (ревью 28.08, M2). Английский и
 * романские языки ловятся словарями ДО этого правила, им порог не нужен.
 */
const DOMINANCE_MIN_WORDS = 12;

export function violatesLanguagePolicy(text: string): boolean {
  if (ukrainianDetected(text)) return true;
  let foreign = 0;
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (/[а-яёіїєґА-ЯЁІЇЄҐ]/.test(ch)) cyr += 1;
    else if (/[a-zA-ZăâîșțĂÂÎȘȚşţŞŢ]/.test(ch)) lat += 1;
    else if (/\p{L}/u.test(ch) && !ALLOWED_LETTER_RE.test(ch)) {
      foreign += 1;
      if (foreign > 2) return true;
    }
  }
  const eng = new Set<string>();
  const frn = new Set<string>();
  const latWords = text.toLowerCase().match(/[a-zăâîșțşţ]{2,}/g) ?? [];
  for (const w of latWords) {
    if (ENGLISH_MARKERS.has(w)) eng.add(w);
    if (FOREIGN_MARKERS.has(w)) frn.add(w);
  }
  if (eng.size >= 2 || frn.size >= 2) return true;
  // Латиница доминирует, слов достаточно, а румынских улик ноль — это не румынский.
  if (lat > cyr && latWords.length >= DOMINANCE_MIN_WORDS && !RO_DIACRITIC_RE.test(text) && !latWords.some((w) => RO_EVIDENCE.has(w))) {
    return true;
  }
  return false;
}

// XML-спасение — ТОЛЬКО инструменты смены языка. Спасать из текста бизнес-тулы
// (request_callback...) значит превратить «уговорил модель произнести текст» в
// «уговорил модель совершить действие» (security-ревью 28.08, M1). Реальные
// утечки — только language_detection.
// end_call тоже спасаем: «прощание + <invoke end_call> текстом» иначе оставляет
// линию висеть до max_duration (аудит TLX 28.08, High). Вреда нет — звонящий
// «вешает трубку сам себе», это security уже оценил как безопасное.
const XML_RESCUABLE = new Set(["language_detection", "transfer_to_agent", "end_call"]);

export function rescuableCall(
  inv: { name: string; args: Record<string, string> } | null,
  toolNames: ReadonlySet<string>,
): { name: string; args: Record<string, string | number> } | null {
  if (!inv || !XML_RESCUABLE.has(inv.name) || !toolNames.has(inv.name)) return null;
  // agent_number у transfer_to_agent — число; из XML всё приходит строками.
  const args: Record<string, string | number> = { ...inv.args };
  if (inv.name === "transfer_to_agent" && typeof args.agent_number === "string" && /^\d+$/.test(args.agent_number)) {
    args.agent_number = Number(args.agent_number);
  }
  return { name: inv.name, args };
}

// ---- TtsGate: единственная дверь между текстом модели и TTS ----
// Держит ВСЁ состояние стрима: lead-буфер (как прежний flushLead), НАКОПЛЕННЫЙ
// уже-озвученный текст и решение о блокировке. Ловушка, из-за которой гейт
// нельзя было оставить в flushLead (ревью 28.08): реплика уходит кусками по
// 3-6 символов, и на отдельном куске порог «≥3 английских слова» недостижим —
// «The bus leaves...» уходила в TTS целиком. Проверка идёт по НАКОПЛЕННОМУ:
// первые слова не вернуть, но с третьего маркера реплика обрезается.
// Второе правило: после lead-а символ «<» в речи не живёт вообще — до «<»
// озвучиваем, дальше глушим (XML-вызов, разорванный между дельтами, ловится
// без сборки литерала «<invoke»).

export interface TtsGateOut {
  speech: string;
  toolCall: { name: string; args: Record<string, string | number> } | null;
}

export class TtsGate {
  private lead = "";
  private leadDone = false;
  private spoken = "";
  private blocked = false;
  private suppressedAny = false;
  // Хвост, заглушенный по «<» посреди реплики: копится, чтобы в finish() достать
  // из него tool-вызов («Un moment. <invoke…» — аудит 28.08, H4: без этого
  // переключение языка терялось, клиент слышал обрывок и мёртвый эфир).
  private tail = "";
  // Недописанное последнее слово (см. splitTrailingWord). Отдаётся на границе или в finish().
  private hold = "";

  constructor(private toolNames: ReadonlySet<string>) {}

  /** Уже глушим? (для раннего выхода вызывающего кода) */
  get blockedNow(): boolean { return this.blocked; }
  /** Хоть что-то реально ушло в TTS? */
  get spokeSomething(): boolean { return this.spoken.length > 0; }
  /** Сколько символов озвучено. Короткий зачин («Sigur. », «Da. ») перед
   * заглушенным XML — НЕ полноценная реплика: извинение всё равно нужно
   * (аудит TLX 28.08: зачин обезоруживал страховку, клиент слышал обрывок). */
  get spokenChars(): number { return this.spoken.length; }
  /** Копится ли заглушенный хвост с кандидатом на спасение тула? Пока да —
   * извинение и abort рано: спасение (end_call/language) важнее секунды тишины. */
  get hasTail(): boolean { return this.tail.length > 0; }
  /** Мы подавили текст? (тогда молчание в конце лечится извинением) */
  get suppressed(): boolean { return this.suppressedAny; }

  /** Скармливает дельту; возвращает, что можно озвучить/вызвать СЕЙЧАС. */
  push(rawDelta: string, force = false): TtsGateOut {
    const out: TtsGateOut = { speech: "", toolCall: null };
    const delta = stripMarkdownForTts(rawDelta);
    if (this.blocked) {
      if (delta) this.suppressedAny = true;
      if (this.tail) this.tail = (this.tail + delta).slice(0, 4000);
      else {
        // Блок по ЯЗЫКУ, а XML пришёл позже: «Що вас цікавить? <invoke language_detection…»
        // (ревью 02.09). Копим хвост с первого «<» — иначе переключение языка теряется
        // и клиент остаётся в том же круге. До «<» ничего не копим: hasTail лишь
        // откладывает извинение, а чистый текст спасать нечем.
        const lt = delta.indexOf("<");
        if (lt >= 0) this.tail = delta.slice(lt, lt + 4000);
      }
      return out;
    }

    if (!this.leadDone) {
      this.lead += delta;
      const s = this.lead.trimStart();
      // Речь никогда не начинается с «<» — любое ведущее «<» = разметка
      // (<invoke, <function_calls>, <tool_use>...). Держим до конца и решаем.
      if (s.startsWith("<")) {
        if (!force) return out;
        this.leadDone = true;
        this.lead = "";
        const call = rescuableCall(parseInvokeToolCall(s), this.toolNames);
        if (call) {
          out.toolCall = call;
        } else {
          // Неспасаемый тул или непарсибельная разметка — глушим, не озвучиваем.
          this.blocked = true;
          this.suppressedAny = true;
        }
        return out;
      }
      if (force || !couldBeThinkingAloud(this.lead) || this.lead.length >= 120 || /[.!?…][")]?(\s|$)/.test(this.lead)) {
        const cleaned = stripLeadingGreeting(stripThinkingAloud(this.lead));
        this.leadDone = true;
        this.lead = "";
        const { emit, keep } = force ? { emit: cleaned, keep: "" } : splitTrailingWord(cleaned);
        this.hold = keep;
        if (emit && violatesLanguagePolicy(emit)) {
          this.blocked = true;
          this.suppressedAny = true;
          return out;
        }
        if (emit) {
          this.spoken = emit;
          out.speech = emit;
        }
      }
      return out;
    }

    if (!delta && !(force && this.hold)) return out;
    // «<» посреди реплики: до него — обычная речь, после — глушим навсегда.
    const lt = delta.indexOf("<");
    const sayable = lt >= 0 ? delta.slice(0, lt) : delta;
    // Перед «<» и при force слово точно закончено — держать нечего.
    const { emit, keep } = lt >= 0 || force
      ? { emit: this.hold + sayable, keep: "" }
      : splitTrailingWord(this.hold + sayable);
    this.hold = keep;
    const candidate = this.spoken + emit;
    if (violatesLanguagePolicy(candidate)) {
      this.blocked = true;
      this.suppressedAny = true;
      if (lt >= 0) this.tail = delta.slice(lt, lt + 4000);
      return out;
    }
    if (lt >= 0) {
      this.blocked = true;
      this.suppressedAny = true;
      this.tail = delta.slice(lt);
    }
    if (emit) {
      this.spoken = candidate;
      out.speech = emit;
    }
    return out;
  }

  /** Конец стрима: дожать lead-буфер и вытащить tool-вызов из заглушенного хвоста. */
  finish(): TtsGateOut {
    const out = this.push("", true);
    if (!out.toolCall && this.tail) {
      const call = rescuableCall(parseInvokeToolCall(this.tail), this.toolNames);
      this.tail = "";
      if (call) out.toolCall = call;
    }
    return out;
  }
}

// Limba scuzei de avarie = limba VOCII curente (nu a apelantului): fraza continuă
// conversația prin TTS — o scuză RO într-un dialog rusesc derapează și ASR-ul
// (incident TLX 24.08, portat). Prioritate: ultimul language_detection al
// asistentului → ultima replică assistant cu perechi de litere concludente
// (cyr+lat≥4 și |cyr−lat|≥3) → scorul replicilor user → RO.
// Se calculează ÎNAINTE de try: un throw în catch = agent mut.
const APOLOGY_RU = "Извините, небольшая техническая проблема. Повторите, пожалуйста?";
const APOLOGY_RO = "Îmi cer scuze, am o mică problemă tehnică. Puteți repeta, vă rog?";

export function apologyFor(messages: OpenAIMessage[]): string {
  return voiceLanguage(messages) === "ru" ? APOLOGY_RU : APOLOGY_RO;
}

/** Limba VOCII curente, dedusă deterministic din istoric. Semnalul de agent cel mai
 *  recent câștigă: `transfer_to_agent` = rusă (invariantul «o singură predare, RO→RU,
 *  agent_number: 0» e documentat la scurtătura din api/chat/completions.ts — un al
 *  doilea transfer, de ex. spre un operator uman, sparge AMBELE locuri) sau
 *  `language_detection` cu limba lui; apoi ultima replică assistant concludentă;
 *  apoi scorul replicilor user; altfel RO. */
export function voiceLanguage(messages: OpenAIMessage[]): "ro" | "ru" {
  try {
    // Cedilele ş/ţ (U+015F, U+0163) NU sunt același caracter cu ș/ț cu virgulă —
    // ASR-ul și sursele vechi le produc des. Fără ele o replică românească plină
    // de „şi"/„preţ" își pierde literele latine și decizia alunecă spre rusă.
    const letters = (s: string) => ({
      cyr: (s.match(/[а-яё]/gi) ?? []).length,
      lat: (s.match(/[a-zăâîșțşţ]/gi) ?? []).length,
    });
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      for (const tc of m.tool_calls ?? []) {
        if (tc.function?.name === "transfer_to_agent") return "ru";
        if (tc.function?.name === "language_detection") {
          try {
            const lang = String(JSON.parse(tc.function.arguments || "{}").language ?? "");
            if (lang.startsWith("ru")) return "ru";
            if (lang.startsWith("ro")) return "ro";
          } catch { /* prioritatea următoare */ }
        }
      }
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const text = contentToText(m.content);
      if (!text) continue;
      const { cyr, lat } = letters(text);
      if (cyr + lat >= 4 && Math.abs(cyr - lat) >= 3) return cyr > lat ? "ru" : "ro";
      break; // ultima replică nu decide clar → scorul user-ilor
    }
    let cyrU = 0;
    let latU = 0;
    for (const m of messages) {
      if (m.role !== "user") continue;
      const { cyr, lat } = letters(contentToText(m.content));
      cyrU += cyr;
      latU += lat;
    }
    if (cyrU > latU) return "ru";
  } catch { /* RO mai jos */ }
  return "ro";
}

// Apel real 30.08 (conv_3101m18kxmbce2br16snwy8detmc): la un «Да.» chirilizat de ASR
// modelul a citit driver_line_ru deși clientul vorbea română — pentru el a fost
// selecție de câmp, nu schimbare de limbă, deci regula limbii din prompt nu l-a
// oprit. Cât timp clientul vorbește DOVEDIT română, câmpurile _ru se taie din
// rezultatele tool: ce nu ajunge la model nu poate fi rostit. Sens unic (ro→ru);
// _ro nu se taie niciodată.
//
// Poarta cere AMBELE dovezi. Auditul din 30.08 (replay pe 233 de transcripturi
// reale) a arătat că poarta doar pe replica agentului tăia _ru la 10 apelanți
// ruși REALI pentru 1 caz de bug: salutul e mereu românesc, iar tura de comutare
// e mută, deci «ultima replică assistant» rămâne ro exact când rusul e servit.
//  1. nicio fază rusească stabilită (voiceLanguage = ro);
//  2. ultima replică user cu limbă determinabilă e românească — langOfUtterance
//     cere cuvinte de serviciu și întoarce null pe «Да.»/«Алло»/toponime; peste
//     replicile ambigue se sare. Niciun user concludent => nu tăiem (partea sigură).
//
// ATENȚIE cache: poarta reevaluează istoria la fiecare tură și o rescrie RETROACTIV
// (o frază rusească întoarce _ru și în tool-result-urile vechi). Azi e gratuit —
// messages nu se cache-uiesc. Un breakpoint de cache pe messages se poate adăuga
// DOAR împreună cu fixarea deciziei porții pe prima tură a apelului (perf 30.08).
function shouldStripRu(messages: OpenAIMessage[]): boolean {
  try {
    if (voiceLanguage(messages) !== "ro") return false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "user") continue;
      const text = contentToText(m.content);
      // Replică rusească (cu markeri) respinsă de vetoul ucrainean (UA_WORDS a
      // crescut la 25, review 02.09): omul NU vorbește română, deci nu sărim peste
      // ea spre o replică românească mai veche — aia ar tăia câmpurile _ru unui
      // client rus. «Алло»/«Да» fără marker rămân ambigue și se sar ca înainte.
      if (vetoedRussian(text)) return false;
      const lang = langOfUtterance(text);
      if (lang) return lang === "ro";
    }
  } catch { /* fără dovadă = fără tăiere */ }
  return false;
}

// Doar sufixul `_ru`, nu cheia goală `ru`: did_you_mean din unknownLocalityResponse
// trimite DINADINS ambele grafii {ro, ru} — modelul potrivește după varianta ru o
// localitate transcrisă cu chirilice. Ea trebuie să supraviețuiască tăierii.
function dropRuKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropRuKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.endsWith("_ru")) continue;
      out[k] = dropRuKeys(val);
    }
    return out;
  }
  return v;
}

export function stripRuToolFields(messages: OpenAIMessage[]): OpenAIMessage[] {
  if (!shouldStripRu(messages)) return messages;
  return messages.map((m) => {
    if (m.role !== "tool") return m;
    try {
      const text = contentToText(m.content);
      if (!text.includes("_ru")) return m;
      return { ...m, content: JSON.stringify(dropRuKeys(JSON.parse(text))) };
    } catch {
      return m; // conținut ne-JSON (mesaj de eroare) — rămâne cum e
    }
  });
}
