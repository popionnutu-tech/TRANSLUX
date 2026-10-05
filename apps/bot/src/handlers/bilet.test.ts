import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { codDinPayload, mesajBilet } = await import('./bilet.js');

describe('codDinPayload', () => {
  it('bilet_ + 32 hex → codul în litere mici', () => {
    expect(codDinPayload('bilet_0123456789ABCDEF0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
  });
  it('invitațiile personalului și formele greșite → null (merg pe ramura veche)', () => {
    expect(codDinPayload('abc123invite')).toBeNull();
    expect(codDinPayload('bilet_123')).toBeNull();
    expect(codDinPayload('bilet_0123456789abcdef0123456789abcdefXX')).toBeNull();
    expect(codDinPayload('xbilet_0123456789abcdef0123456789abcdef')).toBeNull();
    expect(codDinPayload(undefined)).toBeNull();
    expect(codDinPayload('')).toBeNull();
  });
});

describe('mesajBilet', () => {
  const c = { cod: 'ab'.repeat(16), status: 'platita', lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats: 2 };
  it('RO: cursa, ora Chișinăului, locurile, starea și linkul paginii RO', () => {
    const m = mesajBilet(c);
    expect(m.text).toContain('Briceni → Chișinău');
    expect(m.text).toContain('05:45');
    expect(m.text).toContain('locuri: 2');
    expect(m.text).toContain('Plătit');
    expect(m.url).toBe(`https://translux.md/ro/bilet/${c.cod}`);
  });
  it('RU: textul și pagina RU; stare necunoscută rămâne cum e', () => {
    const m = mesajBilet({ ...c, lang: 'ru', status: 'ceva_nou' });
    expect(m.text).toContain('мест: 2');
    expect(m.text).toContain('ceva_nou');
    expect(m.url).toBe(`https://translux.md/ru/bilet/${c.cod}`);
  });
});

describe('legarea și butonul «Returnează» (ION-244)', () => {
  const ME = 555;
  const COD = 'ab'.repeat(16);
  const comanda = (telegram_id: number | null, status = 'platita') => ({
    cod: COD, status, lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats: 1,
    telegram_id, trip_date: '2026-10-14', crm_route_id: 1655, going_north: false,
  });

  async function porneste(telegramDinBaza: number | null, legatDupaUpdate: number | null, status = 'platita') {
    const { handleBiletStart } = await import('./bilet.js');
    const replies: Array<{ text: string; butoane: string[] }> = [];
    const repo = {
      comandaDupaCod: vi.fn(async () => comanda(telegramDinBaza, status)),
      leagaComanda: vi.fn(async () => legatDupaUpdate),
      comenziLegate: vi.fn(async () => []),
      telefonSofer: vi.fn(async () => null),
    };
    const ctx = {
      chat: { type: 'private' }, from: { id: ME },
      reply: vi.fn(async (text: string, extra?: { reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> } }) => {
        replies.push({ text, butoane: (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? b.url ?? '') });
      }),
    };
    await handleBiletStart(ctx as never, COD, repo);
    return { replies, repo };
  }

  it('comanda nelegată → se leagă de contul care a deschis-o, cu butonul de returnare', async () => {
    const { replies, repo } = await porneste(null, ME);
    expect(repo.leagaComanda).toHaveBeenCalledWith(COD, ME);
    expect(replies[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`, `retur:cere:${COD}`]);
  });
  it('legată de ALT cont → biletul se arată, fără returnare, fără a o relega', async () => {
    const { replies, repo } = await porneste(999, 999);
    expect(repo.leagaComanda).not.toHaveBeenCalled();
    expect(replies[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`]);
    expect(replies[0].text).toMatch(/legat de alt cont Telegram/);
  });
  it('cursa: altcineva a legat-o între citire și UPDATE → tot fără returnare', async () => {
    const { replies } = await porneste(null, 999);
    expect(replies[0].butoane).not.toContain(`retur:cere:${COD}`);
  });
  it('comanda proprie dar neplătită → fără returnare', async () => {
    const { replies } = await porneste(ME, ME, 'anulata');
    expect(replies[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`]);
  });
});

describe('ION-248: QR-ul în chat și butonul «🎫 Bilete»', () => {
  // imaginea biletului vine de la panou; în teste panoul «nu răspunde» → botul trimite QR-ul simplu, fără rețea
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
  const ME = 555;
  const COD = 'cd'.repeat(16);
  const comanda = (telegram_id: number | null, status = 'platita', seats = 1) => ({
    cod: COD, status, lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats,
    telegram_id, trip_date: '2026-10-14', crm_route_id: 8, going_north: false,
  });
  const bilet = (nr: number, status = 'valid') => ({ nr, loc_nr: 10 + nr, cod_qr: `TLX-${nr}-ABCDEFGH`, status });

  async function porneste(o: { legat: number | null; status?: string; bilete?: ReturnType<typeof bilet>[]; personal?: boolean; sofer?: boolean }) {
    const { handleBiletStart } = await import('./bilet.js');
    const poze: { caption?: string }[] = [];
    const grup: { caption?: string }[][] = [];
    const meniu: unknown[] = [];
    const repo = {
      comandaDupaCod: vi.fn(async () => comanda(o.legat, o.status ?? 'platita', o.bilete?.length ?? 1)),
      leagaComanda: vi.fn(async () => o.legat),
      comenziLegate: vi.fn(async () => []),
      telefonSofer: vi.fn(async () => null),
      esteSofer: vi.fn(async () => !!o.sofer),
      bileteQr: vi.fn(async () => o.bilete ?? [bilet(1)]),
    };
    const ctx = {
      chat: { type: 'private', id: ME }, from: { id: ME }, dbUser: o.personal ? { id: 'u1' } : undefined,
      reply: vi.fn(async () => {}),
      replyWithPhoto: vi.fn(async (_f: unknown, extra?: { caption?: string }) => { poze.push(extra ?? {}); }),
      replyWithMediaGroup: vi.fn(async (m: { caption?: string }[]) => { grup.push(m); }),
      api: { setChatMenuButton: vi.fn(async (a: unknown) => { meniu.push(a); }) },
    };
    await handleBiletStart(ctx as never, COD, repo);
    return { poze, grup, meniu };
  }

  it('biletul propriu plătit, 1 loc → o poză QR cu cursa și locul', async () => {
    const { poze } = await porneste({ legat: ME });
    expect(poze).toHaveLength(1);
    expect(poze[0].caption).toMatch(/Briceni → Chișinău/);
    expect(poze[0].caption).toMatch(/Locul 11/);
    expect(poze[0].caption).toMatch(/Arată acest cod șoferului/);
  });
  it('3 locuri → album cu 3 QR-uri, «biletul 2 din 3»', async () => {
    const { grup, poze } = await porneste({ legat: ME, bilete: [bilet(1), bilet(2), bilet(3)] });
    expect(poze).toHaveLength(0);
    expect(grup[0]).toHaveLength(3);
    expect(grup[0][1].caption).toMatch(/biletul 2 din 3/);
  });
  it('biletul altui cont → fără QR, meniul de comenzi', async () => {
    const { poze, grup, meniu } = await porneste({ legat: 999 });
    expect(poze).toHaveLength(0);
    expect(grup).toHaveLength(0);
    expect(meniu[0]).toMatchObject({ menu_button: { type: 'commands' } });
  });
  it('comanda anulată / locurile deja urcate → fără QR', async () => {
    expect((await porneste({ legat: ME, status: 'anulata' })).poze).toHaveLength(0);
    expect((await porneste({ legat: ME, bilete: [bilet(1, 'urcat')] })).poze).toHaveLength(0);
  });
  it('butonul de meniu al clientului: «🎫 Bilete», doar biletul (?doar=1)', async () => {
    const { meniu } = await porneste({ legat: ME });
    expect(meniu[0]).toMatchObject({ chat_id: ME, menu_button: { type: 'web_app', text: '🎫 Bilete', web_app: { url: `https://translux.md/ro/bilet/${COD}?doar=1` } } });
  });
  it('personalul și șoferii își păstrează butonul de meniu', async () => {
    expect((await porneste({ legat: ME, personal: true })).meniu).toHaveLength(0);
    expect((await porneste({ legat: ME, sofer: true })).meniu).toHaveLength(0);
  });
});
