// AI PBX — conversie OpenAI Chat Completions <-> Anthropic Messages.
// ElevenLabs vorbește doar formatul OpenAI; creierul nostru e Anthropic.
// Funcții pure, fără I/O — testabile izolat.

import type Anthropic from "@anthropic-ai/sdk";
import { langOfUtterance, vetoedRussian } from "./language";

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
