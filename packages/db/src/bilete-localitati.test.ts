import { describe, expect, it } from 'vitest';
import {
  cursaAreLocalitateCuPlafon, cursaInLocalitatileVanzarii, localitatiDinValoare, localitatiPentruPublic,
  locuriLuatePeLocalitate, NICIO_LOCALITATE, normalizeazaLocalitate, parseazaLocalitatiVanzare,
  parseazaPlafoaneLocalitati, TOATE_LOCALITATILE, verificaPlafonLocalitati, type ComandaPentruPlafon,
} from './bilete-localitati';

const LISTA_ACUM = '["Briceni","Edineț"]';

describe('normalizeazaLocalitate', () => {
  it('fără diacritice, fără majuscule, spațiile strânse', () => {
    expect(normalizeazaLocalitate('Edineț')).toBe('edinet');
    expect(normalizeazaLocalitate('  EDINEȚ ')).toBe('edinet');
    expect(normalizeazaLocalitate('Bălți')).toBe('balti');
    expect(normalizeazaLocalitate('Chișinău')).toBe('chisinau');
    expect(normalizeazaLocalitate('Ocnița-Sat')).toBe('ocnita-sat');
  });
  it('ș/ț cu sedilă (ş/ţ) = cu virgulă', () => {
    expect(normalizeazaLocalitate('Edineţ')).toBe(normalizeazaLocalitate('Edineț'));
    expect(normalizeazaLocalitate('Chişinău')).toBe('chisinau');
  });
  it('null / undefined → șir gol', () => {
    expect(normalizeazaLocalitate(null)).toBe('');
    expect(normalizeazaLocalitate(undefined)).toBe('');
  });
});

describe('cursaInLocalitatileVanzarii — lista de acum ["Briceni","Edineț"]', () => {
  const { regula } = parseazaLocalitatiVanzare(LISTA_ACUM);

  it('Briceni → Chișinău și Chișinău → Briceni se vând', () => {
    expect(cursaInLocalitatileVanzarii(regula, 'Briceni', 'Chișinău')).toBe(true);
    expect(cursaInLocalitatileVanzarii(regula, 'Chișinău', 'Briceni')).toBe(true);
  });
  it('Chișinău → Edineț și Edineț → Chișinău se vând', () => {
    expect(cursaInLocalitatileVanzarii(regula, 'Chișinău', 'Edineț')).toBe(true);
    expect(cursaInLocalitatileVanzarii(regula, 'Edineț', 'Chișinău')).toBe(true);
  });
  it('coborâre în listă ajunge, oricare ar fi urcarea (Bălți → Briceni)', () => {
    expect(cursaInLocalitatileVanzarii(regula, 'Bălți', 'Briceni')).toBe(true);
  });
  it('Bălți → Chișinău și Ocnița → Chișinău NU se vând', () => {
    expect(cursaInLocalitatileVanzarii(regula, 'Bălți', 'Chișinău')).toBe(false);
    expect(cursaInLocalitatileVanzarii(regula, 'Ocnița', 'Chișinău')).toBe(false);
    expect(cursaInLocalitatileVanzarii(regula, 'Chișinău', 'Bălți')).toBe(false);
  });
  it('diacritice și majuscule nu contează («Edinet», «BRICENI»)', () => {
    expect(cursaInLocalitatileVanzarii(regula, 'Edinet', 'Chisinau')).toBe(true);
    expect(cursaInLocalitatileVanzarii(regula, 'chisinau', 'BRICENI')).toBe(true);
    const faraDiacritice = parseazaLocalitatiVanzare('["briceni","EDINET"]').regula;
    expect(cursaInLocalitatileVanzarii(faraDiacritice, 'Chișinău', 'Edineț')).toBe(true);
  });
  it('numele trebuie să fie întregi: «Ocnița-Sat» nu e «Ocnița», «Briceni» nu prinde «Briceni-Sat»', () => {
    expect(cursaInLocalitatileVanzarii(regula, 'Briceni-Sat', 'Chișinău')).toBe(false);
  });
});

describe('parseazaLocalitatiVanzare — lipsă/gol = toate, stricat = nimic', () => {
  it('lipsă, text gol, [] și null → toate', () => {
    for (const raw of [null, undefined, '', '   ', '[]', 'null']) {
      const r = parseazaLocalitatiVanzare(raw);
      expect(r).toEqual({ regula: TOATE_LOCALITATILE, eroare: null });
      expect(cursaInLocalitatileVanzarii(r.regula, 'Ocnița', 'Chișinău')).toBe(true);
    }
  });
  it('lista se citește cu numele curățate', () => {
    expect(parseazaLocalitatiVanzare('[" Briceni ","Edineț"]').regula).toEqual({ toate: false, localitati: ['Briceni', 'Edineț'] });
  });
  it('JSON stricat, obiect, elemente care nu-s nume → nicio localitate + eroare (nu vindem pe orb)', () => {
    for (const raw of ['Briceni, Edineț', '{"Briceni":true}', '["Briceni", 5]', '["Briceni", ""]', '"Briceni"']) {
      const r = parseazaLocalitatiVanzare(raw);
      expect(r.regula).toEqual(NICIO_LOCALITATE);
      expect(r.eroare).not.toBeNull();
      expect(cursaInLocalitatileVanzarii(r.regula, 'Briceni', 'Chișinău')).toBe(false);
    }
  });
});

describe('forma publică (panou → site)', () => {
  it('toate ↔ null; listă ↔ listă', () => {
    expect(localitatiPentruPublic(TOATE_LOCALITATILE)).toBeNull();
    expect(localitatiPentruPublic(parseazaLocalitatiVanzare(LISTA_ACUM).regula)).toEqual(['Briceni', 'Edineț']);
    expect(localitatiPentruPublic(NICIO_LOCALITATE)).toEqual([]);
  });
  it('site-ul decodează ce trimite panoul (lipsă = panou vechi = toate)', () => {
    expect(localitatiDinValoare(undefined).regula).toEqual(TOATE_LOCALITATILE);
    expect(localitatiDinValoare(null).regula).toEqual(TOATE_LOCALITATILE);
    expect(localitatiDinValoare(['Briceni']).regula).toEqual({ toate: false, localitati: ['Briceni'] });
    expect(localitatiDinValoare('Briceni').regula).toEqual(NICIO_LOCALITATE);
  });
});

describe('parseazaPlafoaneLocalitati', () => {
  it('lipsă / gol / {} → fără limită', () => {
    for (const raw of [null, undefined, '', '{}']) {
      const r = parseazaPlafoaneLocalitati(raw);
      expect(r.eroare).toBeNull();
      expect(r.plafoane.size).toBe(0);
    }
  });
  it('{"Bălți": 4} → cheia normalizată, numele păstrat pentru mesaj', () => {
    const r = parseazaPlafoaneLocalitati('{"Bălți": 4}');
    expect(r.eroare).toBeNull();
    expect(r.plafoane.get('balti')).toEqual({ nume: 'Bălți', locuri: 4 });
  });
  it('0 e un plafon valid (nimic online la localitatea aceea)', () => {
    expect(parseazaPlafoaneLocalitati('{"Bălți": 0}').plafoane.get('balti')?.locuri).toBe(0);
  });
  it('stricat → eroare', () => {
    for (const raw of ['Bălți=4', '[4]', '{"Bălți": "4"}', '{"Bălți": -1}', '{"Bălți": 2.5}', '{"": 3}']) {
      expect(parseazaPlafoaneLocalitati(raw).eroare).not.toBeNull();
    }
  });
});

describe('plafonul Bălți', () => {
  const acum = Date.parse('2026-10-14T10:00:00+03:00');
  const minuteInainte = (m: number) => new Date(acum - m * 60_000).toISOString();
  const { plafoane } = parseazaPlafoaneLocalitati('{"Bălți": 4}');
  const comanda = (p: Partial<ComandaPentruPlafon>): ComandaPentruPlafon => ({
    from_name: 'Bălți', to_name: 'Chișinău', seats: 1, status: 'platita', created_at: minuteInainte(120), ...p,
  });

  it('numără plătitele și comenzile noi active, la urcare sau coborâre, fără diacritice', () => {
    const comenzi = [
      comanda({ seats: 2 }),                                                   // plătită, urcare Bălți
      comanda({ from_name: 'Chișinău', to_name: 'Balti', seats: 1 }),          // plătită, coborâre «Balti»
      comanda({ status: 'noua', created_at: minuteInainte(10) }),              // nouă, activă
      comanda({ status: 'eroare_creare', created_at: minuteInainte(29) }),     // deschisă, încă activă
      comanda({ status: 'noua', created_at: minuteInainte(31) }),              // abandonată → nu
      comanda({ status: 'expirata' }),                                          // nu
      comanda({ status: 'anulata' }),                                           // nu
      comanda({ from_name: 'Briceni', seats: 3 }),                              // altă localitate → nu
    ];
    expect(locuriLuatePeLocalitate(comenzi, 'Bălți', acum)).toBe(5);
  });

  it('încape până la plafon, peste plafon se refuză cu locurile rămase', () => {
    const comenzi = [comanda({ seats: 3 })];
    const baza = { plafoane, urcare: 'Bălți', coborare: 'Chișinău', comenziCursa: comenzi, nowMs: acum };
    expect(verificaPlafonLocalitati({ ...baza, seats: 1 })).toEqual({ ok: true });
    expect(verificaPlafonLocalitati({ ...baza, seats: 2 })).toEqual({ ok: false, localitate: 'Bălți', plafon: 4, ramase: 1 });
  });

  it('plafonul se aplică și la coborâre (Chișinău → Bălți)', () => {
    const comenzi = [comanda({ seats: 4 })];
    expect(verificaPlafonLocalitati({ plafoane, urcare: 'Chișinău', coborare: 'Bălți', seats: 1, comenziCursa: comenzi, nowMs: acum }).ok).toBe(false);
  });

  it('localitățile fără plafon nu sunt limitate', () => {
    const comenzi = [comanda({ from_name: 'Briceni', seats: 20 })];
    expect(verificaPlafonLocalitati({ plafoane, urcare: 'Briceni', coborare: 'Chișinău', seats: 4, comenziCursa: comenzi, nowMs: acum })).toEqual({ ok: true });
    expect(cursaAreLocalitateCuPlafon(plafoane, 'Briceni', 'Chișinău')).toBe(false);
    expect(cursaAreLocalitateCuPlafon(plafoane, 'Chișinău', 'BALTI')).toBe(true);
  });

  it('fără cheie = fără limită', () => {
    const fara = parseazaPlafoaneLocalitati(null).plafoane;
    expect(verificaPlafonLocalitati({ plafoane: fara, urcare: 'Bălți', coborare: 'Chișinău', seats: 4, comenziCursa: [comanda({ seats: 20 })], nowMs: acum })).toEqual({ ok: true });
  });

  it('plafon 0 → nicio vânzare la Bălți', () => {
    const zero = parseazaPlafoaneLocalitati('{"Bălți": 0}').plafoane;
    expect(verificaPlafonLocalitati({ plafoane: zero, urcare: 'Bălți', coborare: 'Chișinău', seats: 1, comenziCursa: [], nowMs: acum }).ok).toBe(false);
  });
});
