import { describe, expect, it } from 'vitest';
import {
  confirmareDeReluat, SMS_INCERCARI_MAX, SMS_PAUZA_RELUARE_MS, SMS_TERMEN_REVENDICARE_MS, trimiteConfirmareSms,
  type DepsConfirmareSms, type RezultatTrimitereSms, type Revendicare,
} from './sms-reguli';
import { clasificaExceptie, clasificaHttp } from '@/lib/sms/trimite';

// N5 (dezbaterea Claude–Codex, 10.10.2026): SMS-ul de confirmare se reia după un refuz, cu revendicare cu termen, și nu
// pleacă de două ori — nici cu doi lucrători, nici când furnizorul a primit cererea dar noi n-am scris rezultatul.
// Baza falsă de mai jos imită funcțiile din migr. 563 (aceleași reguli; probele SQL din 563 le verifică pe cele reale).

interface Rand { stare: string; incercari: number; revendicat_la: number; trimitere_la: number | null; token: string; furnizor: string | null }

function bazaFalsa(platitaLa: number) {
  const b = { rand: null as Rand | null, acum: platitaLa + 5 * 60_000, n: 0 };
  const revendica = async (): Promise<Revendicare> => {
    await Promise.resolve(); // altă cerere poate intra între apeluri, ca în viață
    const tok = `t${++b.n}`;
    const r = b.rand;
    if (!r) { b.rand = { stare: 'in_lucru', incercari: 1, revendicat_la: b.acum, trimitere_la: null, token: tok, furnizor: null }; return { ok: true, id: 'r1', token: tok }; }
    if (r.stare === 'in_lucru') {
      if (r.revendicat_la > b.acum - SMS_TERMEN_REVENDICARE_MS) return { ok: false, motiv: 'in_lucru' };
      if (r.trimitere_la != null) { r.stare = 'necunoscut'; return { ok: false, motiv: 'necunoscut' }; }
    } else if (r.stare === 'refuzat') {
      if (r.incercari >= SMS_INCERCARI_MAX) return { ok: false, motiv: 'epuizat' };
      if (r.revendicat_la > b.acum - SMS_PAUZA_RELUARE_MS) return { ok: false, motiv: 'pauza' };
    } else return { ok: false, motiv: r.stare };
    if (r.incercari >= SMS_INCERCARI_MAX) { r.stare = 'refuzat'; return { ok: false, motiv: 'epuizat' }; }
    if (platitaLa < b.acum - 2 * 3_600_000) return { ok: false, motiv: 'fereastra' };
    Object.assign(r, { stare: 'in_lucru', token: tok, revendicat_la: b.acum, incercari: r.incercari + 1, trimitere_la: null });
    return { ok: true, id: 'r1', token: tok };
  };
  const incepe = async (_id: string, token: string) => {
    await Promise.resolve();
    const r = b.rand;
    if (!r || r.token !== token || r.stare !== 'in_lucru' || r.trimitere_la != null) return false;
    r.trimitere_la = b.acum; return true;
  };
  const rezultat = async (_id: string, token: string, stare: 'trimis' | 'refuzat' | 'necunoscut', furnizor: string | null) => {
    const r = b.rand;
    if (!r || r.token !== token || !['in_lucru', 'necunoscut'].includes(r.stare) || r.trimitere_la == null) return;
    r.stare = stare; if (stare === 'trimis') r.furnizor = furnizor;
  };
  return { b, revendica, incepe, rezultat };
}

function lucrator(baza: ReturnType<typeof bazaFalsa>, furnizor: { trimise: string[]; raspuns: () => RezultatTrimitereSms }, opt: { moareInainte?: boolean; moareDupa?: boolean } = {}): DepsConfirmareSms {
  return {
    revendica: baza.revendica,
    text: async () => { if (opt.moareInainte) throw new Error('proces oprit'); return 'TRANSLUX: bilet platit'; },
    incepe: baza.incepe,
    trimite: async (text) => {
      await Promise.resolve();
      furnizor.trimise.push(text);
      if (opt.moareDupa) throw new Error('proces oprit după cerere');
      return furnizor.raspuns();
    },
    rezultat: async (id, token, stare, f) => { if (opt.moareDupa) return; await baza.rezultat(id, token, stare, f); },
  };
}

const PLATA = Date.parse('2026-10-12T08:00:00Z');

describe('N5: confirmarea SMS — doi lucrători, termen, refuz, necunoscut', () => {
  it('doi lucrători în aceeași clipă (callback + împăcare) → un singur SMS', async () => {
    const baza = bazaFalsa(PLATA);
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => ({ ok: true, id: 'm-1' }) };
    const [a, b] = await Promise.all([trimiteConfirmareSms(lucrator(baza, f)), trimiteConfirmareSms(lucrator(baza, f))]);
    expect([a, b].sort()).toEqual(['nimic', 'trimis']);
    expect(f.trimise).toHaveLength(1);
    expect(baza.b.rand).toMatchObject({ stare: 'trimis', furnizor: 'm-1' });
  });
  it('lucrătorul moare ÎNAINTE de cerere → după termen al doilea trimite (o dată)', async () => {
    const baza = bazaFalsa(PLATA);
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => ({ ok: true, id: null }) };
    await expect(trimiteConfirmareSms(lucrator(baza, f, { moareInainte: true }))).rejects.toThrow();
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('nimic'); // termenul n-a trecut
    baza.b.acum += SMS_TERMEN_REVENDICARE_MS + 1000;
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('trimis');
    expect(f.trimise).toHaveLength(1);
    expect(baza.b.rand?.incercari).toBe(2);
  });
  it('furnizorul a primit, dar procesul a murit înainte să scrie → «necunoscut», fără retrimitere, niciodată', async () => {
    const baza = bazaFalsa(PLATA);
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => ({ ok: true, id: null }) };
    await trimiteConfirmareSms(lucrator(baza, f, { moareDupa: true }));
    expect(f.trimise).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      baza.b.acum += SMS_TERMEN_REVENDICARE_MS + 1000;
      expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('nimic');
    }
    expect(f.trimise).toHaveLength(1);
    expect(baza.b.rand?.stare).toBe('necunoscut');
  });
  it('timeout fără id de la furnizor → necunoscut, nu se reia', async () => {
    const baza = bazaFalsa(PLATA);
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => clasificaExceptie(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })) };
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('necunoscut');
    baza.b.acum += 30 * 60_000;
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('nimic');
    expect(f.trimise).toHaveLength(1);
  });
  it('refuz confirmat → pauză, apoi reluări până la 3 încercări, apoi gata', async () => {
    const baza = bazaFalsa(PLATA);
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => clasificaHttp(400, '{"error":"bad sender"}') };
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('esuat');
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('nimic'); // pauza
    for (let i = 0; i < 4; i++) { baza.b.acum += SMS_PAUZA_RELUARE_MS + 1000; await trimiteConfirmareSms(lucrator(baza, f)); }
    expect(f.trimise).toHaveLength(SMS_INCERCARI_MAX);
    expect(baza.b.rand).toMatchObject({ stare: 'refuzat', incercari: SMS_INCERCARI_MAX });
  });
  it('refuz confirmat, apoi furnizorul acceptă la a doua încercare → trimis, o dată', async () => {
    const baza = bazaFalsa(PLATA);
    let n = 0;
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => (++n === 1 ? clasificaHttp(429, 'rate') : { ok: true, id: 'm-2' }) };
    await trimiteConfirmareSms(lucrator(baza, f));
    baza.b.acum += SMS_PAUZA_RELUARE_MS + 1000;
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('trimis');
    baza.b.acum += SMS_PAUZA_RELUARE_MS + 1000;
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('nimic');
    expect(f.trimise).toHaveLength(2);
  });
  it('după fereastra de 2 h de la plată refuzul nu se mai reia', async () => {
    const baza = bazaFalsa(PLATA);
    const f = { trimise: [] as string[], raspuns: (): RezultatTrimitereSms => clasificaHttp(400, 'x') };
    await trimiteConfirmareSms(lucrator(baza, f));
    baza.b.acum = PLATA + 2 * 3_600_000 + 60_000;
    expect(await trimiteConfirmareSms(lucrator(baza, f))).toBe('nimic');
    expect(f.trimise).toHaveLength(1);
  });
});

describe('N5: clasificarea răspunsului furnizorului', () => {
  it('2xx acceptat (cu sau fără id); 4xx refuz sigur; 5xx necunoscut', () => {
    expect(clasificaHttp(200, '{"id":"abc"}')).toEqual({ ok: true, id: 'abc' });
    expect(clasificaHttp(202, 'OK')).toEqual({ ok: true, id: null });
    expect(clasificaHttp(400, 'x')).toMatchObject({ ok: false, necunoscut: false });
    expect(clasificaHttp(401, 'x')).toMatchObject({ ok: false, necunoscut: false });
    expect(clasificaHttp(502, 'x')).toMatchObject({ ok: false, necunoscut: true });
    expect(clasificaHttp(504, 'x')).toMatchObject({ ok: false, necunoscut: true });
  });
  it('conexiune refuzată / DNS → refuz sigur; timeout / conexiune ruptă → necunoscut', () => {
    expect(clasificaExceptie(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))).toMatchObject({ necunoscut: false });
    expect(clasificaExceptie(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }))).toMatchObject({ necunoscut: false });
    expect(clasificaExceptie(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }))).toMatchObject({ necunoscut: true });
    expect(clasificaExceptie(new DOMException('timeout', 'TimeoutError'))).toMatchObject({ necunoscut: true });
  });
});

describe('N5: confirmareDeReluat (plasa din împăcare)', () => {
  const t = Date.parse('2026-10-12T09:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const rand = (o: Partial<Parameters<typeof confirmareDeReluat>[0]>) => ({ stare: 'refuzat', incercari: 1, revendicat_la: iso(t - 10 * 60_000), trimitere_la: null, created_at: iso(t - 20 * 60_000), ...o });
  it('refuzat sub plafon și după pauză → da; în pauză sau epuizat → nu', () => {
    expect(confirmareDeReluat(rand({}), t)).toBe(true);
    expect(confirmareDeReluat(rand({ revendicat_la: iso(t - 30_000) }), t)).toBe(false);
    expect(confirmareDeReluat(rand({ incercari: SMS_INCERCARI_MAX }), t)).toBe(false);
  });
  it('in_lucru expirat → da (baza decide: reluare sau «necunoscut»); in_lucru proaspăt → nu', () => {
    expect(confirmareDeReluat(rand({ stare: 'in_lucru' }), t)).toBe(true);
    expect(confirmareDeReluat(rand({ stare: 'in_lucru', revendicat_la: iso(t - 10_000) }), t)).toBe(false);
  });
  it('trimis / necunoscut / eroare veche → nu', () => {
    for (const stare of ['trimis', 'necunoscut', 'eroare']) expect(confirmareDeReluat(rand({ stare }), t)).toBe(false);
  });
});
