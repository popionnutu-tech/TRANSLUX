// AI PBX — conversie OpenAI Chat Completions <-> Anthropic Messages.
// ElevenLabs vorbește doar formatul OpenAI; creierul nostru e Anthropic.
// Funcții pure, fără I/O — testabile izolat.

import type Anthropic from "@anthropic-ai/sdk";

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

// Limba scuzei de avarie = limba VOCII curente (nu a apelantului): fraza continuă
// conversația prin TTS — o scuză RO într-un dialog rusesc derapează și ASR-ul
// (incident TLX 24.08, portat). Prioritate: ultimul language_detection al
// asistentului → ultima replică assistant cu perechi de litere concludente
// (cyr+lat≥4 și |cyr−lat|≥3) → scorul replicilor user → RO.
// Se calculează ÎNAINTE de try: un throw în catch = agent mut.
const APOLOGY_RU = "Извините, небольшая техническая проблема. Повторите, пожалуйста?";
const APOLOGY_RO = "Îmi cer scuze, am o mică problemă tehnică. Puteți repeta, vă rog?";

export function apologyFor(messages: OpenAIMessage[]): string {
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
        if (tc.function?.name === "language_detection") {
          try {
            const lang = String(JSON.parse(tc.function.arguments || "{}").language ?? "");
            if (lang.startsWith("ru")) return APOLOGY_RU;
            if (lang.startsWith("ro")) return APOLOGY_RO;
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
      if (cyr + lat >= 4 && Math.abs(cyr - lat) >= 3) return cyr > lat ? APOLOGY_RU : APOLOGY_RO;
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
    if (cyrU > latU) return APOLOGY_RU;
  } catch { /* RO mai jos */ }
  return APOLOGY_RO;
}
