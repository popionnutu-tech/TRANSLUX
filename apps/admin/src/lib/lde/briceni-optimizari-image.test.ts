import { describe, it, expect, vi, beforeEach } from 'vitest';

// Contractul posterului Trox + suburban Briceni (ION-73): Ion vrea să-l vadă întâi, deci fără ?send=1 NU pleacă
// nimic în Telegram și nu se scrie cheia de dedup.
const trimise: unknown[] = [];
const upsert = vi.fn();
vi.mock('../telegram-notify', () => ({ sendTelegramPhoto: vi.fn(async (...a: unknown[]) => { trimise.push(a); return { ok: true }; }) }));
vi.mock('../poster-sablon', () => ({
  CULORI: { griDeschis: '', gri: '', text: '', verde: '', verdeFundal: '' },
  poster: () => ({ carduri() {}, tabel() {}, total() {}, nota() {}, png: async () => Buffer.from('png') }),
}));
const analiza = {
  uzina: 'BRICENI', saptamina: '2026-09-14', pana_la: '2026-09-20', zile: 1, zileBilantOk: 1, sumaRute: 10, faraTracker: [], zileInterurban: [],
  total: { cuOameni: 50, nepotrivita: 0, golRuta: 0, service: 0, deplasare: 0, livrare: 10, legatura: 0, necunoscut: 0, brambura: 0, lei: 60 },
  masini: [{ m: '904BRAN', zile: 1, total: 60, km: { cuOameni: 50, nepotrivita: 0, golRuta: 0, service: 0, deplasare: 0, livrare: 10, legatura: 0, necunoscut: 0 },
    brambura: 0, livrareZi: 10, lei: 60, leiZi: 60, steagBrambura: false, casa: 'Bălcăuți', deLamurit: 0, detalii: [] }],
  rute: [{ id: 'T2', nume: 'T2', livrare: 10, lei: 60, masini: ['904BRAN'] }],
};
vi.mock('../supabase', () => ({
  getSupabase: () => ({
    from: (t: string) => {
      const q = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: t === 'lde_analiza_reguli' ? { date: analiza } : t === 'app_config' ? { value: '-100' } : null }),
        upsert: (...a: unknown[]) => { upsert(...a); return Promise.resolve({}); },
      };
      return q;
    },
  }),
}));

import { posterBriceni } from './briceni-optimizari-image';

describe('posterul Briceni', () => {
  beforeEach(() => { trimise.length = 0; upsert.mockClear(); });
  it('fără trimite → întoarce imaginea, nu trimite și nu scrie cheia', async () => {
    const r = await posterBriceni({ saptamina: '2026-09-14', pana_la: '2026-09-20', trimite: false });
    expect(r.png).not.toBeNull();
    expect(r.trimis).toBe(false);
    expect(trimise).toHaveLength(0);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('cu trimite → pleacă o dată și marchează săptămâna', async () => {
    const r = await posterBriceni({ saptamina: '2026-09-14', pana_la: '2026-09-20', trimite: true });
    expect(r.trimis).toBe(true);
    expect(trimise).toHaveLength(1);
    expect(upsert).toHaveBeenCalledWith({ key: 'briceni_optimizari_poster_last', value: '2026-09-14' }, { onConflict: 'key' });
  });
});
