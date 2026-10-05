import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const { comandaDeFixat, decizieFixare, sincronizeazaFixarea, sincronizeazaToateConturile } = await import('./fixareBilet.js');
type ComandaFixare = import('./bileteTelegram.js').ComandaFixare;

const ACUM = Date.parse('2026-10-14T09:00:00Z');
const ORA = 60 * 60_000;
const la = (oreFataDeAcum: number) => new Date(ACUM + oreFataDeAcum * ORA).toISOString();
/** Comanda fără ora sosirii: sfârșitul = plecarea + 6 h (ca în @translux/db); `o.sfarsit_ms` îl suprascrie. */
const cmd = (cod: string, oreFataDeAcum: number, o: Partial<ComandaFixare> = {}): ComandaFixare => ({
  cod, status: 'platita', departure_at: la(oreFataDeAcum), sfarsit_ms: ACUM + (oreFataDeAcum + 6) * ORA,
  telegram_mesaj_id: 10, telegram_mesaj_fixat_id: null, ...o,
});

describe('comandaDeFixat: cea mai apropiată plecare care n-a trecut', () => {
  it('mai multe comenzi viitoare → cea cu plecarea cea mai apropiată, oricum ar fi ordonate', () => {
    expect(comandaDeFixat([cmd('c', 30), cmd('a', 2), cmd('b', 5)], ACUM)?.cod).toBe('a');
  });
  it('cursa plecată de 2 h e încă pe drum → rămâne fixată înaintea celei de mâine', () => {
    expect(comandaDeFixat([cmd('maine', 24), cmd('pe_drum', -2)], ACUM)?.cod).toBe('pe_drum');
  });
  it('cursa plecată de peste 6 h (sosirea lipsește) a trecut → următoarea', () => {
    expect(comandaDeFixat([cmd('trecuta', -6.5), cmd('maine', 24)], ACUM)?.cod).toBe('maine');
  });
  it('ION-252: cursa cu sosirea în grafic ține până la sosire + 30 min, nu plecare + 6 h', () => {
    // plecată acum 2 h, sfârșitul (sosire + 30 min) a fost acum 1 minut → pinul trece pe biletul de mâine
    const sosita = cmd('sosita', -2, { sfarsit_ms: ACUM - 60_000 });
    expect(comandaDeFixat([sosita, cmd('maine', 24)], ACUM)?.cod).toBe('maine');
    // aceeași cursă, cu un minut înainte de sfârșit → încă fixată
    expect(comandaDeFixat([cmd('pe_drum', -2, { sfarsit_ms: ACUM + 60_000 }), cmd('maine', 24)], ACUM)?.cod).toBe('pe_drum');
    // exact la sfârșit cursa e încheiată
    expect(comandaDeFixat([cmd('la_limita', -2, { sfarsit_ms: ACUM })], ACUM)).toBeNull();
  });
  it('ION-252: cursa încheiată și nimic după → desfixează', () => {
    expect(decizieFixare([cmd('sosita', -3, { sfarsit_ms: ACUM - 1, telegram_mesaj_fixat_id: 10 })], ACUM)).toEqual({ tip: 'desfixeaza' });
  });
  it('anulată / returnată / neplătită / plătită fără bilet nu se fixează', () => {
    const toate = ['anulata', 'returnata', 'noua', 'platita_fara_bilet'].map((s, i) => cmd(s, i + 1, { status: s }));
    expect(comandaDeFixat(toate, ACUM)).toBeNull();
    expect(comandaDeFixat([...toate, cmd('buna', 10)], ACUM)?.cod).toBe('buna');
  });
  it('fără mesaj trimis în chat nu are ce fixa', () => {
    expect(comandaDeFixat([cmd('fara_mesaj', 1, { telegram_mesaj_id: null }), cmd('cu_mesaj', 3)], ACUM)?.cod).toBe('cu_mesaj');
  });
  it('nimic eligibil → null', () => {
    expect(comandaDeFixat([], ACUM)).toBeNull();
  });
});

describe('decizieFixare: repinează doar când ținta se schimbă', () => {
  it('pinul e deja pe mesajul țintei → nimic', () => {
    expect(decizieFixare([cmd('a', 2, { telegram_mesaj_fixat_id: 10 }), cmd('b', 5)], ACUM)).toEqual({ tip: 'nimic' });
  });
  it('a apărut un bilet mai apropiat → fixează-l pe el', () => {
    expect(decizieFixare([cmd('a', 2, { telegram_mesaj_id: 11 }), cmd('b', 5, { telegram_mesaj_fixat_id: 10 })], ACUM))
      .toEqual({ tip: 'fixeaza', tinta: { cod: 'a', mesajId: 11 } });
  });
  it('ținta are un mesaj nou (linkul redeschis) → repinează mesajul nou', () => {
    expect(decizieFixare([cmd('a', 2, { telegram_mesaj_id: 12, telegram_mesaj_fixat_id: 10 })], ACUM))
      .toEqual({ tip: 'fixeaza', tinta: { cod: 'a', mesajId: 12 } });
  });
  it('comanda fixată a fost anulată și nu mai e alta → desfixează', () => {
    expect(decizieFixare([cmd('a', 2, { status: 'anulata', telegram_mesaj_fixat_id: 10 })], ACUM)).toEqual({ tip: 'desfixeaza' });
  });
  it('cursa fixată a trecut, urmează alta → fixează următoarea', () => {
    expect(decizieFixare([cmd('veche', -7, { telegram_mesaj_fixat_id: 10 }), cmd('noua', 20, { telegram_mesaj_id: 13 })], ACUM))
      .toEqual({ tip: 'fixeaza', tinta: { cod: 'noua', mesajId: 13 } });
  });
  it('nimic fixat și nimic de fixat → nimic', () => {
    expect(decizieFixare([cmd('veche', -7)], ACUM)).toEqual({ tip: 'nimic' });
  });
});

function repoFals(comenzi: ComandaFixare[], conturi: number[] = []) {
  return {
    salveazaMesaj: vi.fn(async () => {}),
    uitaMesaj: vi.fn(async () => {}),
    comenziPentruFixare: vi.fn(async () => comenzi),
    marcheazaFixarea: vi.fn(async () => {}),
    conturiDeVerificat: vi.fn(async () => conturi),
    comenziPentruHarta: vi.fn(async () => []),
    marcheazaHartaTrimisa: vi.fn(async () => true),
  };
}
const apiFals = () => ({ unpinAllChatMessages: vi.fn(async () => true), pinChatMessage: vi.fn(async () => true) });

describe('sincronizeazaFixarea', () => {
  it('schimbare → unpinAll, pin fără notificare, apoi evidența în bază', async () => {
    const repo = repoFals([cmd('a', 2, { telegram_mesaj_id: 11 })]);
    const api = apiFals();
    await sincronizeazaFixarea(42, { repo, api, nowMs: ACUM });
    expect(api.unpinAllChatMessages).toHaveBeenCalledWith(42);
    expect(api.pinChatMessage).toHaveBeenCalledWith(42, 11, { disable_notification: true });
    expect(repo.marcheazaFixarea).toHaveBeenCalledWith(42, { cod: 'a', mesajId: 11 });
  });
  it('deja fixat corect → niciun apel la Telegram', async () => {
    const api = apiFals();
    await sincronizeazaFixarea(42, { repo: repoFals([cmd('a', 2, { telegram_mesaj_fixat_id: 10 })]), api, nowMs: ACUM });
    expect(api.unpinAllChatMessages).not.toHaveBeenCalled();
    expect(api.pinChatMessage).not.toHaveBeenCalled();
  });
  it('desfixare → unpinAll și evidența golită', async () => {
    const repo = repoFals([cmd('a', -8, { telegram_mesaj_fixat_id: 10 })]);
    const api = apiFals();
    await sincronizeazaFixarea(42, { repo, api, nowMs: ACUM });
    expect(api.unpinAllChatMessages).toHaveBeenCalledWith(42);
    expect(api.pinChatMessage).not.toHaveBeenCalled();
    expect(repo.marcheazaFixarea).toHaveBeenCalledWith(42, null);
  });
  it('mesajul a fost șters de client → comanda își uită mesajul, nu rămâne fixată', async () => {
    const repo = repoFals([cmd('a', 2, { telegram_mesaj_id: 11 })]);
    const api = apiFals();
    api.pinChatMessage.mockRejectedValueOnce(new Error('Call to \'pinChatMessage\' failed! (400: Bad Request: message to pin not found)'));
    await sincronizeazaFixarea(42, { repo, api, nowMs: ACUM });
    expect(repo.uitaMesaj).toHaveBeenCalledWith('a', 11);
    expect(repo.marcheazaFixarea).toHaveBeenCalledWith(42, null);
  });
  it('altă eroare Telegram → se aruncă, evidența rămâne neschimbată (tickul reîncearcă)', async () => {
    const repo = repoFals([cmd('a', 2)]);
    const api = apiFals();
    api.pinChatMessage.mockRejectedValueOnce(new Error('Forbidden: bot was blocked by the user'));
    await expect(sincronizeazaFixarea(42, { repo, api, nowMs: ACUM })).rejects.toThrow(/blocked/);
    expect(repo.marcheazaFixarea).not.toHaveBeenCalled();
  });
});

describe('sincronizeazaToateConturile', () => {
  it('un cont căzut nu le oprește pe celelalte', async () => {
    const repo = repoFals([cmd('a', 2)], [1, 2, 3]);
    const api = apiFals();
    api.unpinAllChatMessages.mockImplementation(async (id: number) => { if (id === 2) throw new Error('blocat'); return true; });
    const jurnal = vi.fn();
    const b = await sincronizeazaToateConturile({ repo, api, nowMs: ACUM, jurnal });
    expect(b).toEqual({ verificate: 3, schimbate: 2, erori: 1 });
    expect(jurnal).toHaveBeenCalledWith(expect.stringMatching(/\[bilete\/pin\] 2: blocat/));
  });
});
