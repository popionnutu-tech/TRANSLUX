import { describe, expect, it, vi } from 'vitest';
import { semneazaInitData } from '@/lib/telegram/init-data';
import type { ComandaPublica } from './public';
import {
  bileteleClientului, CITITE_IN_PLUS, contactDinComanda, MAX_COMENZI_CLIENT, telegramDinInitData, ziuaChisinau,
  type ComandaContului, type RepoBileteClient,
} from './client-bilete';

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
    ultimulContact: vi.fn(async (id: number) => (id === EU ? { passenger_name: 'Pop Ion', phone: '37368263753', email: 'Ion@Exemplu.md' } : null)),
    istoric: vi.fn(async (id: number) => [
      { cod: 'i1', telegram_id: id, status: 'returnata', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-09-01T03:00:00Z', seats: 1, total: 135 },
      { cod: 'strain', telegram_id: 1, status: 'platita', from_name: 'X', to_name: 'Y', departure_at: '2026-09-02T03:00:00Z', seats: 1, total: 99 },
    ]),
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
    expect(r.contact).toEqual({ nume: 'Pop', prenume: 'Ion', telefon: '37368263753', email: 'ion@exemplu.md' });
    // istoricul: doar călătoriile contului, fără telegram_id în răspuns
    expect(r.ok && r.istoric.map((c) => c.cod)).toEqual(['i1']);
    expect(r.ok && Object.keys(r.istoric[0])).not.toContain('telegram_id');
    // ION-252: se citesc plecările din ultimele 20 h 30 min (cea mai lungă cursă + marja), cu câteva în plus
    expect(repo.comenziActive).toHaveBeenCalledWith(EU, '2026-10-04T12:30:00.000Z', MAX_COMENZI_CLIENT + CITITE_IN_PLUS);
  });

  it('ION-252: biletul cu cursa încheiată (sosirea + 30 min) nu mai e în «Biletele mele»; cel pe drum și cele viitoare rămân', async () => {
    // acum = 05.10, 12:00 Chișinău
    const curse: Record<string, Partial<ComandaPublica>> = {
      ['1'.repeat(32)]: { departure_at: '2026-10-05T05:45:00+03:00', sosire: '09:30' }, // sosită 09:30 → încheiată 10:00
      ['2'.repeat(32)]: { trip_date: '2026-10-04', departure_at: '2026-10-04T22:00:00+03:00', sosire: '01:30' }, // peste noapte, încheiată
      ['3'.repeat(32)]: { departure_at: '2026-10-05T10:00:00+03:00', sosire: '13:00' }, // pe drum
      ['4'.repeat(32)]: { departure_at: '2026-10-05T07:00:00+03:00', sosire: null }, // fără oră: 07:00 + 6 h = 13:00, încă nu
      ['5'.repeat(32)]: { departure_at: '2026-10-05T05:00:00+03:00', sosire: null }, // fără oră: 11:00, încheiată
      ['6'.repeat(32)]: { departure_at: '2026-10-06T05:45:00+03:00', sosire: '09:30', trip_date: '2026-10-06' }, // mâine
    };
    const repo: RepoBileteClient = {
      ...repoFals(),
      comenziActive: vi.fn(async () => Object.keys(curse).map((cod) => ({ cod, telegram_id: EU }))),
      biletComplet: vi.fn(async (cod: string) => ({ ...comandaPublica(cod), ...curse[cod] })),
    };
    const r = await cere(initDataPentru(EU), repo);
    expect(r.ok && r.bilete.map((b) => b.cod[0])).toEqual(['3', '4', '6']);
  });

  it('ION-252: cele încheiate nu ocupă locurile celor viitoare (plafonul de 10 se aplică după filtru)', async () => {
    const coduri = Array.from({ length: 14 }, (_, i) => i.toString(16).padStart(32, '0'));
    const repo: RepoBileteClient = {
      ...repoFals(),
      comenziActive: vi.fn(async () => coduri.map((cod) => ({ cod, telegram_id: EU }))),
      // primele 4 încheiate azi dimineață, restul în viitor
      biletComplet: vi.fn(async (cod: string) => ({
        ...comandaPublica(cod),
        ...(coduri.indexOf(cod) < 4 ? { departure_at: '2026-10-05T05:45:00+03:00', sosire: '09:30' } : {}),
      })),
    };
    const r = await cere(initDataPentru(EU), repo);
    expect(r.ok && r.bilete.map((b) => b.cod)).toEqual(coduri.slice(4, 4 + MAX_COMENZI_CLIENT));
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
    expect(contactDinComanda({ passenger_name: '  Popescu   Ion Vasile ', phone: '373 68 263 753' })).toEqual({ nume: 'Popescu', prenume: 'Ion Vasile', telefon: '37368263753', email: null });
    expect(contactDinComanda({ passenger_name: 'Pop Ion', phone: '37368263753', email: 'nu-e-email' })?.email).toBeNull();
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

describe('telegramDinInitData — legarea comenzii la cumpărarea din mini app (ION-249)', () => {
  it('initData valid → contul; falsificat, expirat, lipsă sau fără token → null (cumpărarea merge fără legare)', () => {
    expect(telegramDinInitData(initDataPentru(EU), TOKEN, ACUM_MS)).toBe(EU);
    expect(telegramDinInitData(initDataPentru(EU), 'alt:TOKEN', ACUM_MS)).toBeNull();
    expect(telegramDinInitData(initDataPentru(EU, ACUM_S - 25 * 3600), TOKEN, ACUM_MS)).toBeNull();
    expect(telegramDinInitData(initDataPentru(EU).replace(String(EU), String(ALTUL)), TOKEN, ACUM_MS)).toBeNull();
    expect(telegramDinInitData('', TOKEN, ACUM_MS)).toBeNull();
    expect(telegramDinInitData(null, TOKEN, ACUM_MS)).toBeNull();
    expect(telegramDinInitData(initDataPentru(EU), undefined, ACUM_MS)).toBeNull();
  });
});

describe('ION-276: calea pe lot (bileteActiveComplete) — plafonul în paralel, același rezultat', () => {
  function repoLot(o: { scurge?: boolean; plafon?: boolean } = {}) {
    const repo = repoFals(o);
    repo.bileteActiveComplete = vi.fn(async (id: number) => [
      { ...comandaPublica('a'.repeat(32)), telegram_id: EU },
      { ...comandaPublica('b'.repeat(32)), telegram_id: ALTUL },
      // încheiată: plecată ieri, sosirea ieri → nu mai apare
      { ...comandaPublica('d'.repeat(32)), departure_at: '2026-10-04T14:00:00+03:00', trip_date: '2026-10-04', telegram_id: EU },
      { ...comandaPublica('c'.repeat(32)), telegram_id: EU },
    ].filter((c) => o.scurge || c.telegram_id === id));
    return repo;
  }
  it('dă aceleași bilete ca vechea cale, fără biletComplet pe comandă și fără telegram_id în răspuns', async () => {
    const repo = repoLot();
    const r = await cere(initDataPentru(EU), repo);
    expect(r.ok && r.bilete.map((b) => b.cod)).toEqual(['a'.repeat(32), 'c'.repeat(32)]);
    expect(r.ok && Object.keys(r.bilete[0])).not.toContain('telegram_id');
    expect(repo.biletComplet).not.toHaveBeenCalled();
    expect(repo.comenziActive).not.toHaveBeenCalled();
    expect(r.ok && r.contact?.telefon).toBe('37368263753');
  });
  it('interogarea care «scurge» alte conturi nu scurge nimic în răspuns', async () => {
    const r = await cere(initDataPentru(EU), repoLot({ scurge: true }));
    expect(r.ok && r.bilete.map((b) => b.cod)).toEqual(['a'.repeat(32), 'c'.repeat(32)]);
  });
  it('plafon depășit → 429, chiar dacă citirile au mers în paralel', async () => {
    const r = await cere(initDataPentru(EU), repoLot({ plafon: false }));
    expect(r).toEqual({ ok: false, status: 429, eroare: 'prea_multe' });
  });
});
