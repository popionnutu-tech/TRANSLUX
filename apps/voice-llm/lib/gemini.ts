// Gemini Flash în spatele proxy-ului (ION-32, 22.09). Ion a ascultat agentul unui
// restaurant pe Gemini și a vrut modelul lor — dar ÎN proxy, nu nativ în
// ElevenLabs: garda orelor, poarta ro/ru și scuza de avarie trăiesc aici și n-ar
// exista pe un model legat direct.
//
// Google are un endpoint compatibil OpenAI; îl chemăm cu fetch, fără SDK. Istoria
// NU se trimite cum vine de la ElevenLabs: trece întâi prin toAnthropic (tăierea
// la MAX_HISTORY_MESSAGES, orfanele tool_result de la cap, replicile goale) și de
// acolo se întoarce în formă OpenAI — o singură curățenie pentru ambii furnizori.
//
// Evenimentele de aici hrănesc aceeași buclă ca stream-ul Anthropic: text →
// TtsGate → TimeGuard; tool call întreg → emis spre ElevenLabs.

import type Anthropic from '@anthropic-ai/sdk';
import type { OpenAITool } from './openai-compat';

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// Gemini 3 cere înapoi, pe fiecare apel de funcție din istorie, semnătura
// gândirii din tura în care a fost emis. ElevenLabs nu o păstrează (ecoul lui
// are doar id/nume/argumente), deci pe istoria reluată punem valoarea pe care
// Google o documentează pentru istorii fără semnătură.
export const SKIP_SIGNATURE = 'skip_thought_signature_validator';

type OAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
type OAIToolCall = {
  id: string; type: 'function';
  function: { name: string; arguments: string };
  extra_content?: { google: { thought_signature: string } };
};

function blockText(c: Anthropic.MessageParam['content']): string {
  if (typeof c === 'string') return c;
  return c.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlockParam).text).join('\n');
}

/** Istoria curățată de toAnthropic, înapoi în forma OpenAI pe care o citește Gemini. */
export function toGeminiMessages(system: string, messages: Anthropic.MessageParam[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const blocks = typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : m.content;
      const calls: OAIToolCall[] = blocks
        .filter((b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use')
        .map((b) => ({
          id: b.id, type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          extra_content: { google: { thought_signature: SKIP_SIGNATURE } },
        }));
      const text = blockText(m.content);
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    if (typeof m.content === 'string') { out.push({ role: 'user', content: m.content }); continue; }
    // Un mesaj user de la toAnthropic poate purta rezultate de tool ȘI text:
    // rezultatele pleacă primele, ca răspuns la apelurile din tura de dinainte.
    for (const b of m.content) {
      if (b.type === 'tool_result') {
        const c = typeof b.content === 'string' ? b.content : (b.content ?? []).map((x) => ('text' in x ? x.text : '')).join('');
        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: c || '(fără rezultat)' });
      }
    }
    const text = blockText(m.content);
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

export function geminiBody(opts: {
  model: string; system: string; messages: Anthropic.MessageParam[];
  tools: OpenAITool[] | undefined; maxTokens: number; temperature: number;
}) {
  const tools = (opts.tools ?? []).filter((t) => t.type === 'function' && t.function?.name);
  return {
    model: opts.model,
    messages: toGeminiMessages(opts.system, opts.messages),
    ...(tools.length ? { tools } : {}),
    // «low» e minimul acceptat pentru Gemini Flash cu gândire; la restaurant
    // cu el au venit pauzele pe care le acoperă umpluturile.
    reasoning_effort: 'low',
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}

export type ModelEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; args: string }
  | { kind: 'finish'; reason: 'tool_calls' | 'stop' }
  | { kind: 'usage'; input: number; output: number; cached: number };

/**
 * Parser SSE pur: primește bucăți de text așa cum vin din rețea (tăiate oriunde)
 * și dă evenimentele. Apelurile de funcție se strâng pe `index` și ies întregi la
 * finish_reason — argumentele pot veni în mai multe bucăți.
 */
export class GeminiStreamParser {
  private buf = '';
  private calls = new Map<number, { id: string; name: string; args: string }>();
  private finished = false;

  push(chunk: string): ModelEvent[] {
    this.buf += chunk;
    const events: ModelEvent[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { events.push(...this.end()); continue; }
      let j: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { j = JSON.parse(data); } catch { continue; }
      if (j.usage) {
        events.push({
          kind: 'usage',
          input: j.usage.prompt_tokens ?? 0,
          output: j.usage.completion_tokens ?? 0,
          cached: j.usage.prompt_tokens_details?.cached_tokens ?? 0,
        });
      }
      const ch = j.choices?.[0];
      if (!ch) continue;
      const d = ch.delta ?? {};
      if (typeof d.content === 'string' && d.content) events.push({ kind: 'text', text: d.content });
      for (const tc of d.tool_calls ?? []) {
        const i = typeof tc.index === 'number' ? tc.index : this.calls.size;
        const cur = this.calls.get(i) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        this.calls.set(i, cur);
      }
      if (ch.finish_reason) events.push(...this.end());
    }
    return events;
  }

  /** Închide stream-ul: apelurile strânse ies, apoi motivul de oprire — o singură dată. */
  end(): ModelEvent[] {
    if (this.finished) return [];
    this.finished = true;
    const events: ModelEvent[] = [...this.calls.keys()].sort((a, b) => a - b).map((i) => {
      const c = this.calls.get(i)!;
      return { kind: 'tool' as const, id: c.id || `call_${crypto.randomUUID()}`, name: c.name, args: c.args || '{}' };
    }).filter((e) => e.name);
    events.push({ kind: 'finish', reason: events.length ? 'tool_calls' : 'stop' });
    return events;
  }
}

export async function* geminiEvents(body: ReturnType<typeof geminiBody>, signal: AbortSignal): AsyncGenerator<ModelEvent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY lipsește');
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const parser = new GeminiStreamParser();
  const dec = new TextDecoder();
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const e of parser.push(dec.decode(value, { stream: true }))) yield e;
  }
  for (const e of parser.push('\n')) yield e;
  for (const e of parser.end()) yield e;
}
