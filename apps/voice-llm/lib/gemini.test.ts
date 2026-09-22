import { describe, it, expect } from 'vitest';
import { GeminiStreamParser, SKIP_SIGNATURE, geminiBody, toGeminiMessages } from './gemini';
import { toAnthropic } from './openai-compat';

const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
const chunk = (delta: unknown, finish_reason: string | null = null) => sse({ choices: [{ index: 0, delta, finish_reason }] });

describe('GeminiStreamParser', () => {
  it('textul iese pe măsură ce vine, chiar tăiat la mijlocul unei linii', () => {
    const p = new GeminiStreamParser();
    const raw = chunk({ content: 'Bună' }) + chunk({ content: ' ziua' }) + chunk({}, 'stop') + 'data: [DONE]\n\n';
    const events = [raw.slice(0, 17), raw.slice(17, 40), raw.slice(40)].flatMap((c) => p.push(c));
    expect(events.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text).join('')).toBe('Bună ziua');
    expect(events.filter((e) => e.kind === 'finish')).toEqual([{ kind: 'finish', reason: 'stop' }]);
  });

  it('argumentele unui tool venite în bucăți ies într-un singur apel întreg', () => {
    const p = new GeminiStreamParser();
    const ev = [
      ...p.push(chunk({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'search_trips', arguments: '{"from":"Bălți",' } }] })),
      ...p.push(chunk({ tool_calls: [{ index: 0, function: { arguments: '"to":"Ocnița"}' } }] })),
      ...p.push(chunk({}, 'tool_calls')),
    ];
    expect(ev).toEqual([
      { kind: 'tool', id: 'c1', name: 'search_trips', args: '{"from":"Bălți","to":"Ocnița"}' },
      { kind: 'finish', reason: 'tool_calls' },
    ]);
  });

  it('finish_reason și [DONE] nu dau două opriri', () => {
    const p = new GeminiStreamParser();
    const ev = [...p.push(chunk({ content: 'Da' }, 'stop')), ...p.push('data: [DONE]\n\n'), ...p.end()];
    expect(ev.filter((e) => e.kind === 'finish')).toHaveLength(1);
  });

  it('usage se raportează cu tokenii din cache', () => {
    const p = new GeminiStreamParser();
    const ev = p.push(sse({ choices: [], usage: { prompt_tokens: 9000, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 8000 } } }));
    expect(ev).toEqual([{ kind: 'usage', input: 9000, output: 12, cached: 8000 }]);
  });

  it('o linie stricată nu oprește stream-ul', () => {
    const p = new GeminiStreamParser();
    expect(p.push('data: {nu e json\n' + chunk({ content: 'ok' }))).toEqual([{ kind: 'text', text: 'ok' }]);
  });
});

describe('toGeminiMessages', () => {
  // Forma în care ElevenLabs trimite istoria: salut, întrebare, tool call, rezultat, întrebare.
  const el = [
    { role: 'system', content: 'Ești Cristina.' },
    { role: 'assistant', content: 'Bună ziua!' },
    { role: 'user', content: 'Mâine din Bălți la Ocnița' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_trips', arguments: '{"from":"Bălți"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: '{"departures_ro":"opt fix"}' },
    { role: 'user', content: 'Și la ce oră?' },
  ] as Parameters<typeof toAnthropic>[0];

  it('păstrează ordinea apel → rezultat → întrebare și pune semnătura pe apelul reluat', () => {
    const { system, messages } = toAnthropic(el);
    const out = toGeminiMessages(`PRE\n\n${system}`, messages);
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'user']);
    const call = out[2] as { tool_calls: { extra_content: { google: { thought_signature: string } } }[] };
    expect(call.tool_calls[0].extra_content.google.thought_signature).toBe(SKIP_SIGNATURE);
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"departures_ro":"opt fix"}' });
    expect(out[0]).toEqual({ role: 'system', content: 'PRE\n\nEști Cristina.' });
  });

  it('corpul cererii: reasoning low, stream cu usage, tool-urile ElevenLabs neschimbate', () => {
    const { messages } = toAnthropic(el);
    const tools = [{ type: 'function' as const, function: { name: 'search_trips', parameters: { type: 'object', properties: {} } } }];
    const b = geminiBody({ model: 'gemini-3.7-flash', system: 's', messages, tools, maxTokens: 350, temperature: 0.5 });
    expect(b.reasoning_effort).toBe('low');
    expect(b.stream_options).toEqual({ include_usage: true });
    expect(b.tools).toEqual(tools);
  });
});
