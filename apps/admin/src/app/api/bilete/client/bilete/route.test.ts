import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ION-275: biletele clientului direct din browser — doar din originile site-ului, initData în corp (text/plain), fără URL.
const apeluri: Array<{ initData: string | null }> = [];
vi.mock('@/lib/bilete/client-bilete', () => ({
  bileteleClientului: vi.fn(async (c: { initData: string | null }) => {
    apeluri.push({ initData: c.initData });
    return c.initData === 'bun' ? { ok: true, bilete: [{ cod: 'x' }], contact: null, istoric: [] } : { ok: false, status: 401, eroare: 'neautentificat' };
  }),
}));
vi.mock('@/lib/bilete/client-repo', () => ({ repoBileteClient: {} }));
vi.mock('@/lib/bilete/public', () => ({ BazaIndisponibilaError: class extends Error {} }));
vi.mock('@/lib/bilete/site-auth', () => ({ cheieSiteValida: (a: string | null) => a === 'Bearer CHEIE' }));

const { POST, OPTIONS } = await import('./route');
const URL_ = 'https://central-hub-md.vercel.app/api/bilete/client/bilete';
const req = (corp: string, h: Record<string, string>) => new NextRequest(URL_, { method: 'POST', body: corp, headers: h });

describe('ION-275: /api/bilete/client/bilete din browser', () => {
  afterEach(() => { apeluri.length = 0; });
  it('din translux.md, text/plain cu initData în corp → biletele, cu CORS exact și Vary', async () => {
    const r = await POST(req('bun', { origin: 'https://translux.md', 'content-type': 'text/plain' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://translux.md');
    expect(r.headers.get('vary')).toBe('Origin');
    expect(r.headers.get('access-control-allow-credentials')).toBeNull();
    expect((await r.json()).bilete).toHaveLength(1);
    expect(apeluri[0].initData).toBe('bun');
  });
  it('origine străină, fără cheie → 401 fără CORS și fără să atingă baza', async () => {
    const r = await POST(req('bun', { origin: 'https://rau.example', 'content-type': 'text/plain' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect(apeluri).toHaveLength(0);
  });
  it('din browser cu initData greșit → 401 (cu CORS, ca pagina să poată citi eroarea)', async () => {
    const r = await POST(req('rau', { origin: 'https://translux.md' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://translux.md');
  });
  it('corp prea mare → initData nul (nu se trimite mai departe un șir uriaș)', async () => {
    await POST(req('a'.repeat(5000), { origin: 'https://translux.md' }));
    expect(apeluri[0].initData).toBeNull();
  });
  it('calea serverului site-ului (cheie + antet) rămâne', async () => {
    const r = await POST(req('', { authorization: 'Bearer CHEIE', 'x-telegram-init-data': 'bun' }));
    expect(r.status).toBe(200);
    expect(apeluri[0].initData).toBe('bun');
  });
  it('OPTIONS: 204 cu CORS doar pentru originile site-ului', async () => {
    const bun = await OPTIONS(new NextRequest(URL_, { method: 'OPTIONS', headers: { origin: 'https://www.translux.md' } }));
    expect(bun.status).toBe(204);
    expect(bun.headers.get('access-control-allow-origin')).toBe('https://www.translux.md');
    const rau = await OPTIONS(new NextRequest(URL_, { method: 'OPTIONS', headers: { origin: 'https://rau.example' } }));
    expect(rau.headers.get('access-control-allow-origin')).toBeNull();
  });
});
