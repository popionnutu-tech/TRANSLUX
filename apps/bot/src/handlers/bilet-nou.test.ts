import { describe, expect, it, vi } from 'vitest';

// ION-266 + ION-274: biletul din mini app pleacă singur după plată — câte o poză pe loc, butoanele doar pe prima, id-ul primului
// mesaj pe comandă, pinul; revendicare atomică (o singură livrare), marcaj «livrat» separat de mesaj (biletul șters nu se
// retrimite), livrare parțială salvată; o comandă căzută nu le oprește pe celelalte.
vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 }))); // panoul «nu răspunde» → QR simplu

const { trimiteBileteleNoi, livreazaBiletul, esteDeLivrat } = await import('./bilet-nou.js');

const COD = 'ab'.repeat(16);
const COD2 = 'cd'.repeat(16);
const comanda = (cod: string, telegram_id: number | null, seats = 2, lang = 'ro', extra: Record<string, unknown> = {}) => ({
  cod, status: 'platita', lang, from_name: 'Edineț', to_name: 'Chișinău', departure_at: '2099-10-06T14:20:00+03:00', seats,
  telegram_id, trip_date: '2099-10-06', crm_route_id: 21, going_north: false, telegram_livrat_la: null, telegram_mesaj_id: null, ...extra,
});
const bilet = (nr: number) => ({ nr, loc_nr: nr, cod_qr: `TLX-${nr}-ABCDEFGH`, status: 'valid' });

function apiFals(opts: { pica?: number; picaPoza?: number[] } = {}) {
  let id = 100; let poza = 0;
  const trimise: Array<{ chat: number; tip: string; text: string; butoane: boolean; id: number }> = [];
  const api = {
    sendPhoto: vi.fn(async (chat: number, _f: unknown, extra?: { caption?: string; reply_markup?: unknown }) => {
      poza++;
      if (opts.pica === chat) throw new Error('Forbidden: bot was blocked by the user');
      if (opts.picaPoza?.includes(poza)) throw new Error('Too Many Requests');
      id++; trimise.push({ chat, tip: 'poza', text: extra?.caption ?? '', butoane: Boolean(extra?.reply_markup), id }); return { message_id: id };
    }),
    sendMessage: vi.fn(async (chat: number, text: string, extra?: { reply_markup?: unknown }) => { id++; trimise.push({ chat, tip: 'text', text, butoane: Boolean(extra?.reply_markup), id }); return { message_id: id }; }),
    setChatMenuButton: vi.fn(async () => true),
    unpinAllChatMessages: vi.fn(async () => true),
    pinChatMessage: vi.fn(async () => true),
  };
  return { api, trimise };
}
/** Baza falsă: revendicarea e atomică (o singură cerere o ia), ca UPDATE … WHERE … RETURNING. */
function mesajeFalse(comenzi: Array<{ cod: string; telegram_id: number; departure_at: string; telegram_livrat_la?: string | null }>) {
  const stare = comenzi.map((c) => ({ telegram_livrat_la: null as string | null, ...c, status: 'platita', telegram_mesaj_id: null as number | null, telegram_mesaj_fixat_id: null as number | null, telegram_livrare_la: null as number | null }));
  const gaseste = (cod: string) => stare.find((x) => x.cod === cod);
  return {
    stare,
    salveazaMesaj: vi.fn(async (cod: string, _tg: number, id: number) => { const c = gaseste(cod); if (c) c.telegram_mesaj_id = id; }),
    uitaMesaj: vi.fn(async (cod: string) => { const c = gaseste(cod); if (c) c.telegram_mesaj_id = null; }),
    revendicaLivrarea: vi.fn(async (cod: string, nowMs: number) => {
      const c = gaseste(cod); if (!c || c.telegram_livrat_la) return false;
      if (c.telegram_livrare_la != null && nowMs - c.telegram_livrare_la < 120_000) return false;
      c.telegram_livrare_la = nowMs; return true;
    }),
    anuleazaRevendicarea: vi.fn(async (cod: string) => { const c = gaseste(cod); if (c && !c.telegram_livrat_la) c.telegram_livrare_la = null; }),
    marcheazaLivrat: vi.fn(async (cod: string, _tg: number, id: number) => { const c = gaseste(cod); if (c) { c.telegram_livrat_la = 'acum'; c.telegram_mesaj_id = id; c.telegram_livrare_la = null; } }),
    comenziPentruFixare: vi.fn(async (tg: number) => stare.filter((c) => c.telegram_id === tg).map((c) => ({ cod: c.cod, status: c.status, departure_at: c.departure_at, sfarsit_ms: Date.parse(c.departure_at) + 6 * 3_600_000, telegram_mesaj_id: c.telegram_mesaj_id, telegram_mesaj_fixat_id: c.telegram_mesaj_fixat_id }))),
    marcheazaFixarea: vi.fn(async (_tg: number, t: { cod: string; mesajId: number } | null) => { for (const c of stare) c.telegram_mesaj_fixat_id = t && c.cod === t.cod ? t.mesajId : null; }),
    conturiDeVerificat: vi.fn(async () => []),
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
const ACUM = Date.parse('2099-10-06T10:00:00+03:00');

describe('ION-266/274: biletul din mini app pleacă singur după plată', () => {
  it('2 locuri → 2 poze în chatul contului, butoanele doar pe prima, «biletul 2 din 2», livrat marcat cu primul id, fixat', async () => {
    const { api, trimise } = apiFals();
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    const b = await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555)]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM });
    expect(b).toEqual({ trimise: 1, erori: 0, sarite: 0 });
    expect(trimise.map((t) => [t.chat, t.tip, t.butoane])).toEqual([[555, 'poza', true], [555, 'poza', false]]);
    // Ion, 10.10.2026: spre Chișinău (din nord) biletul nu are numărul locului.
    expect(trimise[0].text).not.toMatch(/Locul/);
    expect(trimise[1].text).toMatch(/Biletul 2 din 2/);
    expect(mesaje.marcheazaLivrat).toHaveBeenCalledWith(COD, 555, trimise[0].id);
    expect(mesaje.stare[0].telegram_livrat_la).toBe('acum');
    expect(api.pinChatMessage).toHaveBeenCalledWith(555, trimise[0].id, { disable_notification: true });
    expect(api.setChatMenuButton).toHaveBeenCalledWith(expect.objectContaining({ chat_id: 555, menu_button: expect.objectContaining({ text: '🎫 Bilete' }) }));
  });
  it('fără loc valabil → textul biletului cu butoanele, un singur mesaj', async () => {
    const { api, trimise } = apiFals();
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555, 1)], []) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM });
    expect(trimise.map((t) => t.tip)).toEqual(['text']);
    expect(trimise[0].butoane).toBe(true);
  });
  it('comanda fără cont legat se sare; un chat care a blocat botul nu le oprește pe celelalte și își eliberează revendicarea', async () => {
    const { api, trimise } = apiFals({ pica: 777 });
    const jurnal: string[] = [];
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 777, departure_at: '2099-10-06T14:20:00+03:00' }, { cod: COD2, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    const b = await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 777), comanda('ef'.repeat(16), null), comanda(COD2, 555, 1, 'ru')]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM, jurnal: (m) => jurnal.push(m) });
    expect(b).toEqual({ trimise: 1, erori: 1, sarite: 1 });
    expect(trimise.every((t) => t.chat === 555)).toBe(true);
    expect(trimise[0].text).not.toMatch(/Место/);
    expect(jurnal[0]).toMatch(/blocked/);
    expect(mesaje.stare[0].telegram_livrare_la).toBeNull(); // revendicarea anulată → jobul reia
    expect(mesaje.marcheazaLivrat).toHaveBeenCalledTimes(1);
  });
  it('concurență: job + livreaza în aceeași clipă → biletul pleacă O singură dată', async () => {
    const { api, trimise } = apiFals();
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    const repo = repoFals([comanda(COD, 555)]);
    const deps = { repo: repo as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM };
    const [a, b] = await Promise.all([trimiteBileteleNoi(deps), livreazaBiletul(comanda(COD, 555) as never, deps)]);
    expect(trimise.filter((t) => t.butoane)).toHaveLength(1);
    expect(trimise).toHaveLength(2);
    // Exact una din cele două căi livrează (oricare câștigă revendicarea); cealaltă sare.
    expect(a.trimise + (b === 'livrat' ? 1 : 0)).toBe(1);
    expect(mesaje.marcheazaLivrat).toHaveBeenCalledTimes(1);
  });
  it('N4: tur-retur din mini app — turul și returul din pachet (ambele legate) pleacă câte O dată, chiar cu job + livreaza simultan', async () => {
    const { api, trimise } = apiFals();
    const RETUR = '12'.repeat(16);
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }, { cod: RETUR, telegram_id: 555, departure_at: '2099-10-07T18:00:00+03:00' }]);
    const lista = [comanda(COD, 555, 1), comanda(RETUR, 555, 1, 'ro', { departure_at: '2099-10-07T18:00:00+03:00', going_north: true })];
    const deps = { repo: repoFals(lista, [bilet(1)]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM };
    const [a, b] = await Promise.all([trimiteBileteleNoi(deps), trimiteBileteleNoi(deps)]);
    expect(a.trimise + b.trimise).toBe(2);
    expect(mesaje.marcheazaLivrat).toHaveBeenCalledTimes(2);
    expect(mesaje.stare.map((c) => c.telegram_livrat_la)).toEqual(['acum', 'acum']);
    expect(trimise).toHaveLength(2);
    // a treia trecere (tickul următor): nimic de retrimis
    const c = await trimiteBileteleNoi({ ...deps, repo: repoFals(lista.map((x, i) => ({ ...x, telegram_livrat_la: mesaje.stare[i].telegram_livrat_la })), [bilet(1)]) as never });
    expect(c.trimise).toBe(0);
    expect(trimise).toHaveLength(2);
  });
  it('biletul livrat apoi șters de client (mesaj uitat) → jobul NU îl retrimite', async () => {
    const { api, trimise } = apiFals();
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555)]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM });
    await mesaje.uitaMesaj(COD);
    const dupa = { ...comanda(COD, 555), telegram_livrat_la: mesaje.stare[0].telegram_livrat_la, telegram_mesaj_id: null };
    expect(esteDeLivrat(dupa as never)).toBe(false);
    const r = await livreazaBiletul(dupa as never, { repo: repoFals([]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM + 600_000 });
    expect(r).toBe('deja_livrat');
    expect(trimise).toHaveLength(2);
  });
  it('livrat înainte de migrare (backfill a pus telegram_livrat_la), apoi mesaj șters → nu se retrimite; nelivrat → o dată', async () => {
    expect(esteDeLivrat(comanda(COD, 555, 1, 'ro', { telegram_livrat_la: '2026-10-05T10:00:00Z', telegram_mesaj_id: null }) as never)).toBe(false);
    expect(esteDeLivrat(comanda(COD, 555, 1, 'ro', { telegram_livrat_la: null, telegram_mesaj_id: 42 }) as never)).toBe(false);
    expect(esteDeLivrat(comanda(COD, 555) as never)).toBe(true);
    expect(esteDeLivrat(comanda(COD, null) as never)).toBe(false);
  });
  it('prima poză reușește, a doua pică și la reîncercare → biletul e marcat livrat (e în chat), locul 2 în jurnal', async () => {
    const { api, trimise } = apiFals({ picaPoza: [2, 3] });
    const jurnal: string[] = [];
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    const b = await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555)]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM, jurnal: (m) => jurnal.push(m) });
    expect(b.trimise).toBe(1);
    expect(trimise).toHaveLength(1);
    expect(mesaje.marcheazaLivrat).toHaveBeenCalledWith(COD, 555, trimise[0].id);
    expect(jurnal.some((m) => /1 loc\(uri\) netrimise/.test(m))).toBe(true);
  });
  it('a doua poză pică o dată și reușește la reîncercare → ambele locuri în chat, nimic în jurnal', async () => {
    const { api, trimise } = apiFals({ picaPoza: [2] });
    const jurnal: string[] = [];
    const mesaje = mesajeFalse([{ cod: COD, telegram_id: 555, departure_at: '2099-10-06T14:20:00+03:00' }]);
    await trimiteBileteleNoi({ repo: repoFals([comanda(COD, 555)]) as never, mesaje: mesaje as never, api: api as never, nowMs: ACUM, jurnal: (m) => jurnal.push(m) });
    expect(trimise).toHaveLength(2);
    expect(jurnal.filter((m) => /netrimise/.test(m))).toEqual([]);
  });
});
