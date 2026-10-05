import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ getSupabase: () => { throw new Error('fără bază în teste'); } }));

const {
  creeazaHandlerCallbackDupaCursa, mesajDupaCursa, parseazaCallbackDupaCursa, trimiteMesajeleDupaCursa,
} = await import('./dupa-cursa.js');
const { comenziScadentePentruFinal, FEREASTRA_FINAL_MS } = await import('../services/dupaCursa.js');
const { sfarsitulComenzii, cheieOprire } = await import('../services/sfarsitCursa.js');

import type { BotContext } from '../types.js';
import type { ComandaFeedback, ComandaFinal, RepoDupaCursa } from '../services/dupaCursa.js';

// ION-252: mesajul de după cursă (o dată pe comandă), butoanele 👍 / 👎 și sfârșitul cursei din grafic.

const ACUM = Date.parse('2026-10-14T16:00:00Z');
const ORA = 60 * 60_000;
const COD = 'ab'.repeat(16);
const COD2 = 'cd'.repeat(16);
const ME = 555;

const final = (cod: string, sfarsitFataDeAcumOre: number, o: Partial<ComandaFinal> = {}): ComandaFinal => ({
  cod, lang: 'ro', from_name: 'Briceni', to_name: 'Chișinău', departure_at: '2026-10-14T05:45:00+03:00', telegram_id: ME,
  sfarsit_ms: ACUM + sfarsitFataDeAcumOre * ORA, ...o,
});

describe('sfârșitul cursei din grafic (sfarsitulComenzii)', () => {
  const cursa = { crm_route_id: 3, to_stop_order: 12, going_north: true, departure_at: '2026-10-14T14:00:00+03:00' };
  it('cu ora sosirii pe sensul comenzii: sosirea + 30 min', () => {
    const opriri = new Map([[cheieOprire(3, 12), { hour_from_chisinau: '18:30', hour_from_nord: '06:00' }]]);
    expect(sfarsitulComenzii(cursa, opriri)).toBe(Date.parse('2026-10-14T19:00:00+03:00'));
    // spre Chișinău se ia ora din nord (aici 06:00 → a doua zi, după plecarea de la 14:00)
    expect(sfarsitulComenzii({ ...cursa, going_north: false }, opriri)).toBe(Date.parse('2026-10-15T06:30:00+03:00'));
  });
  it('peste miezul nopții: sosirea în ziua următoare', () => {
    const opriri = new Map([[cheieOprire(3, 12), { hour_from_chisinau: '01:30', hour_from_nord: null }]]);
    expect(sfarsitulComenzii({ ...cursa, departure_at: '2026-10-14T22:00:00+03:00' }, opriri)).toBe(Date.parse('2026-10-15T02:00:00+03:00'));
  });
  it('oprirea lipsește din nomenclator sau n-are oră: plecarea + 6 h', () => {
    expect(sfarsitulComenzii(cursa, new Map())).toBe(Date.parse('2026-10-14T20:00:00+03:00'));
    const faraOra = new Map([[cheieOprire(3, 12), { hour_from_chisinau: null, hour_from_nord: '06:00' }]]);
    expect(sfarsitulComenzii(cursa, faraOra)).toBe(Date.parse('2026-10-14T20:00:00+03:00'));
  });
});

describe('comenziScadentePentruFinal', () => {
  it('doar cursele încheiate, de cel mult 6 h, cele mai vechi întâi', () => {
    const r = comenziScadentePentruFinal([final('pe_drum', 0.5), final('recenta', -0.1), final('veche', -5), final('prea_veche', -7)], ACUM);
    expect(r.map((c) => c.cod)).toEqual(['veche', 'recenta']);
  });
  it('exact la sfârșit e scadentă; exact la 6 h încă da, peste nu', () => {
    expect(comenziScadentePentruFinal([final('a', 0)], ACUM)).toHaveLength(1);
    expect(comenziScadentePentruFinal([final('b', 0, { sfarsit_ms: ACUM - FEREASTRA_FINAL_MS })], ACUM)).toHaveLength(1);
    expect(comenziScadentePentruFinal([final('c', 0, { sfarsit_ms: ACUM - FEREASTRA_FINAL_MS - 1 })], ACUM)).toHaveLength(0);
  });
});

describe('mesajDupaCursa', () => {
  it('RO: textul lui Ion cu ruta și ziua, butoanele 👍 / 👎 cu codul comenzii', () => {
    const m = mesajDupaCursa(final(COD, -1));
    expect(m.text).toBe('🚌 Mulțumim că ai călătorit cu TRANSLUX! Cum a fost cursa Briceni → Chișinău din 14.10, 05:45?');
    expect(m.reply_markup.inline_keyboard.flat()).toEqual([
      { text: '👍 Totul a fost bine', callback_data: `final:bine:${COD}` },
      { text: '👎 Am o plângere', callback_data: `final:plangere:${COD}` },
    ]);
  });
  it('RU', () => {
    const m = mesajDupaCursa(final(COD, -1, { lang: 'ru' }));
    expect(m.text).toMatch(/^🚌 Спасибо, что ездите с TRANSLUX! Как прошла поездка Briceni → Chișinău 14\.10, 05:45\?$/);
    expect(m.reply_markup.inline_keyboard.flat().map((b) => b.text)).toEqual(['👍 Всё было хорошо', '👎 У меня жалоба']);
  });
  it('callback_data încape în limita Telegram de 64 de octeți', () => {
    for (const b of mesajDupaCursa(final(COD, -1)).reply_markup.inline_keyboard.flat()) {
      expect(Buffer.byteLength(String((b as { callback_data?: string }).callback_data))).toBeLessThanOrEqual(64);
    }
  });
});

function repoFals(o: { scadente?: ComandaFinal[]; comanda?: ComandaFeedback | null } = {}) {
  const marcate = new Set<string>();
  const repo = {
    comenziPentruFinal: vi.fn(async () => (o.scadente ?? []).filter((c) => !marcate.has(c.cod))),
    marcheazaFinalTrimis: vi.fn(async (cod: string) => {
      if (marcate.has(cod)) return false;
      marcate.add(cod);
      return true;
    }),
    comandaPentruFeedback: vi.fn(async () => (o.comanda === undefined ? { cod: COD, status: 'platita', lang: 'ro', telegram_id: ME } : o.comanda)),
    scrieFeedback: vi.fn(async () => {}),
  } satisfies RepoDupaCursa;
  return { repo, marcate };
}

describe('trimiteMesajeleDupaCursa — o singură dată pe comandă', () => {
  it('trimite, marchează după trimitere, apoi reface pinul contului; tickul următor nu mai trimite nimic', async () => {
    const { repo } = repoFals({ scadente: [final(COD, -0.2)] });
    const api = { sendMessage: vi.fn(async () => ({})) };
    const dupaTrimitere = vi.fn(async () => {});
    const b1 = await trimiteMesajeleDupaCursa({ repo, api, nowMs: ACUM, dupaTrimitere });
    expect(b1).toEqual({ trimise: 1, erori: 0 });
    expect(api.sendMessage).toHaveBeenCalledWith(ME, expect.stringContaining('Mulțumim că ai călătorit cu TRANSLUX'), expect.objectContaining({ reply_markup: expect.any(Object) }));
    expect(repo.marcheazaFinalTrimis).toHaveBeenCalledWith(COD);
    expect(dupaTrimitere).toHaveBeenCalledWith(ME);
    const b2 = await trimiteMesajeleDupaCursa({ repo, api, nowMs: ACUM + 5 * 60_000, dupaTrimitere });
    expect(b2).toEqual({ trimise: 0, erori: 0 });
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });
  it('trimiterea a căzut (botul blocat) → fără marcaj, celelalte comenzi pleacă', async () => {
    const { repo } = repoFals({ scadente: [final(COD, -0.2, { telegram_id: 1 }), final(COD2, -0.1)] });
    const api = { sendMessage: vi.fn(async (chat: number) => { if (chat === 1) throw new Error('Forbidden: bot was blocked by the user'); return {}; }) };
    const jurnal = vi.fn();
    const b = await trimiteMesajeleDupaCursa({ repo, api, nowMs: ACUM, jurnal });
    expect(b).toEqual({ trimise: 1, erori: 1 });
    expect(repo.marcheazaFinalTrimis).toHaveBeenCalledTimes(1);
    expect(repo.marcheazaFinalTrimis).toHaveBeenCalledWith(COD2);
    expect(jurnal).toHaveBeenCalledWith(expect.stringMatching(/blocked/));
  });
  it('pinul care cade nu se socotește eroare de trimitere', async () => {
    const { repo } = repoFals({ scadente: [final(COD, -0.2)] });
    const jurnal = vi.fn();
    const b = await trimiteMesajeleDupaCursa({
      repo, api: { sendMessage: vi.fn(async () => ({})) }, nowMs: ACUM, jurnal,
      dupaTrimitere: vi.fn(async () => { throw new Error('pin indisponibil'); }),
    });
    expect(b).toEqual({ trimise: 1, erori: 0 });
    expect(jurnal).toHaveBeenCalledWith(expect.stringMatching(/pin 555: pin indisponibil/));
  });
});

describe('parseazaCallbackDupaCursa', () => {
  it('formele valide', () => {
    expect(parseazaCallbackDupaCursa(`final:bine:${COD}`)).toEqual({ actiune: 'bine', cod: COD });
    expect(parseazaCallbackDupaCursa(`final:plangere:${COD}`)).toEqual({ actiune: 'plangere', cod: COD });
  });
  it('cod stricat, acțiune necunoscută sau telegram_id strecurat → null', () => {
    expect(parseazaCallbackDupaCursa('final:bine:123')).toBeNull();
    expect(parseazaCallbackDupaCursa(`final:bine:${COD}:999`)).toBeNull();
    expect(parseazaCallbackDupaCursa(`final:super:${COD}`)).toBeNull();
    expect(parseazaCallbackDupaCursa(undefined)).toBeNull();
  });
});

function ctxCallback(data: string, o: { fromId?: number; session?: Record<string, unknown> } = {}) {
  const replies: string[] = [];
  const answered: unknown[] = [];
  const ctx = {
    chat: { type: 'private', id: o.fromId ?? ME },
    from: { id: o.fromId ?? ME, language_code: 'ro' },
    callbackQuery: { data },
    session: o.session ?? {},
    reply: vi.fn(async (t: string) => { replies.push(t); }),
    answerCallbackQuery: vi.fn(async (a?: unknown) => { answered.push(a); }),
    editMessageReplyMarkup: vi.fn(async () => {}),
  };
  return { ctx: ctx as unknown as BotContext, replies, answered, raw: ctx };
}

describe('butoanele 👍 / 👎', () => {
  it('👍 → «Mulțumim! Ne bucurăm.», feedback «bine» pe comanda acestui cont, butoanele scoase', async () => {
    const { repo } = repoFals();
    const f = ctxCallback(`final:bine:${COD}`);
    await creeazaHandlerCallbackDupaCursa({ repo, now: () => ACUM })(f.ctx);
    expect(repo.scrieFeedback).toHaveBeenCalledWith(COD, ME, 'bine');
    expect(f.replies).toEqual(['Mulțumim! Ne bucurăm.']);
    expect(f.raw.editMessageReplyMarkup).toHaveBeenCalled();
  });
  it('👎 → feedback «plangere», «Scrie-ne ce s-a întâmplat», botul așteaptă plângerea 30 min', async () => {
    const { repo } = repoFals();
    const session: Record<string, unknown> = {};
    const f = ctxCallback(`final:plangere:${COD}`, { session });
    await creeazaHandlerCallbackDupaCursa({ repo, now: () => ACUM })(f.ctx);
    expect(repo.scrieFeedback).toHaveBeenCalledWith(COD, ME, 'plangere');
    expect(f.replies).toEqual(['Scrie-ne ce s-a întâmplat (poți trimite și o poză).']);
    expect(session.plangere).toEqual({ cod: COD, lang: 'ro', expiraLa: ACUM + 30 * 60_000 });
  });
  it('comanda legată de ALT cont → refuz discret, nimic scris, nicio așteptare', async () => {
    const { repo } = repoFals({ comanda: { cod: COD, status: 'platita', lang: 'ro', telegram_id: 999 } });
    const session: Record<string, unknown> = {};
    const f = ctxCallback(`final:plangere:${COD}`, { session });
    await creeazaHandlerCallbackDupaCursa({ repo, now: () => ACUM })(f.ctx);
    expect(repo.scrieFeedback).not.toHaveBeenCalled();
    expect(f.replies).toEqual([]);
    expect(f.answered).toEqual([{ text: 'Acest bilet e legat de alt cont.' }]);
    expect(session.plangere).toBeUndefined();
  });
  it('comanda inexistentă sau returnată → același refuz', async () => {
    for (const comanda of [null, { cod: COD, status: 'returnata', lang: 'ro', telegram_id: ME }]) {
      const { repo } = repoFals({ comanda });
      const f = ctxCallback(`final:bine:${COD}`);
      await creeazaHandlerCallbackDupaCursa({ repo, now: () => ACUM })(f.ctx);
      expect(repo.scrieFeedback).not.toHaveBeenCalled();
      expect(f.replies).toEqual([]);
    }
  });
  it('baza cade la scrierea feedback-ului → clientul primește totuși răspunsul', async () => {
    const { repo } = repoFals();
    repo.scrieFeedback.mockRejectedValueOnce(new Error('db jos'));
    const f = ctxCallback(`final:bine:${COD}`);
    await creeazaHandlerCallbackDupaCursa({ repo, now: () => ACUM })(f.ctx);
    expect(f.replies).toEqual(['Mulțumim! Ne bucurăm.']);
  });
  it('callback_data stricată → doar închide callback-ul', async () => {
    const { repo } = repoFals();
    const f = ctxCallback('final:bine:xyz');
    await creeazaHandlerCallbackDupaCursa({ repo, now: () => ACUM })(f.ctx);
    expect(repo.comandaPentruFeedback).not.toHaveBeenCalled();
    expect(f.raw.answerCallbackQuery).toHaveBeenCalled();
  });
});
