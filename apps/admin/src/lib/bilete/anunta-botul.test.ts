import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { anuntaBotul } = await import('./anunta-botul');

describe('ION-274: anuntaBotul', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('fără BOT_BASE_URL sau cu cheie scurtă → nu cheamă nimic', async () => {
    const f = vi.fn();
    vi.stubEnv('BOT_BASE_URL', ''); vi.stubEnv('BILETE_LIVRARE_KEY', 'k'.repeat(64));
    expect(await anuntaBotul('x', f as never)).toBe(false);
    vi.stubEnv('BOT_BASE_URL', 'https://bot.example'); vi.stubEnv('BILETE_LIVRARE_KEY', 'scurta');
    expect(await anuntaBotul('x', f as never)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('POST pe /bilete/v1/livreaza cu Bearer și checkout_id; eroarea de rețea nu aruncă', async () => {
    vi.stubEnv('BOT_BASE_URL', 'https://bot.example/'); vi.stubEnv('BILETE_LIVRARE_KEY', 'k'.repeat(64));
    const f = vi.fn(async () => new Response('{}', { status: 202 }));
    expect(await anuntaBotul('abc', f as never)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://bot.example/bilete/v1/livreaza');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'k'.repeat(64)}`);
    expect(JSON.parse(String(init.body))).toEqual({ checkout_id: 'abc' });
    expect(await anuntaBotul('abc', (async () => { throw new Error('ECONNRESET'); }) as never)).toBe(false);
  });
});
