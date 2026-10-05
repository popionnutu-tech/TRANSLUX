import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { citestePlangerea, creeazaHandlerPlangere, rutaPlangere, PLANGERE_ASTEPTARE_MS } = await import('./plangere.js');
const { citestePlangere, creeazaPanouPlangeri } = await import('../services/panouPlangeri.js');

import type { BotContext, PlangereSesiune } from '../types.js';
import type { PanouPlangeri, RaspunsPlangere } from '../services/panouPlangeri.js';
import type { RezultatPanou } from '../services/panouBilete.js';

// ION-252 / ION-247: plângerea în bot — starea «aștept plângerea», mesajul (text, opțional poză), panoul.

const ACUM = Date.parse('2026-10-14T16:00:00Z');
const COD = 'ab'.repeat(16);
const ME = 555;
const asteptare = (o: Partial<PlangereSesiune> = {}): PlangereSesiune => ({ cod: COD, lang: 'ro', expiraLa: ACUM + PLANGERE_ASTEPTARE_MS, ...o });

describe('rutaPlangere', () => {
  const baza = { privat: true, asteptare: asteptare(), text: 'șoferul a fumat', nowMs: ACUM };
  it('privat, cu așteptare valabilă → plângerea', () => {
    expect(rutaPlangere(baza)).toBe('plangere');
    expect(rutaPlangere({ ...baza, text: null })).toBe('plangere'); // poză fără text
  });
  it('fără așteptare sau în grup → mai departe', () => {
    expect(rutaPlangere({ ...baza, asteptare: undefined })).toBe('mai_departe');
    expect(rutaPlangere({ ...baza, privat: false })).toBe('mai_departe');
  });
  it('așteptarea expirată sau o comandă → ieșire din așteptare', () => {
    expect(rutaPlangere({ ...baza, nowMs: ACUM + PLANGERE_ASTEPTARE_MS + 1 })).toBe('iesire');
    expect(rutaPlangere({ ...baza, text: '/start' })).toBe('iesire');
  });
});

describe('citestePlangerea', () => {
  it('textul (tăiat la 2000) e plângerea, cu poza mesajului sau cea păstrată', () => {
    expect(citestePlangerea({ text: '  a fumat  ', fotoFileId: null })).toEqual({ tip: 'trimite', text: 'a fumat', fotoFileId: null });
    expect(citestePlangerea({ text: 'x'.repeat(5000), fotoFileId: 'F1' })).toEqual({ tip: 'trimite', text: 'x'.repeat(2000), fotoFileId: 'F1' });
    expect(citestePlangerea({ text: 'a fumat', fotoFileId: null }, 'F0')).toEqual({ tip: 'trimite', text: 'a fumat', fotoFileId: 'F0' });
  });
  it('poza fără text → se păstrează, se cere textul; altceva → nesuportat', () => {
    expect(citestePlangerea({ text: null, fotoFileId: 'F1' })).toEqual({ tip: 'asteapta_text', fotoFileId: 'F1' });
    expect(citestePlangerea({ text: '   ', fotoFileId: null })).toEqual({ tip: 'nesuportat' });
  });
});

function panouFals(r: RezultatPanou<RaspunsPlangere> = { tip: 'raspuns', raspuns: { tip: 'primita' } }) {
  return { plangere: vi.fn(async () => r) } satisfies PanouPlangeri;
}

function ctxMesaj(o: { text?: string; caption?: string; photo?: string[]; session: Record<string, unknown>; mesajId?: number; chat?: string }) {
  const replies: string[] = [];
  const ctx = {
    chat: { type: o.chat ?? 'private', id: ME },
    from: { id: ME, language_code: 'ro' },
    message: {
      message_id: o.mesajId ?? 77,
      ...(o.text !== undefined ? { text: o.text } : {}),
      ...(o.caption !== undefined ? { caption: o.caption } : {}),
      ...(o.photo ? { photo: o.photo.map((file_id) => ({ file_id })) } : {}),
    },
    session: o.session,
    reply: vi.fn(async (t: string) => { replies.push(t); }),
  };
  return { ctx: ctx as unknown as BotContext, replies };
}

describe('handlerul plângerii', () => {
  it('textul așteptat → panoul (cont din ctx.from, comanda din sesiune, message_id), «a ajuns la noi», așteptarea se închide', async () => {
    const panou = panouFals();
    const session: Record<string, unknown> = { plangere: asteptare() };
    const f = ctxMesaj({ text: 'Șoferul a vorbit la telefon tot drumul', session });
    const next = vi.fn();
    await creeazaHandlerPlangere({ panou, now: () => ACUM })(f.ctx, next);
    expect(panou.plangere).toHaveBeenCalledWith({ telegramId: ME, cod: COD, text: 'Șoferul a vorbit la telefon tot drumul', fotoFileId: null, mesajId: 77 });
    expect(f.replies).toEqual(['Plângerea ta a ajuns la noi. Mulțumim!']);
    expect(session.plangere).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });
  it('poza cu subtitlu → plângerea cu cea mai mare variantă a pozei', async () => {
    const panou = panouFals();
    const session: Record<string, unknown> = { plangere: asteptare() };
    await creeazaHandlerPlangere({ panou, now: () => ACUM })(ctxMesaj({ caption: 'scaun rupt', photo: ['mic', 'mare'], session }).ctx, vi.fn());
    expect(panou.plangere).toHaveBeenCalledWith(expect.objectContaining({ text: 'scaun rupt', fotoFileId: 'mare' }));
  });
  it('poza fără text → păstrată, se cere textul; textul următor pleacă împreună cu poza', async () => {
    const panou = panouFals();
    const session: Record<string, unknown> = { plangere: asteptare() };
    const h = creeazaHandlerPlangere({ panou, now: () => ACUM });
    const f1 = ctxMesaj({ photo: ['p1'], session });
    await h(f1.ctx, vi.fn());
    expect(panou.plangere).not.toHaveBeenCalled();
    expect(f1.replies).toEqual(['Am primit poza. Scrie-ne și în câteva cuvinte ce s-a întâmplat.']);
    await h(ctxMesaj({ text: 'murdar în salon', session, mesajId: 78 }).ctx, vi.fn());
    expect(panou.plangere).toHaveBeenCalledWith(expect.objectContaining({ text: 'murdar în salon', fotoFileId: 'p1', mesajId: 78 }));
  });
  it('plafonul de 3 pe zi (panoul) → textul plafonului, așteptarea se închide', async () => {
    const session: Record<string, unknown> = { plangere: asteptare() };
    const f = ctxMesaj({ text: 'a patra', session });
    await creeazaHandlerPlangere({ panou: panouFals({ tip: 'raspuns', raspuns: { tip: 'plafon' } }), now: () => ACUM })(f.ctx, vi.fn());
    expect(f.replies[0]).toMatch(/^Azi ai trimis deja 3 plângeri/);
    expect(session.plangere).toBeUndefined();
  });
  it('panoul indisponibil → «nu am putut», așteptarea RĂMÂNE (clientul poate retrimite)', async () => {
    const session: Record<string, unknown> = { plangere: asteptare() };
    const f = ctxMesaj({ text: 'ceva', session });
    await creeazaHandlerPlangere({ panou: panouFals({ tip: 'eroare', eroare: 'timeout' }), now: () => ACUM })(f.ctx, vi.fn());
    expect(f.replies[0]).toMatch(/^Nu am putut trimite plângerea acum/);
    expect(session.plangere).toBeDefined();
  });
  it('fără așteptare → next(), panoul nu e chemat', async () => {
    const panou = panouFals();
    const next = vi.fn();
    await creeazaHandlerPlangere({ panou, now: () => ACUM })(ctxMesaj({ text: 'salut', session: {} }).ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(panou.plangere).not.toHaveBeenCalled();
  });
  it('/start în așteptare → ieșire din așteptare și next()', async () => {
    const session: Record<string, unknown> = { plangere: asteptare() };
    const next = vi.fn();
    await creeazaHandlerPlangere({ panou: panouFals(), now: () => ACUM })(ctxMesaj({ text: '/start', session }).ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(session.plangere).toBeUndefined();
  });
  it('așteptarea expirată → next(), mesajul nu e plângere', async () => {
    const panou = panouFals();
    const session: Record<string, unknown> = { plangere: asteptare({ expiraLa: ACUM - 1 }) };
    const next = vi.fn();
    await creeazaHandlerPlangere({ panou, now: () => ACUM })(ctxMesaj({ text: 'ceva', session }).ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(panou.plangere).not.toHaveBeenCalled();
  });
  it('RU: răspunsul în limba din sesiune', async () => {
    const session: Record<string, unknown> = { plangere: asteptare({ lang: 'ru' }) };
    const f = ctxMesaj({ text: 'водитель курил', session });
    await creeazaHandlerPlangere({ panou: panouFals(), now: () => ACUM })(f.ctx, vi.fn());
    expect(f.replies).toEqual(['Ваша жалоба получена. Спасибо!']);
  });
});

describe('panouPlangeri — contractul cu panoul', () => {
  it('citestePlangere: ok / plafon / text; altă formă → null', () => {
    expect(citestePlangere({ ok: true })).toEqual({ tip: 'primita' });
    expect(citestePlangere({ ok: false, cod: 'plafon' })).toEqual({ tip: 'plafon' });
    expect(citestePlangere({ ok: false, cod: 'text' })).toEqual({ tip: 'text_invalid' });
    expect(citestePlangere({ ok: false, cod: 'altceva' })).toBeNull();
    expect(citestePlangere('ok')).toBeNull();
  });
  it('cererea: POST /api/bilete/plangere cu cheia botului și corpul din contract', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const panou = creeazaPanouPlangeri({ baseUrl: 'https://panou.test', apiKey: 'k'.repeat(64), fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await panou.plangere({ telegramId: ME, cod: COD, text: 'a fumat', fotoFileId: 'F1', mesajId: 9 });
    expect(r).toEqual({ tip: 'raspuns', raspuns: { tip: 'primita' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://panou.test/api/bilete/plangere');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'k'.repeat(64)}`);
    expect(JSON.parse(String(init.body))).toEqual({ telegram_id: ME, cod: COD, text: 'a fumat', foto_file_id: 'F1', mesaj_id: 9 });
  });
  it('plafonul vine cu 429 → tot rezultat de domeniu, nu eroare HTTP', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, cod: 'plafon' }), { status: 429 }));
    const panou = creeazaPanouPlangeri({ baseUrl: 'https://panou.test', apiKey: 'k'.repeat(64), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await panou.plangere({ telegramId: ME, cod: null, text: 'x', fotoFileId: null, mesajId: 1 })).toEqual({ tip: 'raspuns', raspuns: { tip: 'plafon' } });
  });
});
