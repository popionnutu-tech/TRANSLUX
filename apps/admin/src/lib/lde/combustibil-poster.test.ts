import { describe, it, expect, vi } from 'vitest';

// modulul posterului trage clientul Supabase și Telegram la import; testul folosește doar transportul injectat
vi.mock('../supabase', () => ({ getSupabase: () => { throw new Error('fără bază în test'); } }));
vi.mock('../poster-sablon', () => ({ poster: () => ({}), CULORI: {} }));

import { recupereazaPoster, type DepsPoster, type StarePoster } from './combustibil-poster';

type Raspuns = { ok: boolean; refuzat?: boolean };
function deps(stare: StarePoster, raspunsuri: Partial<Record<'album' | 'general' | 'text', Raspuns[]>>, confirmat = true) {
  const trimise: string[] = [];
  const scrieri: StarePoster[] = [];
  const urm = (k: 'album' | 'general' | 'text'): Raspuns => raspunsuri[k]?.shift() ?? { ok: true };
  const poza = (n: string) => ({ png: Buffer.from(n), caption: n, filename: `${n}.png` });
  const d: DepsPoster = {
    citesteStare: async () => (confirmat ? { confirmat: true, stare: { ...stare } } : null),
    scrieStare: async (_l, s) => { scrieri.push({ ...s }); },
    ia: async (_l, _b, _din, s) => { scrieri.push({ ...s }); return true; },
    grupa: async () => ({ chatId: '-100', threadId: 7 }),
    pregateste: async () => ({ album: [poza('drax'), poza('sebn')], general: poza('general') }),
    trimiteAlbum: async () => { trimise.push('album'); return urm('album'); },
    trimiteFoto: async (_c, p) => { trimise.push(p.caption); return urm('general'); },
    trimiteText: async () => { trimise.push('introducere'); return urm('text'); },
  };
  return { d, trimise, scrieri };
}
const NETRIMIS: StarePoster = { album: 'netrimis', general: 'netrimis', introducere: 'netrimis' };

describe('recupereazaPoster', () => {
  it('luna neconfirmată: nu trimite nimic', async () => {
    const { d, trimise } = deps(NETRIMIS, {}, false);
    expect((await recupereazaPoster('2026-09', {}, d)).status).toBe('asteapta_confirmarea');
    expect(trimise).toEqual([]);
  });

  it('totul pleacă o dată, în ordine; «in_curs» e scris înaintea fiecărei bucăți', async () => {
    const { d, trimise, scrieri } = deps(NETRIMIS, {});
    const r = await recupereazaPoster('2026-09', {}, d);
    expect(r.status).toBe('trimis');
    expect(trimise).toEqual(['album', 'general', 'introducere']);
    expect(scrieri[0].album).toBe('in_curs');
  });

  it('doar introducerea refuzată: recuperarea trimite DOAR introducerea, o dată', async () => {
    const a = deps(NETRIMIS, { text: [{ ok: false, refuzat: true }] });
    const r1 = await recupereazaPoster('2026-09', {}, a.d);
    expect(r1.stare).toEqual({ album: 'ok', general: 'ok', introducere: 'refuzat' });
    const b = deps(r1.stare!, {});
    const r2 = await recupereazaPoster('2026-09', {}, b.d);
    expect(b.trimise).toEqual(['introducere']);
    expect(r2.status).toBe('trimis');
  });

  it('doar generalul refuzat: recuperarea trimite generalul, apoi introducerea — albumul nu se dublează', async () => {
    const a = deps(NETRIMIS, { general: [{ ok: false, refuzat: true }] });
    const r1 = await recupereazaPoster('2026-09', {}, a.d);
    expect(a.trimise).toEqual(['album', 'general']);   // introducerea nu pleacă fără general
    expect(r1.stare).toEqual({ album: 'ok', general: 'refuzat', introducere: 'netrimis' });
    const b = deps(r1.stare!, {});
    await recupereazaPoster('2026-09', {}, b.d);
    expect(b.trimise).toEqual(['general', 'introducere']);
  });

  it('livrat, răspuns pierdut (timeout): starea «incert», nimic nu se retrimite automat', async () => {
    const a = deps(NETRIMIS, { album: [{ ok: false }] });
    const r1 = await recupereazaPoster('2026-09', {}, a.d);
    expect(r1.stare?.album).toBe('incert');
    const b = deps(r1.stare!, {});
    const r2 = await recupereazaPoster('2026-09', {}, b.d);
    expect(b.trimise).toEqual([]);
    expect(r2.status).toBe('nimic_de_trimis');
  });

  it('livrat, succes nescris (proces oprit în «in_curs»): nimic automat; «Retrimite» explicit trimite', async () => {
    const st: StarePoster = { album: 'ok', general: 'in_curs', introducere: 'netrimis' };
    const a = deps(st, {});
    await recupereazaPoster('2026-09', {}, a.d);
    expect(a.trimise).toEqual([]);
    const b = deps(st, {});
    await recupereazaPoster('2026-09', { explicit: ['general'] }, b.d);
    expect(b.trimise).toEqual(['general', 'introducere']);
  });
});
