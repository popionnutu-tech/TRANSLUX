import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const {
  biletulCelMaiApropiat, citesteCifre, confirmaCuVerificare, creeazaHandlerCallbackRetur, creeazaHandlerMesajClient,
  handleStartClient, parseazaCallbackRetur, retineOferta, rutaMesaj,
} = await import('./retur.js');
const { PlafonApeluri } = await import('../services/returAi.js');

import type { BotContext } from '../types.js';
import type { PanouBilete, RezultatPanou, RaspunsOferta, RaspunsStare } from '../services/panouBilete.js';
import type { ComandaClient, RepoBileteClienti } from '../services/bileteClienti.js';
import type { ReturDeps } from './retur.js';

const ACUM = Date.parse('2026-10-13T08:00:00Z');
const COD = 'ab'.repeat(16);
const OFERTA_ID = '11111111-2222-3333-4444-555555555555';
const ME = 555;

const comanda = (over: Partial<ComandaClient> = {}): ComandaClient => ({
  cod: COD, status: 'platita', lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00',
  seats: 1, telegram_id: ME, trip_date: '2026-10-14', crm_route_id: 1655, going_north: false, ...over,
});

const OFERTA: RaspunsOferta = {
  tip: 'oferta', oferta_id: OFERTA_ID, suma: 135, total: 135, noimi: 9, expira_la: new Date(ACUM + 15 * 60_000).toISOString(),
  departure_at: '2026-10-14T05:45:00+03:00', from_name: 'Briceni', to_name: 'Chișinău', lang: 'ro',
};

const raspuns = <T>(r: T): RezultatPanou<T> => ({ tip: 'raspuns', raspuns: r });

function panouFals(over: Partial<PanouBilete> = {}): PanouBilete & { [K in keyof PanouBilete]: ReturnType<typeof vi.fn> } {
  return {
    bilete: vi.fn(async () => raspuns([])),
    oferta: vi.fn(async () => raspuns(OFERTA)),
    confirma: vi.fn(async () => raspuns<RaspunsStare>({ stare: 'creat', suma: 135 })),
    stare: vi.fn(async () => raspuns<RaspunsStare>({ stare: 'creat', suma: 135 })),
    escaladeaza: vi.fn(async () => raspuns<true>(true)),
    ...over,
  } as never;
}

function deps(p: { panou?: PanouBilete; comenzi?: ComandaClient[]; intentie?: string | null; telefon?: string | null } = {}): ReturDeps & { repo: RepoBileteClienti } {
  const repo: RepoBileteClienti = {
    comandaDupaCod: vi.fn(async () => comanda()),
    leagaComanda: vi.fn(async () => ME),
    comenziLegate: vi.fn(async () => p.comenzi ?? []),
    telefonSofer: vi.fn(async () => p.telefon ?? null),
  };
  return {
    panou: p.panou ?? panouFals(),
    repo,
    ai: { clasifica: vi.fn(async () => (p.intentie ? { intentie: p.intentie as never, lang: 'ro' as const } : null)) },
    plafonEscaladari: new PlafonApeluri(3, 600_000),
    now: () => ACUM,
  };
}

interface CtxFals {
  ctx: BotContext;
  replies: Array<{ text: string; butoane: string[] }>;
  answered: Array<unknown>;
}

function ctxFals(p: { text?: string; data?: string; dbUser?: unknown; chat?: string; session?: Record<string, unknown> } = {}): CtxFals {
  const replies: CtxFals['replies'] = [];
  const answered: unknown[] = [];
  const ctx = {
    chat: { type: p.chat ?? 'private', id: ME },
    from: { id: ME, language_code: 'ro' },
    message: p.text !== undefined ? { text: p.text } : undefined,
    callbackQuery: p.data ? { data: p.data } : undefined,
    dbUser: p.dbUser ?? null,
    session: p.session ?? {},
    reply: vi.fn(async (text: string, extra?: { reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } }) => {
      const butoane = (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => `${b.text}|${b.callback_data ?? ''}`);
      replies.push({ text, butoane });
    }),
    answerCallbackQuery: vi.fn(async (a?: unknown) => { answered.push(a); }),
    editMessageReplyMarkup: vi.fn(async () => {}),
  };
  return { ctx: ctx as unknown as BotContext, replies, answered };
}

describe('parseazaCallbackRetur', () => {
  it('formele valide', () => {
    expect(parseazaCallbackRetur(`retur:cere:${COD}`)).toEqual({ actiune: 'cere', cod: COD });
    expect(parseazaCallbackRetur(`retur:ok:${OFERTA_ID}`)).toEqual({ actiune: 'ok', ofertaId: OFERTA_ID });
    expect(parseazaCallbackRetur(`retur:stare:${OFERTA_ID.toUpperCase()}`)).toEqual({ actiune: 'stare', ofertaId: OFERTA_ID });
  });
  it('cod/uuid stricat sau telegram_id strecurat în date → null', () => {
    expect(parseazaCallbackRetur('retur:cere:123')).toBeNull();
    expect(parseazaCallbackRetur(`retur:ok:${OFERTA_ID}:999`)).toBeNull();
    expect(parseazaCallbackRetur('retur:plateste:x')).toBeNull();
    expect(parseazaCallbackRetur(undefined)).toBeNull();
  });
});

describe('rutaMesaj (client vs personal)', () => {
  const baza = { privat: true, text: 'vreau banii înapoi', asteaptaCifre: false, estePersonal: false };
  it('clientul fără cont de personal → se verifică biletele', () => {
    expect(rutaMesaj(baza)).toBe('verifica_bilete');
  });
  it('personalul, comenzile și grupele → mai departe (comportamentul de azi)', () => {
    expect(rutaMesaj({ ...baza, estePersonal: true })).toBe('mai_departe');
    expect(rutaMesaj({ ...baza, text: '/digest' })).toBe('mai_departe');
    expect(rutaMesaj({ ...baza, privat: false })).toBe('mai_departe');
  });
  it('cifrele așteptate au prioritate, și pentru personal; o comandă nu e luată drept cifre', () => {
    expect(rutaMesaj({ ...baza, text: '3456', asteaptaCifre: true, estePersonal: true })).toBe('cifre');
    expect(rutaMesaj({ ...baza, text: '/cancel', asteaptaCifre: true })).toBe('mai_departe');
  });
});

describe('reguli mici', () => {
  it('citesteCifre: 4 cifre (cu spații), alt număr de cifre, text cu litere', () => {
    expect(citesteCifre(' 34 56 ')).toEqual({ tip: 'cifre', cifre: '3456' });
    expect(citesteCifre('123')).toEqual({ tip: 'numeric_gresit' });
    expect(citesteCifre('am pierdut autobuzul')).toEqual({ tip: 'alt_text' });
  });
  it('retineOferta: cele mai recente 5, fără a muta sesiunea veche', () => {
    let s = {};
    const vechi = s;
    for (let i = 0; i < 7; i++) s = retineOferta(s, { ofertaId: `o${i}`, cod: COD, lang: 'ro', nowMs: i });
    expect(Object.keys((s as { oferte: object }).oferte).sort()).toEqual(['o2', 'o3', 'o4', 'o5', 'o6']);
    expect(vechi).toEqual({});
  });
  it('biletulCelMaiApropiat: cel tocmai plecat bate cel de mâine', () => {
    const plecat = comanda({ cod: 'c'.repeat(32), departure_at: new Date(ACUM - 30 * 60_000).toISOString() });
    expect(biletulCelMaiApropiat([comanda(), plecat], ACUM)?.cod).toBe('c'.repeat(32));
  });
});

describe('confirmaCuVerificare (corectura 11)', () => {
  it('timeout la confirma → citește starea, NU retrimite confirmarea', async () => {
    const panou = panouFals({
      confirma: vi.fn(async () => ({ tip: 'eroare', eroare: 'timeout' }) as const),
      stare: vi.fn(async () => raspuns<RaspunsStare>({ stare: 'in_curs', suma: 135 })),
    });
    expect(await confirmaCuVerificare(panou, ME, OFERTA_ID)).toEqual({ tip: 'stare', stare: { stare: 'in_curs', suma: 135 } });
    expect(panou.confirma).toHaveBeenCalledTimes(1);
    expect(panou.stare).toHaveBeenCalledWith(ME, OFERTA_ID);
  });
  it('nici starea nu vine → fara_raspuns; fără cheie → indisponibil, fără stare', async () => {
    const mort = panouFals({ confirma: vi.fn(async () => ({ tip: 'eroare', eroare: 'retea' }) as const), stare: vi.fn(async () => ({ tip: 'eroare', eroare: 'timeout' }) as const) });
    expect(await confirmaCuVerificare(mort, ME, OFERTA_ID)).toEqual({ tip: 'fara_raspuns' });
    const fara = panouFals({ confirma: vi.fn(async () => ({ tip: 'eroare', eroare: 'indisponibil' }) as const) });
    expect(await confirmaCuVerificare(fara, ME, OFERTA_ID)).toEqual({ tip: 'indisponibil' });
    expect(fara.stare).not.toHaveBeenCalled();
  });
});

describe('handlerul mesajelor', () => {
  it('personalul → next(), fără bază, fără AI', async () => {
    const d = deps({ comenzi: [comanda()], intentie: 'retur' });
    const { ctx, replies } = ctxFals({ text: 'salut', dbUser: { id: 'u1' } });
    const next = vi.fn(async () => {});
    await creeazaHandlerMesajClient(d)(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(d.repo.comenziLegate).not.toHaveBeenCalled();
    expect(replies).toHaveLength(0);
  });
  it('fără bilete legate → next() (răspunsul implicit rămâne)', async () => {
    const d = deps({ comenzi: [] });
    const next = vi.fn(async () => {});
    await creeazaHandlerMesajClient(d)(ctxFals({ text: 'salut' }).ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(d.ai.clasifica).not.toHaveBeenCalled();
  });
  it('client cu un bilet, intenția retur → oferta direct, cu butoanele de confirmare', async () => {
    const d = deps({ comenzi: [comanda()], intentie: 'retur' });
    const f = ctxFals({ text: 'vreau să returnez biletul' });
    await creeazaHandlerMesajClient(d)(f.ctx, vi.fn());
    expect(d.panou.oferta).toHaveBeenCalledWith(ME, COD, undefined);
    expect(f.replies[0].text).toContain('Primești înapoi 135 lei');
    expect(f.replies[0].butoane).toEqual([`Anulează biletul și primește 135 lei|retur:ok:${OFERTA_ID}`, `Păstrez biletul|retur:nu:${OFERTA_ID}`]);
  });
  it('AI fără răspuns → meniul cu butonul «Returnează» pe fiecare bilet viitor', async () => {
    const f = ctxFals({ text: '???' });
    await creeazaHandlerMesajClient(deps({ comenzi: [comanda()], intentie: null }))(f.ctx, vi.fn());
    expect(f.replies[0].butoane).toEqual([expect.stringMatching(new RegExp(`^↩️ Briceni → Chișinău.*\\|retur:cere:${COD}$`))]);
  });
  it('întârziat → fără bani + telefonul șoferului din grafic', async () => {
    const f = ctxFals({ text: 'am pierdut autobuzul' });
    await creeazaHandlerMesajClient(deps({ comenzi: [comanda()], intentie: 'intarziat', telefon: '37369123456' }))(f.ctx, vi.fn());
    expect(f.replies[0].text).toMatch(/banii nu se returnează/);
    expect(f.replies[0].text).toContain('+373 69 123 456');
  });
  it('vina noastră → escaladare la panou + «te contactează»; plângere → ION-247 separat', async () => {
    const d = deps({ comenzi: [comanda()], intentie: 'vina_noastra' });
    const f = ctxFals({ text: 'autobuzul n-a venit deloc' });
    await creeazaHandlerMesajClient(d)(f.ctx, vi.fn());
    expect(d.panou.escaladeaza).toHaveBeenCalledWith({ telegramId: ME, cod: COD, text: 'autobuzul n-a venit deloc', motiv: 'vina_noastra' });
    expect(f.replies[0].text).toMatch(/dispecerului, te contactează/);
    const g = ctxFals({ text: 'șoferul a fost nepoliticos' });
    await creeazaHandlerMesajClient(deps({ comenzi: [comanda()], intentie: 'plangere' }))(g.ctx, vi.fn());
    expect(g.replies[0].text).toMatch(/^Plângerile prin bot vin în curând/);
  });
});

describe('cele 4 cifre', () => {
  it('cere_cifre → starea în sesiune; cifre greșite → încercările rămase; corecte → oferta', async () => {
    let n = 0;
    const panou = panouFals({
      oferta: vi.fn(async () => {
        n++;
        if (n === 1) return raspuns<RaspunsOferta>({ tip: 'cere_cifre' });
        if (n === 2) return raspuns<RaspunsOferta>({ tip: 'cifre_gresite', ramase: 4 });
        return raspuns(OFERTA);
      }),
    });
    const d = deps({ panou, comenzi: [comanda()] });
    const session: Record<string, unknown> = {};
    const cb = ctxFals({ data: `retur:cere:${COD}`, session });
    await creeazaHandlerCallbackRetur(d)(cb.ctx);
    expect(cb.replies[0].text).toMatch(/ultimele 4 cifre/);
    expect((session.retur as { cifre: { cod: string } }).cifre.cod).toBe(COD);

    const gresit = ctxFals({ text: '0000', session });
    await creeazaHandlerMesajClient(d)(gresit.ctx, vi.fn());
    expect(gresit.replies[0].text).toBe('Cifrele nu se potrivesc. Mai ai 4 încercări.');
    expect(d.ai.clasifica).not.toHaveBeenCalled();

    const bun = ctxFals({ text: '3456', session });
    await creeazaHandlerMesajClient(d)(bun.ctx, vi.fn());
    expect(panou.oferta).toHaveBeenLastCalledWith(ME, COD, '3456');
    expect(bun.replies[0].text).toContain('Primești înapoi 135 lei');
    expect((session.retur as { cifre?: unknown }).cifre).toBeUndefined();
  });
});

describe('callback-urile', () => {
  it('retur:ok → răspuns imediat, «Se procesează…», confirma; telegram_id din ctx.from', async () => {
    const d = deps();
    const f = ctxFals({ data: `retur:ok:${OFERTA_ID}` });
    await creeazaHandlerCallbackRetur(d)(f.ctx);
    expect(f.answered[0]).toEqual({ text: 'Se procesează…' });
    expect(f.replies.map((r) => r.text)).toEqual([
      'Se procesează…',
      'Biletul e anulat. Banca a primit cererea de returnare a 135 lei; banii ajung pe cardul cu care ai plătit.',
    ]);
    expect(d.panou.confirma).toHaveBeenCalledWith(ME, OFERTA_ID);
  });
  it('timeout la confirma → starea in_curs cu butonul «Verifică starea»', async () => {
    const panou = panouFals({
      confirma: vi.fn(async () => ({ tip: 'eroare', eroare: 'timeout' }) as const),
      stare: vi.fn(async () => raspuns<RaspunsStare>({ stare: 'in_curs', suma: 135 })),
    });
    const f = ctxFals({ data: `retur:ok:${OFERTA_ID}` });
    await creeazaHandlerCallbackRetur(deps({ panou }))(f.ctx);
    expect(panou.confirma).toHaveBeenCalledTimes(1);
    expect(f.replies[1].butoane).toEqual([`🔄 Verifică starea|retur:stare:${OFERTA_ID}`]);
  });
  it('ofertă expirată cu codul reținut → oferta nouă cu «Suma s-a schimbat»', async () => {
    const panou = panouFals({ confirma: vi.fn(async () => raspuns<RaspunsStare>({ stare: 'expirata', suma: null })) });
    const session = { retur: { oferte: { [OFERTA_ID]: { cod: COD, lang: 'ro', la: ACUM } } } };
    const f = ctxFals({ data: `retur:ok:${OFERTA_ID}`, session });
    await creeazaHandlerCallbackRetur(deps({ panou }))(f.ctx);
    expect(panou.oferta).toHaveBeenCalledWith(ME, COD, undefined);
    expect(f.replies[1].text.split('\n')[0]).toBe('Suma s-a schimbat, uite noua sumă.');
  });
  it('panoul fără cheie → returnarea doar la telefon', async () => {
    const panou = panouFals({ oferta: vi.fn(async () => ({ tip: 'eroare', eroare: 'indisponibil' }) as const) });
    const f = ctxFals({ data: `retur:cere:${COD}` });
    await creeazaHandlerCallbackRetur(deps({ panou }))(f.ctx);
    expect(f.replies[0].text).toBe('Returnarea momentan doar la telefon +373 60 401 010.');
  });
  it('fara_bani sub 4 h → textul cu cursa în aceeași direcție', async () => {
    const panou = panouFals({ oferta: vi.fn(async () => raspuns<RaspunsOferta>({ tip: 'fara_bani', motiv: 'sub_4h' })) });
    const f = ctxFals({ data: `retur:cere:${COD}` });
    await creeazaHandlerCallbackRetur(deps({ panou }))(f.ctx);
    expect(f.replies[0].text).toMatch(/^Cu mai puțin de 4 ore/);
  });
});

describe('/start fără cod', () => {
  it('client cu bilete → lista cu «Returnează»; personal → nu intervine', async () => {
    const f = ctxFals({ text: '/start' });
    expect(await handleStartClient(f.ctx, deps({ comenzi: [comanda()] }))).toBe(true);
    expect(f.replies[0].butoane[0]).toContain(`retur:cere:${COD}`);
    const p = ctxFals({ text: '/start', dbUser: { id: 'u1' } });
    expect(await handleStartClient(p.ctx, deps({ comenzi: [comanda()] }))).toBe(false);
    expect(p.replies).toHaveLength(0);
  });
});
