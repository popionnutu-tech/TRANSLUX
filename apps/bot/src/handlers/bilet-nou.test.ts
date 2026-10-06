import { describe, expect, it, vi } from 'vitest';

// ION-266: biletul cumpărat din mini app pleacă singur după plată — câte o poză pe loc, butoanele doar pe prima,
// id-ul primului mesaj pe comandă, pinul; o comandă căzută nu le oprește pe celelalte.
vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 }))); // panoul «nu răspunde» → QR simplu

const { trimiteBileteleNoi } = await import('./bilet-nou.js');

const COD = 'ab'.repeat(16);
const COD2 = 'cd'.repeat(16);
const comanda = (cod: string, telegram_id: number | null, seats = 2, lang = 'ro') => ({
  cod, status: 'platita', lang, from_name: 'Edineț', to_name: 'Chișinău', departure_at: '2099-10-06T14:20:00+03:00', seats,
  telegram_id, trip_date: '2099-10-06', crm_route_id: 21, going_north: false,
});
const bilet = (nr: number) => ({ nr, loc_nr: nr, cod_qr: `TLX-${nr}-ABCDEFGH`, status: 'valid' });

function apiFals(opts: { pica?: number } = {}) {
  let id = 100;
  const trimise: Array<{ chat: number; tip: string; text: string; butoane: boolean; id: number }> = [];
  const api = {
    sendPhoto: vi.fn(async (chat: number, _f: unknown, extra?: { caption?: string; reply_markup?: unknown }) => {
      if (opts.pica === chat) throw new Error('Forbidden: bot was blocked by the user');
      id++; trimise.push({ chat, tip: 'poza', text: extra?.caption ?? '', butoane: Boolean(extra?.reply_markup), id }); return { message_id: id };
    }),
    sendMessage: vi.fn(async (chat: number, text: string, extra?: { reply_markup?: unknown }) => { id++; trimise.push({ chat, tip: 'text', text, butoane: Boolean(extra?.reply_markup), id }); return { message_id: id }; }),
    setChatMenuButton: vi.fn(async () => true),
    unpinAllChatMessages: vi.fn(async () => true),
    pinChatMessage: vi.fn(async () => true),
  };
  return { api, trimise };
}
function mesajeFalse(comenzi: Array<{ cod: string; telegram_id: number; departure_at: string }>) {
  const stare = comenzi.map((c) => ({ ...c, status: 'platita', telegram_mesaj_id: null as number | null, telegram_mesaj_fixat_id: null as number | null }));
  return {
    stare,
    salveazaMesaj: vi.fn(async (cod: string, _tg: number, id: number) => { const c = stare.find((x) => x.cod === cod); if (c) c.telegram_mesaj_id = id; }),
    comenziPentruFixare: vi.fn(async (tg: number) => stare.filter((c) => c.telegram_id === tg).map((c) => ({ cod: c.cod, status: c.status, departure_at: c.departure_at, sfarsit_ms: Date.parse(c.departure_at) + 6 * 3_600_000, telegram_mesaj_id: c.telegram_mesaj_id, telegram_mesaj_fixat_id: c.telegram_mesaj_fixat_id }))),
    marcheazaFixarea: vi.fn(async (_tg: number, t: { cod: string; mesajId: number } | null) => { for (const c of stare) c.telegram_mesaj_fixat_id = t && c.cod === t.cod ? t.mesajId : null; }),
    comenziPentruHarta: vi.fn(async () => []), marcheazaHartaTrimisa: vi.fn(async () => true),
  };
}
function repoFals(lista: ReturnType<typeof comanda>[], bilete = [bilet(1), bilet(2)]) {
  return {
    comandaDupaCod: vi.fn(async () => null), leagaComanda: vi.fn(async () => null), comenziLegate: vi.fn(async () => []),
    telefonSofer: vi.fn(async () => null), esteSofer: vi.fn(async () => false),
    bileteQr: vi.fn(async () => bilete), comenziPlatiteFaraMesaj: vi.fn(async () => lista),
  };
}

describe('ION-266: biletul din mini app pleacă singur după plată', () => {
  it('2 locuri → 2 poze în chatul contului, butoanele doar pe prima, «biletul 2 din 2», primul id salvat și fixat', async () => {
    const { api, trimise } = apiFals();
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    const b = await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555)]) as never, mesaje: mesaje as never, api: api as never, nowMs: Date.parse('2099-10-06T10:00:00+03:00') });
    expect(b).toEqual({ trimise: 1, erori: 0 });
    expect(trimise.map((t) => [t.chat, t.tip, t.butoane])).toEqual([[555, 'poza', true], [555, 'poza', false]]);
    expect(trimise[0].text).toMatch(/Locul 1/);
    expect(trimise[1].text).toMatch(/biletul 2 din 2/);
    expect(mesaje.salveazaMesaj).toHaveBeenCalledWith(COD, 555, trimise[0].id);
    expect(api.pinChatMessage).toHaveBeenCalledWith(555, trimise[0].id, { disable_notification: true });
    expect(api.setChatMenuButton).toHaveBeenCalledWith(expect.objectContaining({ chat_id: 555, menu_button: expect.objectContaining({ text: '🎫 Bilete' }) }));
  });
  it('fără loc valabil → textul biletului cu butoanele, un singur mesaj', async () => {
    const { api, trimise } = apiFals();
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555, 1)], []) as never, mesaje: mesaje as never, api: api as never, nowMs: 0 });
    expect(trimise.map((t) => t.tip)).toEqual(['text']);
    expect(trimise[0].butoane).toBe(true);
  });
  it('comanda fără cont legat nu se atinge; un chat care a blocat botul nu le oprește pe celelalte', async () => {
    const { api, trimise } = apiFals({ pica: 777 });
    const jurnal: string[] = [];
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 777, departure_at: '2099-10-06T14:20:00+03:00' }, { cod: COD2, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    const b = await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 777), comanda('ef'.repeat(16), null), comanda(COD2, 555, 1, 'ru')]) as never, mesaje: mesaje as never, api: api as never, nowMs: 0, jurnal: (m) => jurnal.push(m) });
    expect(b).toEqual({ trimise: 1, erori: 1 });
    expect(trimise.every((t) => t.chat === 555)).toBe(true);
    expect(trimise[0].text).toMatch(/Место 1/);
    expect(jurnal[0]).toMatch(/blocked/);
    expect(mesaje.salveazaMesaj).toHaveBeenCalledTimes(1);
  });
});
