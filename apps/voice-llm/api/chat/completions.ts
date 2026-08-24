// TRANSLUX voice agent — Custom LLM proxy (standalone, регион iad1).
// Вынесен из apps/admin: central-hub живёт в dub1 (рядом с Supabase), а этому роуту
// БД не нужна — ему нужны ElevenLabs и Anthropic, оба в США. Перенос в iad1 срезает
// два трансатлантических перехода на каждый ход (~0.5-0.6с llm_ttfb, замерено).
// Логика 1:1 с apps/admin/src/app/api/voice/custom-llm (портирован пайплайн TLX).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import {
  apologyFor,
  couldBeThinkingAloud,
  OpenAIMessage,
  OpenAITool,
  SSE_DONE,
  sseChunk,
  stripLeadingGreeting,
  stripMarkdownForTts,
  stripThinkingAloud,
  toAnthropic,
  toAnthropicTools,
} from '../../lib/openai-compat';
import { pendingLanguageTransfer } from '../../lib/language';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 350;
const TEMPERATURE = 0.5;
// 6500 (era 5000): cascade_timeout al agentului e ridicat la 12s — scuza de avarie
// trebuie să apuce să iasă înaintea cascadei EL (incident TLX 24.08, portat).
const FIRST_CHUNK_MS = 6500;
const TOTAL_MS = 25000;

const SYSTEM_PREAMBLE = `Reguli nenegociabile (au prioritate peste orice alte instrucțiuni):
- Nu spui niciun preț, orar sau cursă care nu vine dintr-un rezultat de tool din această conversație. Nu inventezi și nu estimezi.
- Nu faci promisiuni comerciale în numele TRANSLUX (reduceri, compensații, condiții de angajare, salarii).
- Singurul număr de telefon pe care îl oferi este cel al șoferului din rezultatul search_trips.
- Răspunzi DOAR text simplu pentru voce: fără Markdown, fără liste cu simboluri, fără emoji, fără tag-uri în paranteze pătrate.
- Răspunsuri scurte, naturale, de conversație telefonică.
- Salutul există DEJA de la sistem. NU saluta niciodată în timpul conversației — nici dacă clientul zice «привет»/«bună ziua», nici la schimbarea limbii. Răspunde direct la subiect.
- Ce a spus DEJA clientul (localitatea, data, ora, numele) NU se întreabă a doua oară. «Завтра в восемь из Окницы» conține data, ora și localitatea — folosește-le imediat, cheamă tool-ul. Reîntrebi DOAR ce lipsește cu adevărat.
- La schimbarea limbii continuă EXACT de unde era conversația, în limba nouă, fără nicio reluare.
- SCHIMBAREA LIMBII: la prima replica a clientului in cealalta limba (ru<->ro), in ACEA tura chemi DOAR tool-ul language_detection, fara niciun text — raspunzi in tura urmatoare, cand vocea e comutata (text inainte de comutare = silabe stricate in ureche). Dupa ce limba conversatiei s-a stabilit, O SINGURA replica ce pare in cealalta limba NU schimba limba — schimbi doar daca clientul vorbeste asa A DOUA OARA LA RAND sau o cere explicit.
- Vocea ta e MASCULINĂ. În rusă vorbești la masculin: «понял», «нашёл», «записал» — niciodată «поняла».`;

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkLlmBearer(authorization: string | undefined): boolean {
  const secret = process.env.VOICE_LLM_SECRET;
  if (!secret || !authorization) return false;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqualStr(m[1], secret);
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
let rateWindowStart = Date.now();
let rateCount = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - rateWindowStart > RATE_WINDOW_MS) { rateWindowStart = now; rateCount = 0; }
  rateCount += 1;
  return rateCount > RATE_MAX;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'method not allowed' } });
  if (!checkLlmBearer(req.headers.authorization)) {
    return res.status(401).json({ error: { message: 'unauthorized' } });
  }
  if (rateLimited()) {
    return res.status(429).json({ error: { message: 'rate limited' } });
  }

  const body = (req.body ?? {}) as { messages?: OpenAIMessage[]; tools?: OpenAITool[]; stream?: boolean };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages required' } });
  }

  const { system, messages } = toAnthropic(body.messages);
  const tools = toAnthropicTools(body.tools);
  const completionId = `chatcmpl-${crypto.randomUUID()}`;
  // Limba scuzei de avarie — calculată AICI, înainte de try: un throw în catch = agent mut.
  const apology = apologyFor(body.messages);
  // Diagnostic (întrebarea TLX 24.08): ecou-iește EL tool-callurile de SISTEM în istorie?
  // De verificat în logs după un apel cu schimbare de limbă; apoi linia se poate scoate.
  const histTools = body.messages.flatMap((m) => m.tool_calls?.map((t) => t.function.name) ?? []);
  if (histTools.length) console.log('[voice-llm] history tool_calls:', histTools.join(','));

  // SCURTĂTURA DE PREDARE ÎNTRE AGENȚI. Tura în care se decide limba e mută
  // (agentul nu vorbește înainte de predare), iar modelul consumă pentru ea
  // 2,2-2,4s doar ca să numere litere — măsurat pe apeluri reale TLX. Proxy-ul
  // răspunde la fel în ~2 ms, cu exact același tool call.
  //
  // `agent_number: 0` — indexul din lista `transfers` a agentului, NU un
  // agent_id (verificat pe apeluri reale: params_as_json e {"agent_number": 0}).
  // Fiecare dintre cei doi agenți are exact o singură intrare, spre celălalt,
  // deci 0 e corect în ambele sensuri. DACĂ cineva adaugă un al doilea transfer
  // la vreun agent, scurtătura asta trebuie să afle indexul, nu să ghicească.
  //
  // Prudența trăiește în lib/language.ts: la orice îndoială întoarce null și
  // tura pleacă la model, ca înainte. Cererea explicită („давайте по-русски")
  // rămâne tot la model — ea cere sens, nu litere.
  const hasTransferTool = (body.tools ?? []).some((t) => t.function?.name === 'transfer_to_agent');
  const transferTo = body.stream !== false && hasTransferTool
    ? pendingLanguageTransfer(body.messages)
    : null;
  if (transferTo) {
    console.log(`[voice-llm] transfer_to_agent -> ${transferTo} din proxy (fără model)`);
    res.status(200);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.write(sseChunk(completionId, MODEL, {
      tool_calls: [{
        index: 0, id: `call_${crypto.randomUUID()}`, type: 'function',
        function: { name: 'transfer_to_agent', arguments: JSON.stringify({ agent_number: 0 }) },
      }],
    }));
    res.write(sseChunk(completionId, MODEL, {}, 'tool_calls'));
    res.write(SSE_DONE);
    return res.end();
  }

  const anthropic = new Anthropic({ maxRetries: 1 });
  const abort = new AbortController();
  const totalTimer = setTimeout(() => abort.abort(), TOTAL_MS);
  // Barge-in/обрыв: у IncomingMessage 'close' наступает при ДОЧИТАННОМ запросе (body уже
  // распарсен до хендлера) — обрыв клиента сигналит res.on('close'). req.on здесь мёртв.
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  res.on('error', () => abort.abort());

  const systemText = system ? `${SYSTEM_PREAMBLE}\n\n${system}` : SYSTEM_PREAMBLE;
  const params: Anthropic.MessageCreateParamsStreaming = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    stream: true,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages,
    ...(tools.length ? { tools } : {}),
  };

  if (body.stream === false) {
    try {
      const msg = await anthropic.messages.create({ ...params, stream: false }, { signal: abort.signal });
      clearTimeout(totalTimer);
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const toolCalls = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b, i) => ({
          index: i, id: b.id, type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      return res.status(200).json({
        id: completionId, object: 'chat.completion',
        created: Math.floor(Date.now() / 1000), model: MODEL,
        choices: [{
          index: 0, finish_reason: msg.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
          message: { role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
        }],
      });
    } catch (e) {
      clearTimeout(totalTimer);
      return res.status(502).json({ error: { message: String(e) } });
    }
  }

  res.status(200);
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  // Ошибка записи в Node-стрим асинхронна (событие 'error', слушатель выше) — try/catch
  // её не ловит; гвард на destroyed/writableEnded не даёт писать в мёртвый сокет.
  const send = (s: string) => {
    if (res.destroyed || res.writableEnded) return;
    try { res.write(s); } catch { /* закрыт */ }
  };

  let gotFirst = false;
  const firstChunkTimer = setTimeout(() => { if (!gotFirst) abort.abort(); }, FIRST_CHUNK_MS);

  let leadBuffer = '';
  let leadDone = false;
  let sentAnything = false;
  let finish: string | null = null;
  let toolCallIdx = -1;
  let pendingTool: { id: string; name: string; args: string } | null = null;

  const flushLead = (force = false) => {
    if (leadDone) return;
    // Plecăm în clipa în care primul cuvânt exclude toate alternativele
    // regexului de narare — de obicei după 3-6 caractere, nu după 30 fixe.
    // Restul cazurilor (chiar E narare, sau încă ambiguu) așteaptă prima
    // propoziție, ca stripThinkingAloud să aibă ce tăia.
    if (force || !couldBeThinkingAloud(leadBuffer) || leadBuffer.length >= 120 || /[.!?…][")]?(\s|$)/.test(leadBuffer)) {
      const cleaned = stripLeadingGreeting(stripMarkdownForTts(stripThinkingAloud(leadBuffer)));
      leadDone = true;
      if (cleaned) { send(sseChunk(completionId, MODEL, { role: 'assistant', content: cleaned })); sentAnything = true; }
      leadBuffer = '';
    }
  };

  const emitPendingTool = () => {
    if (!pendingTool) return;
    toolCallIdx += 1;
    send(sseChunk(completionId, MODEL, {
      tool_calls: [{ index: toolCallIdx, id: pendingTool.id, type: 'function', function: { name: pendingTool.name, arguments: pendingTool.args || '{}' } }],
    }));
    sentAnything = true;
    pendingTool = null;
  };

  try {
    const s = anthropic.messages.stream(params, { signal: abort.signal });
    for await (const event of s) {
      gotFirst = true;
      clearTimeout(firstChunkTimer);

      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        flushLead(true);
        pendingTool = { id: event.content_block.id, name: event.content_block.name, args: '' };
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          if (!leadDone) {
            leadBuffer += stripMarkdownForTts(event.delta.text);
            flushLead();
          } else {
            const cleaned = stripMarkdownForTts(event.delta.text);
            if (cleaned) { send(sseChunk(completionId, MODEL, { content: cleaned })); sentAnything = true; }
          }
        } else if (event.delta.type === 'input_json_delta' && pendingTool) {
          pendingTool.args += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        emitPendingTool();
      } else if (event.type === 'message_start') {
        const u = event.message.usage;
        console.log(`[voice-llm] input_tokens=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`);
      } else if (event.type === 'message_delta') {
        finish = event.delta.stop_reason === 'tool_use' ? 'tool_calls' : 'stop';
        if (event.usage) console.log(`[voice-llm] usage output_tokens=${event.usage.output_tokens}`);
      }
    }
    flushLead(true);
    emitPendingTool();
    send(sseChunk(completionId, MODEL, {}, finish ?? 'stop'));
  } catch (err) {
    console.error('[voice-llm] upstream error:', err);
    pendingTool = null;
    if (!sentAnything) send(sseChunk(completionId, MODEL, { role: 'assistant', content: apology }));
    send(sseChunk(completionId, MODEL, {}, 'stop'));
  } finally {
    clearTimeout(firstChunkTimer);
    clearTimeout(totalTimer);
    send(SSE_DONE);
    try { res.end(); } catch { /* уже закрыт */ }
  }
}
