import { describe, expect, it, vi } from 'vitest';
import { semneazaInitData } from '@/lib/telegram/init-data';
import type { ComandaPublica } from './public';
import { bileteleClientului, contactDinComanda, MAX_COMENZI_CLIENT, ziuaChisinau, type ComandaContului, type RepoBileteClient } from './client-bilete';

// Vector sintetic: token FALS, semnat cu aceeași formulă ca Telegram (HMAC «WebAppData»), ca în sofer-auth.test.ts.
const TOKEN = '123456:FAKE-TOKEN-ION-249';
const ACUM_MS = Date.UTC(2026, 9, 5, 9, 0, 0); // 05.10.2026, 12:00 la Chișinău
const ACUM_S = ACUM_MS / 1000;
const EU = 8681673761;
const ALTUL = 555000111;

const initDataPentru = (id: number, authDate = ACUM_S - 60) =>
  semneazaInitData({ query_id: 'AAEAAQ', user: JSON.stringify({ id, first_name: 'Ion' }), auth_date: String(authDate) }, TOKEN);

const comandaPublica = (cod: string): ComandaPublica => ({
  cod, numar: cod.slice(0, 8).toUpperCase(), status: 'platita', trip_date: '2026-10-05', from_name: 'Chișinău', to_name: 'Briceni',
  departure_at: '2026-10-05T14:00:00+03:00', sosire: '18:30', seats: 1, price_per_seat: 200, total: 200, passenger_name: 'Pop Ion',
  lang: 'ro', paid_at: null, cancelled_at: null, ruta: null, punct_urcare: null, bilete: [],
});

/** Repo fals cu comenzile a două conturi; `scurge` simulează o interogare greșită care întoarce tot. */
function repoFals(o: { scurge?: boolean; plafon?: boolean } = {}) {
  const toate: ComandaContului[] = [
    { cod: 'a'.repeat(32), telegram_id: EU },
    { cod: 'b'.repeat(32), telegram_id: ALTUL },
    { cod: 'c'.repeat(32), telegram_id: EU },
  ];
  const repo: RepoBileteClient = {
    comenziActive: vi.fn(async (id: number) => (o.scurge ? toate : toate.filter((c) => c.telegram_id === id))),
    biletComplet: vi.fn(async (cod: string) => comandaPublica(cod)),
    ultimulContact: vi.fn(async (id: number) => (id === EU ? { passenger_name: 'Pop Ion', phone: '37368263753' } : null)),
    plafon: vi.fn(async () => o.plafon ?? true),
  };
  return repo;
}

const cere = (initData: string | null, repo: RepoBileteClient, botToken: { token: string | undefined } = { token: TOKEN }) =>
  bileteleClientului({ initData, botToken: botToken.token, acumMs: ACUM_MS }, repo);

describe('bileteleClientului — identitatea din initData', () => {
  it('initData valid → biletele contului și contactul pentru formular', async () => {
    const repo = repoFals();
    const r = await cere(initDataPentru(EU), repo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bilete.map((b) => b.cod)).toEqual(['a'.repeat(32), 'c'.repeat(32)]);
    expect(r.contact).toEqual({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753' });
    // ziua Chișinăului, nu a serverului
    expect(repo.comenziActive).toHaveBeenCalledWith(EU, '2026-10-05', MAX_COMENZI_CLIENT);
  });

  it('initData falsificat (alt token, id schimbat, hash lipsă) → 401, fără nicio citire din bază', async () => {
    const repo = repoFals();
    const bun = initDataPentru(EU);
    for (const fals of [
      semneazaInitData({ user: JSON.stringify({ id: EU }), auth_date: String(ACUM_S) }, 'alt:TOKEN'),
      bun.replace(String(EU), String(ALTUL)),
      bun.replace(/&?hash=[0-9a-f]+/, ''),
      '',
      null,
    ]) {
      expect(await cere(fals, repo)).toEqual({ ok: false, status: 401, eroare: 'neautentificat' });
    }
    expect(await cere(bun, repo, { token: undefined })).toEqual({ ok: false, status: 401, eroare: 'neautentificat' });
    expect(repo.comenziActive).not.toHaveBeenCalled();
    expect(repo.ultimulContact).not.toHaveBeenCalled();
    expect(repo.plafon).not.toHaveBeenCalled();
  });

  it('initData mai vechi de 24 h → 401 «expirat»; la limită încă trece', async () => {
    const repo = repoFals();
    expect(await cere(initDataPentru(EU, ACUM_S - 86_400 - 5), repo)).toEqual({ ok: false, status: 401, eroare: 'expirat' });
    expect(repo.comenziActive).not.toHaveBeenCalled();
    expect((await cere(initDataPentru(EU, ACUM_S - 86_400 + 5), repo)).ok).toBe(true);
  });

  it('plafonul depășit → 429, fără bilete', async () => {
    const repo = repoFals({ plafon: false });
    expect(await cere(initDataPentru(EU), repo)).toEqual({ ok: false, status: 429, eroare: 'prea_multe' });
    expect(repo.comenziActive).not.toHaveBeenCalled();
  });
});

describe('bileteleClientului — lista doar a contului', () => {
  it('celălalt cont își vede doar biletele lui, fără contactul meu', async () => {
    const r = await cere(initDataPentru(ALTUL), repoFals());
    expect(r.ok && r.bilete.map((b) => b.cod)).toEqual(['b'.repeat(32)]);
    expect(r.ok && r.contact).toBeNull();
  });

  it('chiar dacă interogarea ar întoarce comenzi străine, ele nu pleacă (nici nu se citesc)', async () => {
    const repo = repoFals({ scurge: true });
    const r = await cere(initDataPentru(EU), repo);
    expect(r.ok && r.bilete.map((b) => b.cod)).toEqual(['a'.repeat(32), 'c'.repeat(32)]);
    expect(repo.biletComplet).not.toHaveBeenCalledWith('b'.repeat(32));
  });

  it('comanda dispărută între interogări (biletComplet = null) se sare', async () => {
    const repo = repoFals();
    vi.mocked(repo.biletComplet).mockImplementation(async (cod: string) => (cod.startsWith('a') ? null : comandaPublica(cod)));
    const r = await cere(initDataPentru(EU), repo);
    expect(r.ok && r.bilete.map((b) => b.cod)).toEqual(['c'.repeat(32)]);
  });
});

describe('contactDinComanda și ziuaChisinau', () => {
  it('numele se desparte la primul spațiu; telefonul rămâne 373XXXXXXXX', () => {
    expect(contactDinComanda({ passenger_name: '  Popescu   Ion Vasile ', phone: '373 68 263 753' })).toEqual({ nume: 'Popescu', prenume: 'Ion Vasile', telefon: '37368263753' });
  });
  it('un singur cuvânt, telefon nemoldovenesc sau nimic → null (formularul rămâne gol)', () => {
    expect(contactDinComanda({ passenger_name: 'Ion', phone: '37368263753' })).toBeNull();
    expect(contactDinComanda({ passenger_name: 'Pop Ion', phone: '+40712345678' })).toBeNull();
    expect(contactDinComanda(null)).toBeNull();
  });
  it('ziua e a Chișinăului: 23:30 UTC pe 4 oct = 5 oct acolo', () => {
    expect(ziuaChisinau(Date.UTC(2026, 9, 4, 23, 30))).toBe('2026-10-05');
    expect(ziuaChisinau(Date.UTC(2026, 9, 4, 20, 30))).toBe('2026-10-04');
  });
});
