import { beforeEach, describe, expect, it, vi } from 'vitest';

// Proba fizică (migr. 532, critica C3): biletul pe care șoferul nu are voie să-l vadă e tratat ca ABSENT în tot răspunsul
// scanării — nici actualizare, nici nume, loc, cursă sau locuri rămase. În ambele sensuri: șofer real + bilet de probă,
// șofer de probă + bilet real; plus comanda necitită.

const stare = vi.hoisted(() => ({
  sofer: { id: 'sofer-real', nume: 'Real', telegram_id: 1, is_test: false },
  bilet: null as Record<string, unknown> | null,
  updates: 0, inserturi: [] as Array<Record<string, unknown>>, numarari: 0,
}));

vi.mock('@/lib/bilete/sofer-auth', () => ({ autentificaSofer: async () => ({ ok: true, sofer: stare.sofer }) }));
vi.mock('@/lib/bilete/sofer', () => ({ curseleSoferului: async () => [{ crm_route_id: 7, going_north: false }] }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (tabel: string) => {
      const q: Record<string, unknown> = {};
      const lant = () => q;
      Object.assign(q, {
        select: (_s: string, o?: { head?: boolean }) => { if (o?.head) stare.numarari++; return q; },
        eq: lant, limit: async () => ({ data: [] }),
        maybeSingle: async () => ({ data: tabel === 'bilete' ? stare.bilet : null, error: null }),
        update: () => { stare.updates++; return q; },
        insert: async (r: Record<string, unknown>) => { stare.inserturi.push(r); return { error: null }; },
        then: (rez: (v: unknown) => void) => rez({ count: 3, data: [{ id: 'x' }], error: null }),
      });
      return q;
    },
  }),
}));

import { POST } from './route';

const COD = 'ABCDEFGHJKMNPQRSTVWX'; // alfabetul COD_QR_RE (fără I, L, O, U)
const bilet = (comanda: Record<string, unknown> | null) => ({
  id: 'b1', comanda_id: 'c1', cod_qr: COD, nr: 1, loc_nr: 4, status: 'valid', urcat_at: null, urcat_de: null,
  trip_date: '2026-10-08', crm_route_id: 7, going_north: false, comanda,
});
const COMANDA = { passenger_name: 'Ion Pop', from_name: 'Briceni', to_name: 'Edineț', departure_at: '2026-10-08T06:00:00Z' };
const cerere = () => new Request('https://x/api/bilete-sofer/scan', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-init-data': 'x' },
  body: JSON.stringify({ cheie: '2026-10-08|7|false', scanari: [{ cod: COD, moment_client: new Date().toISOString(), offline: false }] }),
});
const scaneaza = async () => (await (await POST(cerere() as never)).json()) as { rezultate?: Array<Record<string, unknown>> };

const ABSENT = { rezultat: 'necunoscut', loc_nr: null, nume: null, locuri_ramase_comanda: null, cursa_bilet: null, urcat_at: null, urcat_de_altul: false };

describe('scanarea — biletul nepermis e absent (532)', () => {
  beforeEach(() => { stare.updates = 0; stare.inserturi = []; stare.numarari = 0; });

  it('șofer real + bilet de probă → necunoscut, fără date, fără actualizare', async () => {
    stare.sofer = { id: 'sofer-real', nume: 'Real', telegram_id: 1, is_test: false };
    stare.bilet = bilet({ ...COMANDA, test: true, proba_fizica: true });
    const r = await scaneaza();
    expect(r.rezultate?.[0]).toMatchObject(ABSENT);
    expect(stare.updates).toBe(0);
    expect(stare.numarari).toBe(0);
    expect(stare.inserturi[0]).toMatchObject({ rezultat: 'necunoscut', cursa_bilet: null });
  });

  it('șofer de probă + bilet real → necunoscut, fără date', async () => {
    stare.sofer = { id: 'sofer-proba', nume: 'Proba', telegram_id: 2, is_test: true };
    stare.bilet = bilet({ ...COMANDA, test: false, proba_fizica: false });
    expect((await scaneaza()).rezultate?.[0]).toMatchObject(ABSENT);
    expect(stare.updates).toBe(0);
  });

  it('comanda necitită (null) → necunoscut, la ambii șoferi', async () => {
    for (const is_test of [false, true]) {
      stare.sofer = { id: 's', nume: 'S', telegram_id: 3, is_test };
      stare.bilet = bilet(null);
      expect((await scaneaza()).rezultate?.[0]).toMatchObject(ABSENT);
    }
    expect(stare.updates).toBe(0);
  });

  it('șofer de probă + bilet de probă → ok, cu numele pasagerului', async () => {
    stare.sofer = { id: 'sofer-proba', nume: 'Proba', telegram_id: 2, is_test: true };
    stare.bilet = bilet({ ...COMANDA, test: true, proba_fizica: true });
    const r = (await scaneaza()).rezultate?.[0];
    expect(r).toMatchObject({ rezultat: 'ok', nume: 'Ion Pop', loc_nr: 4 });
    expect(stare.updates).toBe(1);
  });

  it('șofer real + bilet real → ok (neschimbat)', async () => {
    stare.sofer = { id: 'sofer-real', nume: 'Real', telegram_id: 1, is_test: false };
    stare.bilet = bilet({ ...COMANDA, test: false, proba_fizica: false });
    expect((await scaneaza()).rezultate?.[0]).toMatchObject({ rezultat: 'ok', nume: 'Ion Pop' });
  });
});
