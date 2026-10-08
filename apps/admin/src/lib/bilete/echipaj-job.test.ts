import { beforeEach, describe, expect, it, vi } from 'vitest';

// Jobul G (migr. 538): revendicarea, trimiterea și ce se scrie după fiecare clasă de răspuns Telegram (C1); dry nu
// scrie și nu trimite; bugetul oprește trimiterile (C3).

const s = vi.hoisted(() => ({
  comenzi: [] as Array<Record<string, unknown>>, revendicat: true, rezultat: 'trimis' as string,
  updates: [] as Array<Record<string, unknown>>, trimise: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      let upd: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {};
      const lant = () => q;
      Object.assign(q, {
        select: lant, eq: lant, not: lant, is: lant, or: lant, gt: lant, lt: lant, order: lant,
        update: (v: Record<string, unknown>) => { upd = v; return q; },
        range: async () => ({ data: s.comenzi, error: null }),
        then: (rez: (v: unknown) => void) => {
          if (upd) {
            s.updates.push(upd);
            const eRev = 'echipaj_revendicat_la' in upd && upd.echipaj_revendicat_la !== null;
            rez({ data: eRev ? (s.revendicat ? [{ id: 'c1' }] : []) : null, error: null });
          } else rez({ data: [], error: null });
        },
      });
      return q;
    },
  }),
}));
vi.mock('./echipaj', () => ({
  echipajeZile: async () => () => ({ stare: 'gata', placa: '651 AKD', prenume: 'Ion', telefon: '+373 69 123 456', vehicle_id: 'v1', driver_id: 'd1' }),
  trimiteLaClient: async (_id: number, text: string) => { s.trimise.push(text); return s.rezultat; },
}));

import { ruleazaEchipajul } from './echipaj-job';

const ACUM = Date.parse('2026-10-08T09:00:00Z'); // 12:00 Chișinău
const comanda = (o: Record<string, unknown> = {}) => ({
  id: 'c1', trip_date: '2026-10-09', crm_route_id: 7, going_north: false, departure_at: '2026-10-09T03:00:00Z', lang: 'ro',
  from_name: 'Briceni', to_name: 'Chișinău', telegram_id: 111, telegram_verificat_pentru: 111, test: false, proba_fizica: false,
  echipaj_trimis: null, echipaj_mesaje: 0, echipaj_revendicat_la: null, ...o,
});
const ruleaza = (dry = false, ramas = 20_000) => ruleazaEchipajul({ dry, ramasMs: () => ramas, nowMs: ACUM });

describe('jobul G — echipajul în chat', () => {
  beforeEach(() => { s.comenzi = [comanda()]; s.revendicat = true; s.rezultat = 'trimis'; s.updates = []; s.trimise = []; });

  it('prima dată: trimite «Autobuzul tău», fără telefon în afara ferestrei, și scrie cheia', async () => {
    const r = await ruleaza();
    expect(r).toMatchObject({ verificate: 1, de_trimis: 1, trimise: 1 });
    expect(s.trimise[0]).toContain('Autobuzul tău'); expect(s.trimise[0]).not.toContain('+373 69');
    expect(s.updates.at(-1)).toMatchObject({ echipaj_trimis: 'v1|d1|-', echipaj_mesaje: 1, echipaj_revendicat_la: null });
  });
  it('aceeași cheie deja trimisă → nimic', async () => {
    s.comenzi = [comanda({ echipaj_trimis: 'v1|d1|-', echipaj_mesaje: 1 })];
    expect(await ruleaza()).toMatchObject({ de_trimis: 0, trimise: 0 }); expect(s.trimise).toHaveLength(0);
  });
  it('revendicarea pierdută → nu trimite', async () => {
    s.revendicat = false;
    expect(await ruleaza()).toMatchObject({ trimise: 0 }); expect(s.trimise).toHaveLength(0);
  });
  it('blocat → echipaj_refuzat_la; temporar → doar eliberează; incert → considerat trimis', async () => {
    s.rezultat = 'blocat'; await ruleaza();
    expect(s.updates.at(-1)).toHaveProperty('echipaj_refuzat_la'); expect(s.updates.at(-1)).not.toHaveProperty('echipaj_trimis');
    s.updates = []; s.rezultat = 'temporar'; expect(await ruleaza()).toMatchObject({ temporare: 1 });
    expect(s.updates.at(-1)).toEqual({ echipaj_revendicat_la: null });
    s.updates = []; s.rezultat = 'incert'; await ruleaza();
    expect(s.updates.at(-1)).toMatchObject({ echipaj_trimis: 'v1|d1|-' });
  });
  it('dry nu scrie și nu trimite; bugetul aproape gata → nu trimite', async () => {
    expect(await ruleaza(true)).toMatchObject({ de_trimis: 1, trimise: 0 }); expect(s.updates).toHaveLength(0);
    expect(await ruleaza(false, 3000)).toMatchObject({ trimise: 0 }); expect(s.trimise).toHaveLength(0);
  });
  it('contul verificat, în fereastra de 3 h → mesajul are telefonul', async () => {
    s.comenzi = [comanda({ departure_at: '2026-10-08T11:00:00Z' })];
    await ruleaza(); expect(s.trimise[0]).toContain('📞 +373 69 123 456');
    s.trimise = []; s.comenzi = [comanda({ departure_at: '2026-10-08T11:00:00Z', telegram_verificat_pentru: null })];
    await ruleaza(); expect(s.trimise[0]).not.toContain('+373 69');
  });
});
