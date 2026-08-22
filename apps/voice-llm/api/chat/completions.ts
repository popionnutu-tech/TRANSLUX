// TRANSLUX voice agent — Custom LLM proxy (standalone, регион iad1).
// Вынесен из apps/admin: central-hub живёт в dub1 (рядом с Supabase), а этому роуту
// БД не нужна — ему нужны ElevenLabs и Anthropic, оба в США. Перенос в iad1 срезает
// два трансатлантических перехода на каждый ход (~0.5-0.6с llm_ttfb, замерено).
// Логика 1:1 с apps/admin/src/app/api/voice/custom-llm (портирован пайплайн TLX).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import {
  looksLikeThinkingAloud,
  OpenAIMessage,
  OpenAITool,
  SSE_DONE,
  sseChunk,
  stripMarkdownForTts,
  stripThinkingAloud,
  toAnthropic,
  toAnthropicTools,
} from '../../lib/openai-compat';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 350;
const TEMPERATURE = 0.5;
const FIRST_CHUNK_MS = 5000;
const TOTAL_MS = 25000;

const APOLOGY = 'Îmi cer scuze, am o mică problemă tehnică. Puteți repeta, vă rog?';

const SYSTEM_PREAMBLE = `Reguli nenegociabile (au prioritate peste orice alte instrucțiuni):
- Nu spui niciun preț, orar sau cursă care nu vine dintr-un rezultat de tool din această conversație. Nu inventezi și nu estimezi.
- Nu faci promisiuni comerciale în numele TRANSLUX (reduceri, compensații, condiții de angajare, salarii).
- Singurul număr de telefon pe care îl oferi este cel al șoferului din rezultatul search_trips.
- Răspunzi DOAR text simplu pentru voce: fără Markdown, fără liste cu simboluri, fără emoji, fără tag-uri în paranteze pătrate.
- Răspunsuri scurte, naturale, de conversație telefonică.`;

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
    const narration = looksLikeThinkingAloud(leadBuffer);
    if (force || (!narration && leadBuffer.length >= 30) || leadBuffer.length >= 120 || /[.!?…][")]?(\s|$)/.test(leadBuffer)) {
      const cleaned = stripMarkdownForTts(stripThinkingAloud(leadBuffer));
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
    if (!sentAnything) send(sseChunk(completionId, MODEL, { role: 'assistant', content: APOLOGY }));
    send(sseChunk(completionId, MODEL, {}, 'stop'));
  } finally {
    clearTimeout(firstChunkTimer);
    clearTimeout(totalTimer);
    send(SSE_DONE);
    try { res.end(); } catch { /* уже закрыт */ }
  }
}
