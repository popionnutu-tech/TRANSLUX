import { beforeEach, describe, expect, it, vi } from 'vitest';

// N3 + F15 (564, Codex r3 C3): amprenta alegerii verificată în TOATE ramurile care refolosesc o comandă — cheia existentă,
// sesiunea veche deschisă la bancă, returul din pachet, rândul întors de bilete_creeaza_comanda (cererea concurentă) — pe
// o bază falsă în memorie. Aceeași cerere → aceeași comandă (și tur-returul identic după eroarea maib); altă alegere cu
// aceeași cheie → «idempotenta»; un al doilea retur din pachet nu se creează.

type Rand = Record<string, unknown> & { id: string };
const fake = vi.hoisted(() => ({
  comenzi: [] as Array<Record<string, unknown> & { id: string }>,
  checkouts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ table: string; f: Record<string, unknown>; v: Record<string, unknown> }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (_n: string, _a: Record<string, unknown>): any => ({ data: null, error: null }),
  rpcApeluri: [] as Array<{ n: string; a: Record<string, unknown> }>,
  createCheckout: vi.fn(async () => ({ checkoutId: 'ck-nou', checkoutUrl: 'https://maib.test/nou' })),
  findCheckout: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => {
  class Q {
    f: Record<string, unknown> = {};
    upd: Record<string, unknown> | null = null;
    constructor(public table: string) {}
    select() { return this; }
    eq(k: string, v: unknown) { this.f[k] = v; return this; }
    in(k: string, v: unknown) { this.f[`in:${k}`] = v; return this; }
    is(k: string, v: unknown) { this.f[`is:${k}`] = v; return this; }
    or() { return this; }
    limit() { return this; }
    order() { return this; }
    update(v: Record<string, unknown>) { this.upd = v; return this; }
    insert() { return Promise.resolve({ data: null, error: null }); }
    randuri(): Array<Record<string, unknown>> {
      const sursa = this.table === 'bilete_comenzi' ? fake.comenzi : this.table === 'maib_checkouts' ? fake.checkouts : [];
      return sursa.filter((r) => Object.entries(this.f).every(([k, v]) => {
        if (k.startsWith('in:')) return (v as unknown[]).includes(r[k.slice(3)]);
        if (k.startsWith('is:')) return (r[k.slice(3)] ?? null) === v;
        return r[k] === v;
      }));
    }
    maybeSingle() { return Promise.resolve({ data: this.randuri()[0] ?? null, error: null }); }
    single() { return this.maybeSingle(); }
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      if (this.upd) {
        const r = this.randuri();
        fake.updates.push({ table: this.table, f: this.f, v: this.upd });
        for (const x of r) Object.assign(x, this.upd);
        return Promise.resolve({ data: r.map((x) => ({ id: x.id })), error: null }).then(res, rej);
      }
      const r = this.randuri();
      return Promise.resolve({ data: r, count: r.length, error: null }).then(res, rej);
    }
  }
  return {
    getSupabase: () => ({
      from: (t: string) => new Q(t),
      rpc: async (n: string, a: Record<string, unknown>) => { fake.rpcApeluri.push({ n, a }); return fake.rpc(n, a); },
    }),
  };
});
vi.mock('@/lib/maib/client', () => ({
  createCheckout: fake.createCheckout,
  findCheckoutByOrderId: fake.findCheckout,
  MaibError: class MaibError extends Error { status = 500; },
}));
vi.mock('@/lib/maib/persist', () => ({ persistaCheckout: async () => ({ error: null }) }));
vi.mock('./anunta-botul', () => ({ anuntaBotul: async () => undefined }));
vi.mock('./puncte', () => ({ puncteActive: async () => [], localitateaPunctului: async () => null }));
vi.mock('./promo-server', () => ({
  citestePromoConfig: async () => ({ activ: true, pct: 20 }),
  calculeazaPromo: async (x: { pret: number }) => ({ pret: x.pret, pretIntreg: x.pret, reducere: null, promoPereche: true }),
  cotaCursei: () => ({ chei: null, cota: null }),
  plafoaneCursei: () => null,
  localitateNeinceputa: () => null,
}));
vi.mock('./reguli', () => ({
  calculeazaDepartureAt: (d: string) => `${d}T06:00:00+03:00`,
  cursaDupaDataDeStart: () => true,
  vanzareDeschisa: () => true,
}));
vi.mock('@translux/db', async (orig) => {
  const m = await orig<typeof import('@translux/db')>();
  return {
    ...m,
    incarcaCurse: async (_db: unknown, q: { fromRo: string; toRo: string }) => ({
      fromStops: [{ crm_route_id: 11, stop_order: 1, name_ro: q.fromRo }, { crm_route_id: 12, stop_order: 1, name_ro: q.fromRo }],
      toStops: [{ crm_route_id: 11, stop_order: 9, name_ro: q.toRo }, { crm_route_id: 12, stop_order: 9, name_ro: q.toRo }],
      routes: [{ id: 11, time_chisinau: null, time_nord: null }, { id: 12, time_chisinau: null, time_nord: null }],
    }),
    calculeazaCurse: () => [{ routeId: 11, goingNorth: false, price: 150, time: '06:00' }, { routeId: 12, goingNorth: true, price: 150, time: '15:00' }],
  };
});

import { amprentaAlegerii } from './amprenta';
import { creeazaComanda, type ComandaInput } from './comenzi';

const azi = new Date();
const zi = (n: number) => new Date(azi.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const K_TUR = '11111111-1111-4111-8111-111111111111';
const K_RET = '22222222-2222-4222-8222-222222222222';
const K_VECHE = '33333333-3333-4333-8333-333333333333';
const OPT = { mod: 'test_admin' as const, bazaAdmin: 'https://admin.test', bazaSite: 'https://site.test' };

const intrare = (x: Partial<ComandaInput> = {}): ComandaInput => ({
  tripDate: zi(3), crmRouteId: 11, goingNorth: false, fromRo: 'Bălți', toRo: 'Chișinău', seats: 1,
  passengerName: 'Popescu Ana', phone: '069123456', email: null, idempotencyKey: K_TUR, ...x,
});
const turRetur = (x: Partial<ComandaInput> = {}) => intrare({
  retur: { tripDate: zi(5), crmRouteId: 12, goingNorth: true, fromRo: 'Chișinău', toRo: 'Bălți', idempotencyKey: K_RET, locuriAlese: [4] }, ...x,
});
/** Amprenta pe care o calculează serverul pentru o intrare (aceeași normalizare ca valideaza). */
const amprenta = (i: ComandaInput) => amprentaAlegerii({
  ...i, passengerName: i.passengerName.trim().replace(/\s+/g, ' '), phone: '37369123456', email: i.email ?? null, locuriAlese: i.locuriAlese ?? null,
  retur: i.retur ? { ...i.retur, locuriAlese: i.retur.locuriAlese ?? null } : null,
});
const rand = (x: Partial<Rand> & { id: string }): Rand => ({
  status: 'noua', checkout_id: null, created_at: new Date().toISOString(), creare_incercari: 0, creare_in_curs_la: null, total: 150,
  trip_date: zi(3), crm_route_id: 11, going_north: false, seats: 1, phone: '37369123456', lang: 'ro', cod: 'c', from_name: 'Bălți',
  to_name: 'Chișinău', departure_at: `${zi(3)}T06:00:00+03:00`, passenger_name: 'Popescu Ana', in_pachet: false, comanda_tur_id: null, ...x,
});
const cod = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { cod?: string }).cod ?? (e as Error).message; } };

beforeEach(() => {
  fake.comenzi = []; fake.checkouts = []; fake.updates = []; fake.rpcApeluri = [];
  fake.createCheckout.mockClear(); fake.findCheckout.mockReset(); fake.findCheckout.mockResolvedValue(null);
  fake.rpc = () => ({ data: null, error: null });
});

describe('ramura «cheia există»: doar aceeași amprentă', () => {
  it('aceeași cerere → sesiunea comenzii existente, fără comandă nouă', async () => {
    fake.comenzi.push(rand({ id: 't1', idempotency_key: K_TUR, checkout_id: 'ck1', amprenta: amprenta(intrare()) }));
    fake.checkouts.push({ checkout_id: 'ck1', checkout_url: 'https://maib.test/ck1' });
    const r = await creeazaComanda(intrare(), OPT);
    expect(r.checkoutUrl).toBe('https://maib.test/ck1');
    expect(fake.rpcApeluri.filter((x) => x.n === 'bilete_creeaza_comanda')).toHaveLength(0);
  });
  const alte: Array<[string, Partial<ComandaInput>]> = [
    ['alt nume', { passengerName: 'Popescu Ion' }], ['alt e-mail', { email: 'alt@mail.md' }], ['alt punct', { punctUrcareId: 9 }],
    ['altă oprire', { fromRo: 'Fălești' }], ['alt cod de retur', { codRetur: 'b'.repeat(64) }], ['alt telefon', { phone: '069123457' }],
    ['alt număr de locuri', { seats: 2 }], ['retur adăugat', { retur: turRetur().retur }],
  ];
  for (const [ce, x] of alte) {
    it(`${ce}, aceeași cheie → «idempotenta», nicio sesiune`, async () => {
      fake.comenzi.push(rand({ id: 't1', idempotency_key: K_TUR, checkout_id: 'ck1', amprenta: amprenta(intrare()) }));
      fake.checkouts.push({ checkout_id: 'ck1', checkout_url: 'https://maib.test/ck1' });
      expect(await cod(creeazaComanda(intrare(x), OPT))).toBe('idempotenta');
      expect(fake.createCheckout).not.toHaveBeenCalled();
    });
  }
  it('comanda fără amprentă (de dinainte de 564) nu se refolosește', async () => {
    fake.comenzi.push(rand({ id: 't1', idempotency_key: K_TUR, checkout_id: 'ck1', amprenta: null }));
    expect(await cod(creeazaComanda(intrare(), OPT))).toBe('idempotenta');
  });
  it('altă alegere a locurilor (retur, spre nord) → «idempotenta»', async () => {
    const i = intrare({ crmRouteId: 12, goingNorth: true, fromRo: 'Chișinău', toRo: 'Bălți', locuriAlese: [3] });
    fake.comenzi.push(rand({ id: 't1', idempotency_key: K_TUR, crm_route_id: 12, going_north: true, checkout_id: 'ck1', amprenta: amprenta(i) }));
    fake.checkouts.push({ checkout_id: 'ck1', checkout_url: 'https://maib.test/ck1' });
    expect((await creeazaComanda(i, OPT)).checkoutUrl).toBe('https://maib.test/ck1');
    expect(await cod(creeazaComanda({ ...i, locuriAlese: [4] }, OPT))).toBe('idempotenta');
  });
});

describe('cererea concurentă: rândul întors de bilete_creeaza_comanda', () => {
  it('rândul altei cereri (altă amprentă) → «idempotenta», nicio sesiune pe el', async () => {
    fake.rpc = (n) => n === 'bilete_creeaza_comanda' ? { data: rand({ id: 'alta', idempotency_key: K_TUR, amprenta: 'a1:alta-cerere' }), error: null } : { data: null, error: null };
    expect(await cod(creeazaComanda(intrare(), OPT))).toBe('idempotenta');
    expect(fake.createCheckout).not.toHaveBeenCalled();
  });
  it('refuzul din bază sub lacăt (IDEMPOTENTA_CONTINUT) → «idempotenta»', async () => {
    fake.rpc = (n) => n === 'bilete_creeaza_comanda' ? { data: null, error: { message: 'IDEMPOTENTA_CONTINUT' } } : { data: null, error: null };
    expect(await cod(creeazaComanda(intrare(), OPT))).toBe('idempotenta');
  });
  it('rândul cererii identice (aceeași amprentă) → aceeași comandă, sesiunea ei; amprenta trimisă în p', async () => {
    fake.rpc = (n, a) => {
      if (n !== 'bilete_creeaza_comanda') return { data: null, error: null };
      const p = a.p as Record<string, unknown>;
      const r = rand({ id: 'castig', idempotency_key: K_TUR, amprenta: p.amprenta as string });
      fake.comenzi.push(r);
      return { data: r, error: null };
    };
    const r = await creeazaComanda(intrare(), OPT);
    expect(r.checkoutUrl).toBe('https://maib.test/nou');
    expect((fake.rpcApeluri[0].a.p as Record<string, unknown>).amprenta).toBe(amprenta(intrare()));
  });
  it('baza fără coloană (564 neaplicată): rândul fără câmp nu e refuzat', async () => {
    fake.rpc = (n) => {
      if (n !== 'bilete_creeaza_comanda') return { data: null, error: null };
      const r = rand({ id: 'vechi', idempotency_key: K_TUR }); fake.comenzi.push(r); return { data: r, error: null };
    };
    expect((await creeazaComanda(intrare(), OPT)).checkoutUrl).toBe('https://maib.test/nou');
  });
});

describe('tur-retur: reluarea identică merge, al doilea retur nu (F15)', () => {
  const pachet = (stareRetur: string, ampRetur?: string) => {
    const a = amprenta(turRetur());
    fake.comenzi.push(rand({ id: 't1', idempotency_key: K_TUR, status: 'eroare_creare', creare_incercari: 1, amprenta: a }));
    fake.comenzi.push(rand({ id: 'r1', idempotency_key: K_RET, status: stareRetur, comanda_tur_id: 't1', in_pachet: true, total: 120, crm_route_id: 12, going_north: true, amprenta: ampRetur ?? a }));
  };
  it('reluarea identică după eroarea maib → sesiune nouă pe ACELAȘI tur (suma turului + returului)', async () => {
    pachet('noua');
    const r = await creeazaComanda(turRetur(), OPT);
    expect(r.comanda.id).toBe('t1');
    expect(fake.createCheckout).toHaveBeenCalledTimes(1);
    expect((fake.createCheckout.mock.calls[0] as unknown as [{ amount: number }])[0].amount).toBe(270);
    expect(fake.rpcApeluri.filter((x) => x.n === 'bilete_creeaza_comanda')).toHaveLength(0);
  });
  it('alte locuri la retur, aceeași cheie → «idempotenta»', async () => {
    pachet('noua');
    expect(await cod(creeazaComanda(turRetur({ retur: { ...turRetur().retur!, locuriAlese: [5] } }), OPT))).toBe('idempotenta');
  });
  it('returul expirat → al doilea retur NU se creează («idempotenta»), turul nu se plătește singur', async () => {
    pachet('expirata');
    expect(await cod(creeazaComanda(turRetur(), OPT))).toBe('idempotenta');
    expect(fake.rpcApeluri.filter((x) => x.n === 'bilete_creeaza_comanda')).toHaveLength(0);
    expect(fake.createCheckout).not.toHaveBeenCalled();
  });
  it('returul cu altă amprentă (date vechi) → «idempotenta»', async () => {
    pachet('noua', 'a1:alt-retur');
    expect(await cod(creeazaComanda(turRetur(), OPT))).toBe('idempotenta');
  });
  it('cerere nouă: returul refuzat în bază ca existent (RETUR_PACHET_EXISTENT) → «idempotenta», turul NU se expiră', async () => {
    fake.rpc = (n, a) => {
      if (n !== 'bilete_creeaza_comanda') return { data: null, error: null };
      const p = a.p as Record<string, unknown>;
      if (p.in_pachet) return { data: null, error: { message: 'RETUR_PACHET_EXISTENT' } };
      const r = rand({ id: 'tnou', idempotency_key: K_TUR, amprenta: p.amprenta as string, promo_pereche: true }); fake.comenzi.push(r); return { data: r, error: null };
    };
    expect(await cod(creeazaComanda(turRetur(), OPT))).toBe('idempotenta');
    expect(fake.updates.filter((u) => u.v.status === 'expirata')).toHaveLength(0);
  });
  it('cerere nouă: returul cade din alt motiv (loc ocupat) → turul abia creat se expiră (551)', async () => {
    fake.rpc = (n, a) => {
      if (n !== 'bilete_creeaza_comanda') return { data: null, error: null };
      const p = a.p as Record<string, unknown>;
      if (p.in_pachet) return { data: null, error: { message: 'LOC_OCUPAT:4' } };
      const r = rand({ id: 'tnou', idempotency_key: K_TUR, amprenta: p.amprenta as string, promo_pereche: true }); fake.comenzi.push(r); return { data: r, error: null };
    };
    expect(await cod(creeazaComanda(turRetur(), OPT))).toBe('loc_ocupat');
    expect(fake.updates.filter((u) => u.v.status === 'expirata')).toHaveLength(1);
  });
});

describe('«Reia plata»: sesiunea veche deschisă la bancă se dă doar pentru aceeași alegere', () => {
  const veche = (amp: string) => {
    fake.comenzi.push(rand({ id: 'v1', idempotency_key: K_VECHE, checkout_id: 'ckv', amprenta: amp }));
    fake.checkouts.push({ checkout_id: 'ckv', status: 'Pending', checkout_url: 'https://maib.test/veche' });
    fake.rpc = (n) => n === 'bilete_inlocuieste_incercare' ? { data: 'la_banca', error: null } : { data: null, error: null };
  };
  it('aceeași alegere, chei noi + cheia veche în `inlocuieste` → aceeași pagină a băncii', async () => {
    veche(amprenta(intrare()));
    const r = await creeazaComanda(intrare({ inlocuieste: [K_VECHE] }), OPT);
    expect(r.checkoutUrl).toBe('https://maib.test/veche');
    expect(fake.createCheckout).not.toHaveBeenCalled();
  });
  it('alt nume → «plata de dinainte e încă deschisă» (in_lucru), nicio a doua sesiune', async () => {
    veche(amprenta(intrare()));
    expect(await cod(creeazaComanda(intrare({ inlocuieste: [K_VECHE], passengerName: 'Alt Om' }), OPT))).toBe('in_lucru');
    expect(fake.createCheckout).not.toHaveBeenCalled();
  });
});
