/**
 * Gard global de rețea pentru testele botului (montat prin `setupFiles` în vitest.config.ts).
 *
 * Testele nu au voie să atingă nimic real: nici Supabase, nici Telegram, nici Anthropic.
 * Modulele sunt înlocuite prin `vi.mock` în fiecare fișier e2e, dar un `fetch` scăpat
 * (ex. `notifyTelegram` din db.ts cu un token nevid, sau un serviciu nou care cheamă
 * direct o adresă) ar ieși tăcut spre internet. Aici `globalThis.fetch` e înlocuit cu o
 * funcție care lasă să treacă DOAR serverul local al testelor (`http://127.0.0.1:<port>`,
 * vezi src/test/server.ts) și aruncă «scurgere spre rețea» pentru orice altă adresă.
 *
 * Se instalează la nivel de modul, nu într-un `beforeAll`, intenționat: fișierele e2e
 * capturează `const realFetch = globalThis.fetch` la import (înainte de orice hook) și
 * își pun propriul înveliș peste el (Telegram capturat în liste, 127.0.0.1 permis). Dacă
 * gardul s-ar monta abia în `beforeAll`, `realFetch` ar fi fetch-ul adevărat și învelișul
 * testului l-ar ocoli. Montat la import, gardul rămâne stratul de jos sub orice înveliș, iar
 * `vi.unstubAllGlobals()` din `afterAll` revine tot la gard, nu la fetch-ul real.
 *
 * `HTTPS_PROXY`/`HTTP_PROXY` spre 127.0.0.1:9 (cum cere spec-ul) nu ajută aici: fetch-ul
 * din Node 22 (undici) ignoră variabilele de proxy. Gardul de mai jos e cel care taie.
 */

export const NETWORK_GUARD_MESSAGE = 'scurgere spre rețea în test';

const realFetch: typeof fetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

export function isLocalTestUrl(url: string): boolean {
  return url.startsWith('http://127.0.0.1:');
}

const guardedFetch: typeof fetch = async (input, init) => {
  const url = urlOf(input);
  if (!isLocalTestUrl(url)) throw new Error(`${NETWORK_GUARD_MESSAGE}: ${url}`);
  return realFetch(input, init);
};

Object.defineProperty(guardedFetch, 'name', { value: 'guardedFetch' });
globalThis.fetch = guardedFetch;
