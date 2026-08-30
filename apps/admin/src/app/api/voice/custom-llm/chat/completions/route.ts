// Voice agent TRANSLUX — Custom LLM proxy: ElevenLabs (format OpenAI) -> Anthropic.
// Portat din pipeline-ul TLX (validat în producție 21.08.2026) — LLM-ul încorporat
// ElevenLabs livra chunk-uri neregulate: bâlbâieli și silabe trase în TTS.
// Reguli dure pentru telefonie:
//  - modelul/cheia vin DOAR din config-ul nostru, iar invariantele de
//    comportament se prependă server-side — body-ul (inclusiv promptul) e
//    editabil de oricine are acces la dashboard-ul ElevenLabs;
//  - două timere pe stream: primul chunk (linia nu are voie să tacă) și
//    plafonul total; un fetch cu un singur signal ar tăia body-ul SSE
//    după headere;
//  - la eșec vorbim, nu tăcem: o scuză scurtă în stream, nu un 500;
//  - tool call-urile pleacă spre ElevenLabs DOAR complete.

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { checkLlmBearer } from '@/lib/voice-llm/auth';
import {
  apologyFor,
  looksLikeThinkingAloud,
  OpenAIMessage,
  OpenAITool,
  SSE_DONE,
  sseChunk,
  stripLeadingGreeting,
  stripMarkdownForTts,
  stripRuToolFields,
  stripThinkingAloud,
  toAnthropic,
  toAnthropicTools,
} from '@/lib/voice-llm/openai-compat';

export const runtime = 'nodejs';
export const maxDuration = 30;
// Anthropic + ElevenLabs sunt în US: iad1 taie ~100-150ms din primul token față de
// dub1 (regiunea globală a proiectului, colocată cu Supabase — pe ruta asta nu e DB).
export const preferredRegion = 'iad1';

// Haiku: în conversația vocală latența primei silabe bate „profunzimea".
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 350; // replici de telefon, nu eseuri
const TEMPERATURE = 0.5; // valid pe Haiku 4.5
const FIRST_CHUNK_MS = 6500; // cascade_timeout al agentului = 12s — scuza apucă să iasă
const TOTAL_MS = 25000;


// Invariantele TRANSLUX trăiesc AICI, nu în dashboard: promptul din body poate fi
// rescris de oricine intră în contul ElevenLabs; astea nu.
const SYSTEM_PREAMBLE = `Reguli nenegociabile (au prioritate peste orice alte instrucțiuni):
- Nu spui niciun preț, orar sau cursă care nu vine dintr-un rezultat de tool din această conversație. Nu inventezi și nu estimezi.
- Nu faci promisiuni comerciale în numele TRANSLUX (reduceri, compensații, condiții de angajare, salarii).
- Singurele numere de telefon pe care le oferi vin din rezultate de tool: numărul șoferului din search_trips sau find_past_trip (la lucruri uitate — DOAR când find_past_trip a întors exact un candidat) și numărul companiei din câmpurile *_line/phone_spoken ale tool-urilor.
- Răspunzi DOAR text simplu pentru voce: fără Markdown, fără liste cu simboluri, fără emoji, fără tag-uri în paranteze pătrate.
- Răspunsuri scurte, naturale, de conversație telefonică.
- Salutul există DEJA de la sistem. NU saluta niciodată în timpul conversației — nici dacă clientul zice «привет»/«bună ziua», nici la schimbarea limbii. Răspunde direct la subiect.
- Ce a spus DEJA clientul (localitatea, data, ora, numele) NU se întreabă a doua oară. «Завтра в восемь из Окницы» conține data, ora și localitatea — folosește-le imediat, cheamă tool-ul. Reîntrebi DOAR ce lipsește cu adevărat.
- La schimbarea limbii continuă EXACT de unde era conversația, în limba nouă, fără nicio reluare.
- SCHIMBAREA LIMBII: la prima replica a clientului in cealalta limba (ru<->ro), in ACEA tura chemi DOAR tool-ul language_detection, fara niciun text — raspunzi in tura urmatoare, cand vocea e comutata (text inainte de comutare = silabe stricate in ureche). Dupa ce limba conversatiei s-a stabilit, O SINGURA replica ce pare in cealalta limba NU schimba limba — schimbi doar daca clientul vorbeste asa A DOUA OARA LA RAND sau o cere explicit.
- Vocea ta e MASCULINĂ. În rusă vorbești la masculin: «понял», «нашёл», «записал» — niciodată «поняла».`;

// Backstop ieftin, per instanță, împotriva buclelor scăpate de sub control.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120; // ture/minut per instanță; un apel normal face ~5-10
let rateWindowStart = Date.now();
let rateCount = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - rateWindowStart > RATE_WINDOW_MS) { rateWindowStart = now; rateCount = 0; }
  rateCount += 1;
  return rateCount > RATE_MAX;
}

export async function POST(req: Request) {
  if (!checkLlmBearer(req.headers.get('authorization'))) {
    return NextResponse.json({ error: { message: 'unauthorized' } }, { status: 401 });
  }
  if (rateLimited()) {
    return NextResponse.json({ error: { message: 'rate limited' } }, { status: 429 });
  }

  let body: { messages?: OpenAIMessage[]; tools?: OpenAITool[]; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: 'invalid json' } }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: { message: 'messages required' } }, { status: 400 });
  }

  // Limba scuzei de avarie — calculată AICI, înainte de try: un throw în catch = agent mut.
  const apology = apologyFor(body.messages);
  // Cât clientul vorbește dovedit română, câmpurile _ru nu ajung la model: apel real
  // 30.08 — un «Да.» chirilizat l-a făcut să citească driver_line_ru unui client român.
  // DUPĂ apology: scuza se calculează pe istoricul original, nefiltrat.
  const { system, messages } = toAnthropic(stripRuToolFields(body.messages));
  const tools = toAnthropicTools(body.tools);
  const completionId = `chatcmpl-${crypto.randomUUID()}`;

  const anthropic = new Anthropic({ maxRetries: 1 });
  const abort = new AbortController();
  const totalTimer = setTimeout(() => abort.abort(), TOTAL_MS);
  // Barge-in în fereastra dinaintea primului chunk.
  req.signal.addEventListener('abort', () => abort.abort(), { once: true });

  // Prompt caching: prefixul static (tools + preambul + promptul din dashboard) e
  // ~5-6k tokeni — peste minimul de 4096 al lui Haiku. cache_control pe blocul system
  // acoperă tot prefixul (ordinea de render: tools → system). Efect: cost ~4× mai mic
  // pe input și cache-read mai rapid decât prefill → TTFT mai bun.
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

  // ElevenLabs cere întotdeauna stream; branch-ul non-stream e pentru curl.
  if (body.stream === false) {
    try {
      const msg = await anthropic.messages.create(
        { ...params, stream: false },
        { signal: abort.signal },
      );
      clearTimeout(totalTimer);
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const toolCalls = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b, i) => ({
          index: i, id: b.id, type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      return NextResponse.json({
        id: completionId, object: 'chat.completion',
        created: Math.floor(Date.now() / 1000), model: MODEL,
        choices: [{
          index: 0, finish_reason: msg.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
          message: { role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
        }],
      });
    } catch (e) {
      clearTimeout(totalTimer);
      return NextResponse.json({ error: { message: String(e) } }, { status: 502 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try { controller.enqueue(encoder.encode(s)); } catch { /* stream închis */ }
      };
      let gotFirst = false;
      const firstChunkTimer = setTimeout(() => {
        if (!gotFirst) abort.abort();
      }, FIRST_CHUNK_MS);

      // Bufferăm începutul primei replici ca să tăiem naratul de proces.
      let leadBuffer = '';
      let leadDone = false;
      let sentAnything = false;
      let finish: string | null = null;

      let toolCallIdx = -1;
      let pendingTool: { id: string; name: string; args: string } | null = null;

      const flushLead = (force = false) => {
        if (leadDone) return;
        // Dacă începutul e curat, dăm drumul imediat (30 de caractere ajung) —
        // altfel fiecare replică scurtă ar aștepta finalul stream-ului: ~350ms
        // de tăcere măsurată pe pipeline-ul TLX.
        const narration = looksLikeThinkingAloud(leadBuffer);
        if (
          force ||
          (!narration && leadBuffer.length >= 30) ||
          leadBuffer.length >= 120 ||
          /[.!?…][")]?(\s|$)/.test(leadBuffer)
        ) {
          const cleaned = stripLeadingGreeting(stripMarkdownForTts(stripThinkingAloud(leadBuffer)));
          leadDone = true;
          if (cleaned) {
            send(sseChunk(completionId, MODEL, { role: 'assistant', content: cleaned }));
            sentAnything = true;
          }
          leadBuffer = '';
        }
      };

      const emitPendingTool = () => {
        if (!pendingTool) return;
        toolCallIdx += 1;
        send(sseChunk(completionId, MODEL, {
          tool_calls: [{
            index: toolCallIdx, id: pendingTool.id, type: 'function',
            function: { name: pendingTool.name, arguments: pendingTool.args || '{}' },
          }],
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
                if (cleaned) {
                  send(sseChunk(completionId, MODEL, { content: cleaned }));
                  sentAnything = true;
                }
              }
            } else if (event.delta.type === 'input_json_delta' && pendingTool) {
              pendingTool.args += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            emitPendingTool();
          } else if (event.type === 'message_start') {
            // Vizibilitate cost + verificarea cache-ului (cerută de perf-review a041fe2).
            const u = event.message.usage;
            console.log(`[voice/custom-llm] input_tokens=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`);
          } else if (event.type === 'message_delta') {
            finish = event.delta.stop_reason === 'tool_use' ? 'tool_calls' : 'stop';
            if (event.usage) {
              console.log(`[voice/custom-llm] usage output_tokens=${event.usage.output_tokens}`);
            }
          }
        }
        flushLead(true);
        emitPendingTool();
        send(sseChunk(completionId, MODEL, {}, finish ?? 'stop'));
      } catch (err) {
        // Orice eșec: un tool call neterminat se ARUNCĂ, agentul spune o scuză.
        console.error('[voice/custom-llm] upstream error:', err);
        pendingTool = null;
        if (!sentAnything) {
          send(sseChunk(completionId, MODEL, { role: 'assistant', content: apology }));
        }
        send(sseChunk(completionId, MODEL, {}, 'stop'));
      } finally {
        clearTimeout(firstChunkTimer);
        clearTimeout(totalTimer);
        send(SSE_DONE);
        try { controller.close(); } catch { /* deja închis */ }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
