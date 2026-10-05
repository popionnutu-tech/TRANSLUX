import { describe, expect, it } from 'vitest';
import { semneazaInitData, verifyInitData } from '@/lib/telegram/init-data';
import { telegramIdDinInitData } from './sofer-reguli';

// Vector sintetic: token FALS (nu e al niciunui bot), semnat cu aceeași formulă ca Telegram (HMAC «WebAppData»).
const TOKEN = '123456:FAKE-TOKEN-ION-239';
const ACUM = 1_790_000_000; // secunde
const USER = JSON.stringify({ id: 777000111, first_name: 'Oleg', language_code: 'ru' });
const semnat = (extra: Record<string, string> = {}, authDate = ACUM - 60) =>
  semneazaInitData({ query_id: 'AAEAAQ', user: USER, auth_date: String(authDate), ...extra }, TOKEN);

describe('verifyInitData — HMAC-ul Telegram Mini Apps', () => {
  it('acceptă initData semnat cu tokenul și dă telegram_id', () => {
    const v = verifyInitData(semnat(), TOKEN, ACUM);
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.telegramId).toBe(777000111); expect(v.user.first_name).toBe('Oleg'); expect(v.startParam).toBeNull(); }
  });

  it('acceptă și varianta cu `signature` (Ed25519) în afara data-check-string-ului', () => {
    // semnat fără signature, apoi clientul adaugă signature → HMAC-ul calculat FĂRĂ signature se potrivește
    const v = verifyInitData(`${semnat()}&signature=abcDEF123`, TOKEN, ACUM);
    expect(v.ok).toBe(true);
    // semnat CU signature înăuntru → HMAC-ul calculat cu signature se potrivește
    const v2 = verifyInitData(semnat({ signature: 'abcDEF123' }), TOKEN, ACUM);
    expect(v2.ok).toBe(true);
  });

  it('refuză alt token, hash modificat, câmp modificat, hash lipsă', () => {
    const s = semnat();
    expect(verifyInitData(s, 'alt:TOKEN', ACUM)).toEqual({ ok: false, motiv: 'semnatura' });
    expect(verifyInitData(s.replace(/hash=./, (m) => (m.endsWith('0') ? 'hash=1' : 'hash=0')), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'semnatura' });
    expect(verifyInitData(s.replace('777000111', '777000112'), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'semnatura' });
    expect(verifyInitData('user=%7B%22id%22%3A1%7D&auth_date=1', TOKEN, ACUM)).toEqual({ ok: false, motiv: 'semnatura' });
    expect(verifyInitData('', TOKEN, ACUM)).toEqual({ ok: false, motiv: 'lipsa' });
    expect(verifyInitData(null, TOKEN, ACUM)).toEqual({ ok: false, motiv: 'lipsa' });
    expect(verifyInitData(s, '', ACUM)).toEqual({ ok: false, motiv: 'lipsa' });
  });

  it('expiră după 24 h (auth_date), nu înainte', () => {
    expect(verifyInitData(semnat({}, ACUM - 86_400 + 5), TOKEN, ACUM).ok).toBe(true);
    expect(verifyInitData(semnat({}, ACUM - 86_400 - 5), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'expirat' });
    expect(verifyInitData(semnat({ auth_date: '0' }), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'expirat' });
  });

  it('fără user sau cu id nevalid → fara_user', () => {
    expect(verifyInitData(semneazaInitData({ auth_date: String(ACUM) }, TOKEN), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'fara_user' });
    expect(verifyInitData(semneazaInitData({ auth_date: String(ACUM), user: '{"id":"x"}' }, TOKEN), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'fara_user' });
    expect(verifyInitData(semneazaInitData({ auth_date: String(ACUM), user: 'nu-e-json' }, TOKEN), TOKEN, ACUM)).toEqual({ ok: false, motiv: 'fara_user' });
  });
});

describe('telegramIdDinInitData — răspunsurile 401 ale API-ului șoferului', () => {
  it('semnătură bună → telegram_id; expirat → «expirat»; restul → «nelegat»', () => {
    expect(telegramIdDinInitData(semnat(), TOKEN, ACUM)).toEqual({ ok: true, telegramId: 777000111 });
    expect(telegramIdDinInitData(semnat({}, ACUM - 90_000), TOKEN, ACUM)).toEqual({ ok: false, eroare: 'expirat' });
    expect(telegramIdDinInitData(semnat(), 'alt:TOKEN', ACUM)).toEqual({ ok: false, eroare: 'nelegat' });
    expect(telegramIdDinInitData(null, TOKEN, ACUM)).toEqual({ ok: false, eroare: 'nelegat' });
    expect(telegramIdDinInitData(semnat(), undefined, ACUM)).toEqual({ ok: false, eroare: 'nelegat' });
  });
});
