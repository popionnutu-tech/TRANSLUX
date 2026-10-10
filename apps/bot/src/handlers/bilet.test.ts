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

// Chatul fals: înregistrează fiecare mesaj trimis (text sau poză), cu butoanele lui și id-ul dat de «Telegram».
type Buton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };
type Trimis = { tip: 'text' | 'poza'; text: string; butoane: string[]; id: number };
const tinta = (b: Buton) => b.callback_data ?? b.url ?? (b.web_app ? `webapp:${b.web_app.url}` : '');

function chatFals(o: { me: number; personal?: boolean }) {
  const trimise: Trimis[] = [];
  const meniu: unknown[] = [];
  const pin: Array<[string, ...unknown[]]> = [];
  let urmatorul = 100;
  const inregistreaza = (tip: Trimis['tip'], text: string, extra?: { reply_markup?: { inline_keyboard: Buton[][] } }) => {
    const id = urmatorul++;
    trimise.push({ tip, text, id, butoane: (extra?.reply_markup?.inline_keyboard ?? []).flat().map(tinta) });
    return { message_id: id };
  };
  const ctx = {
    chat: { type: 'private', id: o.me }, from: { id: o.me }, dbUser: o.personal ? { id: 'u1' } : undefined,
    reply: vi.fn(async (text: string, extra?: { reply_markup?: { inline_keyboard: Buton[][] } }) => inregistreaza('text', text, extra)),
    replyWithPhoto: vi.fn(async (_f: unknown, extra?: { caption?: string; reply_markup?: { inline_keyboard: Buton[][] } }) => inregistreaza('poza', extra?.caption ?? '', extra)),
    replyWithMediaGroup: vi.fn(async () => { throw new Error('albumul nu are butoane: nu se mai folosește'); }),
    api: {
      setChatMenuButton: vi.fn(async (a: unknown) => { meniu.push(a); }),
      unpinAllChatMessages: vi.fn(async (...a: unknown[]) => { pin.push(['unpinAll', ...a]); }),
      pinChatMessage: vi.fn(async (...a: unknown[]) => { pin.push(['pin', ...a]); }),
    },
  };
  return { ctx, trimise, meniu, pin };
}

/** Repo-ul mesajelor în memorie: comenzile contului pentru pin și ce s-a scris. */
function mesajeFalse(comenzi: Array<{ cod: string; status: string; departure_at: string; telegram_mesaj_id: number | null; telegram_mesaj_fixat_id: number | null }> = []) {
  return {
    comenzi,
    salveazaMesaj: vi.fn(async (cod: string, _tg: number, id: number) => {
      const c = comenzi.find((x) => x.cod === cod);
      if (c) c.telegram_mesaj_id = id;
    }),
    uitaMesaj: vi.fn(async () => {}),
    // ION-252: sfârșitul cursei fără ora sosirii = plecarea + 6 h
    comenziPentruFixare: vi.fn(async () => comenzi.map((c) => ({ ...c, sfarsit_ms: Date.parse(c.departure_at) + 6 * 60 * 60_000 }))),
    marcheazaFixarea: vi.fn(async (_tg: number, t: { cod: string; mesajId: number } | null) => {
      for (const c of comenzi) c.telegram_mesaj_fixat_id = t && c.cod === t.cod ? t.mesajId : null;
    }),
    conturiDeVerificat: vi.fn(async () => []),
    comenziPentruHarta: vi.fn(async () => []),
    marcheazaHartaTrimisa: vi.fn(async () => true),
  };
}

describe('legarea și butonul «Returnează» (ION-244)', () => {
  const ME = 555;
  const COD = 'ab'.repeat(16);
  const comanda = (telegram_id: number | null, status = 'platita') => ({
    cod: COD, status, lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', seats: 1,
    telegram_id, trip_date: '2026-10-14', crm_route_id: 1655, going_north: false,
  });

  async function porneste(telegramDinBaza: number | null, legatDupaUpdate: number | null, status = 'platita') {
    const { handleBiletStart } = await import('./bilet.js');
    const repo = {
      comandaDupaCod: vi.fn(async () => comanda(telegramDinBaza, status)),
      leagaComanda: vi.fn(async () => legatDupaUpdate),
      comenziLegate: vi.fn(async () => []),
      telefonSofer: vi.fn(async () => null),
    };
    const chat = chatFals({ me: ME });
    await handleBiletStart(chat.ctx as never, COD, repo, mesajeFalse());
    return { replies: chat.trimise, repo };
  }

  it('comanda nelegată → se leagă de contul care a deschis-o, cu butonul de returnare', async () => {
    const { replies, repo } = await porneste(null, ME);
    expect(repo.leagaComanda).toHaveBeenCalledWith(COD, ME);
    expect(replies).toHaveLength(1);
    expect(replies[0].butoane).toEqual([`retur:cere:${COD}`, 'webapp:https://translux.md/ro/telegram']);
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

describe('ION-251: biletul într-un singur mesaj, fixat sus', () => {
  // imaginea biletului vine de la panou; în teste panoul «nu răspunde» → botul trimite QR-ul simplu, fără rețea
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
  const ME = 555;
  const COD = 'cd'.repeat(16);
  const RETUR = `retur:cere:${COD}`;
  const HARTA = 'webapp:https://translux.md/ro/telegram';
  const comanda = (telegram_id: number | null, status = 'platita', seats = 1, lang = 'ro') => ({
    cod: COD, status, lang, from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2099-10-14T05:45:00+03:00', seats,
    telegram_id, trip_date: '2099-10-14', crm_route_id: 8, going_north: false,
  });
  const bilet = (nr: number, status = 'valid') => ({ nr, loc_nr: 10 + nr, cod_qr: `TLX-${nr}-ABCDEFGH`, status });

  async function porneste(o: {
    legat: number | null; status?: string; bilete?: ReturnType<typeof bilet>[]; personal?: boolean; sofer?: boolean; lang?: string;
    alteComenzi?: Parameters<typeof mesajeFalse>[0];
  }) {
    const { handleBiletStart } = await import('./bilet.js');
    const chat = chatFals({ me: ME, personal: o.personal });
    const c = comanda(o.legat, o.status ?? 'platita', o.bilete?.length ?? 1, o.lang);
    const mesaje = mesajeFalse([
      { cod: COD, status: c.status, departure_at: c.departure_at, telegram_mesaj_id: null, telegram_mesaj_fixat_id: null },
      ...(o.alteComenzi ?? []),
    ]);
    const repo = {
      comandaDupaCod: vi.fn(async () => c),
      leagaComanda: vi.fn(async () => o.legat),
      comenziLegate: vi.fn(async () => []),
      telefonSofer: vi.fn(async () => null),
      esteSofer: vi.fn(async () => !!o.sofer),
      bileteQr: vi.fn(async () => o.bilete ?? [bilet(1)]),
    };
    await handleBiletStart(chat.ctx as never, COD, repo, mesaje);
    return { ...chat, mesaje };
  }

  it('1 loc → UN singur mesaj: imaginea cu textul biletului, locul și butoanele Returnează + Vezi unde e autobuzul', async () => {
    const { trimise } = await porneste({ legat: ME });
    expect(trimise).toHaveLength(1);
    expect(trimise[0].tip).toBe('poza');
    expect(trimise[0].text).toMatch(/🎫 Bilet TRANSLUX\nBriceni → Chișinău/);
    expect(trimise[0].text).toMatch(/locuri: 1/);
    expect(trimise[0].text).toMatch(/Plătit/);
    // Ion, 10.10.2026: spre Chișinău (din nord) biletul nu are numărul locului.
    expect(trimise[0].text).not.toMatch(/Locul/);
    expect(trimise[0].text).toMatch(/Arată acest cod șoferului/);
    expect(trimise[0].text).not.toMatch(/din 1\)/);
    expect(trimise[0].butoane).toEqual([RETUR, HARTA]);
  });
  it('3 locuri → câte o imagine pe loc, butoanele DOAR pe prima, «biletul 2 din 3»', async () => {
    const { trimise } = await porneste({ legat: ME, bilete: [bilet(1), bilet(2), bilet(3)] });
    expect(trimise.map((t) => t.tip)).toEqual(['poza', 'poza', 'poza']);
    expect(trimise[0].butoane).toEqual([RETUR, HARTA]);
    expect(trimise[1].butoane).toEqual([]);
    expect(trimise[2].butoane).toEqual([]);
    expect(trimise[1].text).toMatch(/Biletul 2 din 3/);
  });
  it('id-ul primului mesaj se ține pe comandă și mesajul se fixează fără notificare', async () => {
    const { trimise, mesaje, pin } = await porneste({ legat: ME, bilete: [bilet(1), bilet(2)] });
    expect(mesaje.salveazaMesaj).toHaveBeenCalledWith(COD, ME, trimise[0].id);
    expect(pin).toEqual([['unpinAll', ME], ['pin', ME, trimise[0].id, { disable_notification: true }]]);
    expect(mesaje.comenzi[0].telegram_mesaj_fixat_id).toBe(trimise[0].id);
  });
  it('alt bilet al contului pleacă mai devreme → pinul rămâne pe el, nu se atinge', async () => {
    const { pin } = await porneste({
      legat: ME,
      alteComenzi: [{ cod: 'ef'.repeat(16), status: 'platita', departure_at: '2099-10-13T05:45:00+03:00', telegram_mesaj_id: 7, telegram_mesaj_fixat_id: 7 }],
    });
    expect(pin).toEqual([]);
  });
  it('RU: textul și butoanele în rusă', async () => {
    const { trimise } = await porneste({ legat: ME, lang: 'ru' });
    expect(trimise[0].text).not.toMatch(/Место/);
    expect(trimise[0].butoane).toEqual([RETUR, 'webapp:https://translux.md/ru/telegram']);
  });
  it('fără loc valabil (urcat) → textul biletului cu aceleași butoane, tot un singur mesaj', async () => {
    const { trimise } = await porneste({ legat: ME, bilete: [bilet(1, 'urcat')] });
    expect(trimise).toHaveLength(1);
    expect(trimise[0].tip).toBe('text');
    expect(trimise[0].butoane).toEqual([RETUR, HARTA]);
  });
  it('biletul altui cont → textul vechi cu linkul, fără QR, fără Returnează, fără pin; meniul de comenzi', async () => {
    const { trimise, meniu, pin, mesaje } = await porneste({ legat: 999 });
    expect(trimise).toHaveLength(1);
    expect(trimise[0].tip).toBe('text');
    expect(trimise[0].butoane).toEqual([`https://translux.md/ro/bilet/${COD}`]);
    expect(pin).toEqual([]);
    expect(mesaje.salveazaMesaj).not.toHaveBeenCalled();
    expect(meniu[0]).toMatchObject({ menu_button: { type: 'commands' } });
  });
  it('comanda anulată → textul vechi, fără QR', async () => {
    const { trimise } = await porneste({ legat: ME, status: 'anulata' });
    expect(trimise.map((t) => t.tip)).toEqual(['text']);
    expect(trimise[0].butoane).not.toContain(RETUR);
  });
  it('pinul căzut nu strică biletul: mesajul a plecat, eroarea doar în jurnal', async () => {
    const { handleBiletStart } = await import('./bilet.js');
    const chat = chatFals({ me: ME });
    chat.ctx.api.pinChatMessage.mockRejectedValueOnce(new Error('Telegram indisponibil'));
    const mesaje = mesajeFalse([{ cod: COD, status: 'platita', departure_at: '2099-10-14T05:45:00+03:00', telegram_mesaj_id: null, telegram_mesaj_fixat_id: null }]);
    const repo = {
      comandaDupaCod: vi.fn(async () => comanda(ME)), leagaComanda: vi.fn(async () => ME), comenziLegate: vi.fn(async () => []),
      telefonSofer: vi.fn(async () => null), bileteQr: vi.fn(async () => [bilet(1)]),
    };
    await handleBiletStart(chat.ctx as never, COD, repo, mesaje);
    expect(chat.trimise).toHaveLength(1);
    expect(chat.trimise[0].tip).toBe('poza');
  });
  it('butonul de meniu al clientului: «🎫 Bilete» deschide mini app-ul clientului (ION-249), URL stabil fără cod', async () => {
    const { meniu } = await porneste({ legat: ME });
    expect(meniu[0]).toMatchObject({ chat_id: ME, menu_button: { type: 'web_app', text: '🎫 Bilete', web_app: { url: 'https://translux.md/ro/telegram' } } });
    expect(JSON.stringify(meniu[0])).not.toContain(COD);
  });
  it('clientul rus primește «🎫 Билеты» spre /ru/telegram', async () => {
    const { urlMiniAppClient } = await import('./bilet.js');
    expect(urlMiniAppClient('ru')).toBe('https://translux.md/ru/telegram');
    expect(urlMiniAppClient('ro')).toBe('https://translux.md/ro/telegram');
  });
  it('personalul și șoferii își păstrează butonul de meniu', async () => {
    expect((await porneste({ legat: ME, personal: true })).meniu).toHaveLength(0);
    expect((await porneste({ legat: ME, sofer: true })).meniu).toHaveLength(0);
  });
});

describe('mesajBilet — biletul de probă (migr. 532)', () => {
  it('comanda de probă începe cu inscripția; cea reală nu', async () => {
    const { mesajBilet } = await import('./bilet.js');
    const c = { cod: 'a'.repeat(32), status: 'platita', lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-08T03:00:00Z', seats: 1 };
    expect(mesajBilet({ ...c, test: true }).text.startsWith('⚠️ BILET DE PROBĂ — NU E VALABIL LA URCARE\n')).toBe(true);
    expect(mesajBilet({ ...c, lang: 'ru', test: true }).text.startsWith('⚠️ ТЕСТОВЫЙ БИЛЕТ')).toBe(true);
    expect(mesajBilet(c).text.startsWith('🎫')).toBe(true);
  });
});

describe('Ion, 10.10.2026: locul doar pe cursele din Chișinău', () => {
  it('din Chișinău (going_north) legenda are «Locul 7»; spre Chișinău nu', async () => {
    const { legendaBilet } = await import('./bilet.js');
    const c = { cod: 'a'.repeat(32), status: 'platita', lang: 'ro', from_name: 'Chișinău', to_name: 'Bălți', departure_at: '2099-10-15T05:50:00Z', seats: 1 };
    expect(legendaBilet({ ...c, going_north: true }, { nr: 1, loc_nr: 7 }, 1, 'ro')).toMatch(/Locul 7/);
    expect(legendaBilet({ ...c, going_north: false }, { nr: 1, loc_nr: 7 }, 1, 'ro')).not.toMatch(/Locul/);
  });
});
