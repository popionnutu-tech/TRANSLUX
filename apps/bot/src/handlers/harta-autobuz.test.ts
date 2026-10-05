import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { mesajHarta, trimiteHartileScadente } = await import('./harta-autobuz.js');
const { alegePozitie, oraChisinau, creeazaSursaPozitii, PanouIndisponibilError } = await import('../services/pozitiiAutobuz.js');
type CursaAcum = import('../services/pozitiiAutobuz.js').CursaAcum;
type ComandaHarta = import('../services/bileteTelegram.js').ComandaHarta;

// 14.10.2026, 08:00 la Chișinău (UTC+3); plecarea biletului la 08:45.
const ACUM = Date.parse('2026-10-14T05:00:00Z');
const PLECARE = '2026-10-14T05:45:00Z';
const MIN = 60_000;
const punct = (o: Partial<CursaAcum> = {}): CursaAcum => ({
  departure: '08:45', lat: 47.9, lon: 27.4, near: 'Edineț', at: '07:58', atIso: new Date(ACUM - 2 * MIN).toISOString(),
  driver: 'Ion Popescu', plate: 'ABC 123', ...o,
});

describe('oraChisinau', () => {
  it('ora locală «HH:MM» (vara UTC+3), cu zero în față, fără «24:»', () => {
    expect(oraChisinau(PLECARE)).toBe('08:45');
    expect(oraChisinau('2026-10-13T21:05:00Z')).toBe('00:05');
  });
});

describe('alegePozitie: doar cursa biletului, GPS real, de cel mult 10 minute', () => {
  it('cursa cu ora plecării biletului și punct proaspăt → punctul', () => {
    expect(alegePozitie([punct({ departure: '07:30' }), punct()], '08:45', ACUM))
      .toEqual({ lat: 47.9, lon: 27.4, near: 'Edineț', at: '07:58', driver: 'Ion Popescu', plate: 'ABC 123' });
  });
  it('punct mai vechi de 10 minute → null', () => {
    expect(alegePozitie([punct({ atIso: new Date(ACUM - 11 * MIN).toISOString() })], '08:45', ACUM)).toBeNull();
  });
  it('punct estimat pe linie (fără GPS) → null', () => {
    expect(alegePozitie([punct({ estimated: true, atIso: undefined, at: undefined })], '08:45', ACUM)).toBeNull();
  });
  it('fără lat → null; altă oră de plecare → null', () => {
    expect(alegePozitie([punct({ lat: undefined })], '08:45', ACUM)).toBeNull();
    expect(alegePozitie([punct({ departure: '09:45' })], '08:45', ACUM)).toBeNull();
  });
  it('fără atIso: vechimea din «HH:MM», și peste miezul nopții', () => {
    expect(alegePozitie([punct({ atIso: undefined, at: '07:55' })], '08:45', ACUM)).not.toBeNull();
    expect(alegePozitie([punct({ atIso: undefined, at: '07:40' })], '08:45', ACUM)).toBeNull();
    const dupaMiezulNoptii = Date.parse('2026-10-13T21:03:00Z'); // 00:03 la Chișinău
    expect(alegePozitie([punct({ departure: '00:30', atIso: undefined, at: '23:58' })], '00:30', dupaMiezulNoptii)).not.toBeNull();
  });
});

describe('mesajHarta', () => {
  const p = { lat: 1, lon: 2, near: 'Edineț', at: '07:58', driver: 'Ion Popescu', plate: 'ABC 123' };
  it('RO: titlul, adresa cu șoferul, placa și plecarea, butonul spre /ro/telegram', () => {
    expect(mesajHarta({ from_name: 'Briceni', departure_at: PLECARE, lang: 'ro' }, p)).toEqual({
      titlu: '🚌 Autobuzul tău acum: lângă Edineț (07:58)',
      adresa: 'Ion Popescu · ABC 123 · pleacă din Briceni la 08:45',
      buton: '📍 Vezi unde e autobuzul',
      url: 'https://translux.md/ro/telegram',
    });
  });
  it('RU, fără localitate și fără șofer', () => {
    const m = mesajHarta({ from_name: 'Бричень', departure_at: PLECARE, lang: 'ru' }, { ...p, near: null, driver: null });
    expect(m.titlu).toBe('🚌 Ваш автобус сейчас (07:58)');
    expect(m.adresa).toBe('ABC 123 · отправление из Бричень в 08:45');
    expect(m.url).toBe('https://translux.md/ru/telegram');
  });
});

describe('trimiteHartileScadente: o singură hartă pe comandă', () => {
  const comanda = (cod: string, o: Partial<ComandaHarta> = {}): ComandaHarta => ({
    cod, lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: PLECARE, telegram_id: 777, ...o,
  });

  // Baza falsă: comenzile din fereastră, marcajul atomic «doar dacă era NULL».
  function bazaFalsa(comenzi: ComandaHarta[]) {
    const trimisa = new Set<string>();
    return {
      trimisa,
      salveazaMesaj: vi.fn(), uitaMesaj: vi.fn(), comenziPentruFixare: vi.fn(), marcheazaFixarea: vi.fn(), conturiDeVerificat: vi.fn(),
      comenziPentruHarta: vi.fn(async () => comenzi.filter((c) => !trimisa.has(c.cod))),
      marcheazaHartaTrimisa: vi.fn(async (cod: string) => { if (trimisa.has(cod)) return false; trimisa.add(cod); return true; }),
    };
  }
  const apiFals = () => ({ sendVenue: vi.fn(async () => ({})) });

  it('punct proaspăt → venue cu butonul web_app, marcaj; tickul următor nu mai trimite', async () => {
    const repo = bazaFalsa([comanda('a')]);
    const api = apiFals();
    const pozitii = { curse: vi.fn(async () => [punct()]) };
    expect(await trimiteHartileScadente({ repo, pozitii, api, nowMs: ACUM })).toEqual({ trimise: 1, faraPunct: 0, erori: 0 });
    expect(api.sendVenue).toHaveBeenCalledWith(777, 47.9, 27.4, '🚌 Autobuzul tău acum: lângă Edineț (07:58)',
      'Ion Popescu · ABC 123 · pleacă din Briceni la 08:45',
      { reply_markup: { inline_keyboard: [[{ text: '📍 Vezi unde e autobuzul', web_app: { url: 'https://translux.md/ro/telegram' } }]] } });
    expect(repo.trimisa.has('a')).toBe(true);
    await trimiteHartileScadente({ repo, pozitii, api, nowMs: ACUM + 5 * MIN });
    expect(api.sendVenue).toHaveBeenCalledTimes(1);
  });
  it('fără punct proaspăt → nu trimite, nu marchează; reîncearcă la tickul următor', async () => {
    const repo = bazaFalsa([comanda('a')]);
    const api = apiFals();
    const pozitii = { curse: vi.fn(async () => [punct({ atIso: new Date(ACUM - 20 * MIN).toISOString() })]) };
    expect(await trimiteHartileScadente({ repo, pozitii, api, nowMs: ACUM })).toEqual({ trimise: 0, faraPunct: 1, erori: 0 });
    expect(api.sendVenue).not.toHaveBeenCalled();
    expect(repo.marcheazaHartaTrimisa).not.toHaveBeenCalled();
    pozitii.curse.mockResolvedValueOnce([punct({ atIso: new Date(ACUM + 4 * MIN).toISOString() })]);
    expect((await trimiteHartileScadente({ repo, pozitii, api, nowMs: ACUM + 5 * MIN })).trimise).toBe(1);
  });
  it('trimiterea eșuată → fără marcaj (se reîncearcă); celelalte comenzi merg mai departe', async () => {
    const repo = bazaFalsa([comanda('a', { telegram_id: 1 }), comanda('b', { telegram_id: 2 })]);
    const api = apiFals();
    api.sendVenue.mockRejectedValueOnce(new Error('Forbidden: bot was blocked by the user'));
    const pozitii = { curse: vi.fn(async () => [punct()]) };
    const jurnal = vi.fn();
    expect(await trimiteHartileScadente({ repo, pozitii, api, nowMs: ACUM, jurnal })).toEqual({ trimise: 1, faraPunct: 0, erori: 1 });
    expect(repo.trimisa.has('a')).toBe(false);
    expect(repo.trimisa.has('b')).toBe(true);
  });
  it('aceeași pereche de localități → panoul întrebat o singură dată pe tick', async () => {
    const repo = bazaFalsa([comanda('a'), comanda('b', { telegram_id: 2 })]);
    const pozitii = { curse: vi.fn(async () => [punct()]) };
    await trimiteHartileScadente({ repo, pozitii, api: apiFals(), nowMs: ACUM });
    expect(pozitii.curse).toHaveBeenCalledTimes(1);
  });
});

describe('creeazaSursaPozitii', () => {
  it('cere «Acum» cu originea site-ului și întoarce cursele', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ trips: [punct()] }), { status: 200 }));
    const s = creeazaSursaPozitii('https://hub.test', fetchFn);
    expect(await s.curse('Briceni', 'Chișinău')).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://hub.test/api/asistent-site/acum?from=Briceni&to=Chi%C8%99in%C4%83u');
    expect(init.headers).toEqual({ Origin: 'https://www.translux.md' });
  });
  it('panoul cade → PanouIndisponibilError', async () => {
    const s = creeazaSursaPozitii('https://hub.test', vi.fn(async () => new Response('x', { status: 503 })));
    await expect(s.curse('a', 'b')).rejects.toBeInstanceOf(PanouIndisponibilError);
  });
});
