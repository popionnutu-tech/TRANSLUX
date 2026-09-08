/**
 * Dovada că gardul global din vitest.setup.ts chiar taie rețeaua. Dacă gardul e
 * comentat, primul test încearcă un fetch real spre api.telegram.org (răspuns HTTP
 * sau eroare de conexiune — niciuna nu e mesajul gardului) și pică.
 */
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { describe, expect, it } from 'vitest';

const LEAK = /scurgere spre rețea în test/;

describe('Gardul global de rețea (vitest.setup.ts)', () => {
  it('fetch spre o adresă externă aruncă «scurgere spre rețea», fără să iasă din proces', async () => {
    const started = Date.now();
    await expect(fetch('https://api.telegram.org/botX/getMe')).rejects.toThrow(LEAK);
    await expect(fetch(new URL('https://zqkzqpfdymddsywxjxow.supabase.co/rest/v1/reports'))).rejects.toThrow(LEAK);
    await expect(fetch(new Request('https://api.anthropic.com/v1/messages', { method: 'POST' }))).rejects.toThrow(LEAK);
    // Refuzul e sincron-instant: nu s-a deschis nicio conexiune, nu s-a așteptat niciun DNS.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('localhost după nume și IPv6 sunt tot în afara gardului — doar 127.0.0.1 trece', async () => {
    await expect(fetch('http://localhost:1/')).rejects.toThrow(LEAK);
    await expect(fetch('http://[::1]:1/')).rejects.toThrow(LEAK);
  });

  it('serverul local al testelor pe 127.0.0.1 trece prin gard la fetch-ul real', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('gardul e stratul de jos: fetch-ul global e cel din setup, nu cel nativ', () => {
    expect(globalThis.fetch.name).toBe('guardedFetch');
  });
});
