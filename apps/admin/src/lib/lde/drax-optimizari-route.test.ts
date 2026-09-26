import { describe, it, expect } from 'vitest';
import { ruleaza, laRaspuns, type DepsDrax, type RandDrax } from './drax-ruta';
import { fixtureDrax } from './drax-fixture.test-util';

// Contractul rutei /api/cron/drax-optimizari (F3, criticul Codex C1): verifyCronSecret PRIMUL, înaintea oricărui acces.
type Auth = { status: number; auth: true };
const fals = (rand: RandDrax | null | 'arunca' = { id: '1', saptamina: '2026-09-14', rulat_la: '2026-09-21T06:00:00Z', alerta_trimisa_la: null, date: fixtureDrax() }) => {
  const n = { baza: 0, telegram: 0, revendicare: 0, sapt: '' };
  const d: DepsDrax<Auth> = {
    verifyCronSecret: (req) => (req.headers.get('authorization') === 'Bearer bun' ? null : { status: 401, auth: true }),
    saptaminaLunii: (c) => { if (!c) return '2026-09-21'; const x = new Date(`${c}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7); return x.toISOString().slice(0, 10); },
    citesteRand: async (s) => { n.baza++; n.sapt = s; if (rand === 'arunca') throw new Error('baza căzută'); return rand; },
    imagine: async () => { n.baza++; return Buffer.from('png'); },
    trimitePoster: async () => { n.telegram++; return { trimis: true }; },
    indicatii: () => 'text', trimiteIndicatii: async () => { n.telegram++; return { trimis: true }; },
    textTimpLiber: () => 'mesaj', trimiteOdata: async () => { n.revendicare++; n.telegram++; return { trimis: true }; },
  };
  return { n, d };
};
const req = (qs: string, auth?: string) => ({ url: `https://x/api/cron/drax-optimizari${qs ? `?${qs}` : ''}`, headers: new Headers(auth ? { authorization: auth } : {}) });

describe('drax-optimizari', () => {
  it('C1: fără secret sau cu secret greșit → 401 în ORICE mod, zero acces la bază, Telegram sau revendicare', async () => {
    for (const qs of ['', 'poster=1', 'poster=1&force=1', 'indicatii=1', 'liber=1', 'liber=1&dry=1', 'poster=1&liber=1', 'saptamina=x'])
      for (const auth of [undefined, 'Bearer rau', 'bun']) {
        const { n, d } = fals();
        const r = await ruleaza(req(qs, auth), d);
        expect(r).toEqual({ status: 401, auth: true });
        expect([n.baza, n.telegram, n.revendicare]).toEqual([0, 0, 0]);
      }
  });
  it('combinațiile nevalide → 400 fără acces la bază; PNG implicit nu trimite nimic', async () => {
    for (const qs of ['poster=1&liber=1', 'send=1', 'saptamina=2026-9-14', 'dry=1']) {
      const { n, d } = fals(); const r = await ruleaza(req(qs, 'Bearer bun'), d);
      expect((r as { status: number }).status).toBe(400); expect(n.baza).toBe(0);
    }
    const { n, d } = fals(); const r = await ruleaza(req('saptamina=2026-09-14', 'Bearer bun'), d);
    expect((r as { png?: Buffer }).png).toBeTruthy(); expect(n.telegram).toBe(0); expect(n.revendicare).toBe(0);
  });
  it('?liber=1&dry=1 fără rând → 200 (apelul de luni nu pică); dry nu trimite și nu revendică', async () => {
    const f0 = fals(null);
    expect((await ruleaza(req('liber=1&dry=1', 'Bearer bun'), f0.d) as { status: number }).status).toBe(200);
    const f = fals(); const r = await ruleaza(req('liber=1&dry=1', 'Bearer bun'), f.d) as { body: { text: string } };
    expect(r.body.text).toBe('mesaj'); expect(f.n.telegram).toBe(0); expect(f.n.revendicare).toBe(0);
    for (const qs of ['poster=1&dry=1', 'indicatii=1&dry=1']) { const g = fals(); await ruleaza(req(qs, 'Bearer bun'), g.d); expect(g.n.telegram).toBe(0); }
  });
  it('?saptamina=<miercuri> citește lunea ei; o eroare după autentificare → 500', async () => {
    const f = fals(); await ruleaza(req('saptamina=2026-09-16', 'Bearer bun'), f.d); expect(f.n.sapt).toBe('2026-09-14');
    const g = fals('arunca'); expect((await ruleaza(req('liber=1&dry=1', 'Bearer bun'), g.d) as { status: number }).status).toBe(500);
  });
  it('fără rând, PNG → 404', async () => {
    const f = fals(null); expect((await ruleaza(req('', 'Bearer bun'), f.d) as { status: number }).status).toBe(404);
  });
  it('laRaspuns: PNG cu no-store, JSON cu status, răspunsul autentificării neatins', () => {
    class NR { b: unknown; status: number; headers: Record<string, string>;
      constructor(b: unknown, i?: { status?: number; headers?: Record<string, string> }) { this.b = b; this.status = i?.status ?? 200; this.headers = i?.headers ?? {}; }
      static json(b: unknown, i?: { status?: number }) { return new NR(JSON.stringify(b), { ...i, headers: { 'Content-Type': 'application/json' } }); } }
    const C = NR as unknown as Parameters<typeof laRaspuns<NR>>[1];
    const p = laRaspuns({ status: 200, png: Buffer.from('x') }, C); expect(p.headers['Cache-Control']).toBe('no-store');
    expect(laRaspuns({ status: 400, body: { error: 'e' } }, C).status).toBe(400);
    const a = new NR('', { status: 401 }); expect(laRaspuns(a, C)).toBe(a);
  });
});
