import { describe, expect, it } from 'vitest';
import { calculeazaOferta, cifreCorecte, eligibilitateRetur, expirareAcceptataDeBaza, stareRetur } from './retur-bot-reguli';
import { poateAnulaPasager } from './refund-reguli';

const PLECARE = '2026-12-14T12:00:00+02:00';
const T = Date.parse(PLECARE);
const ore = (h: number) => T - h * 3_600_000;

describe('calculeazaOferta — grila ION-208 și expirarea 15′', () => {
  it('peste 24 h → 135, expiră în 15 min', () => {
    const now = ore(30);
    expect(calculeazaOferta(PLECARE, 135, now)).toEqual({ tip: 'oferta', noimi: 9, suma: 135, expiraMs: now + 15 * 60_000 });
  });
  it('treptele 120 / 105 / 90', () => {
    expect(calculeazaOferta(PLECARE, 135, ore(20))).toMatchObject({ suma: 120 });
    expect(calculeazaOferta(PLECARE, 135, ore(8))).toMatchObject({ suma: 105 });
    expect(calculeazaOferta(PLECARE, 135, ore(5))).toMatchObject({ suma: 90 });
  });
  it('la 4 h 00 min 30 s → ofertă care expiră exact la pragul de 4 h (nu în trecut)', () => {
    const now = ore(4) - 30_000;
    const o = calculeazaOferta(PLECARE, 135, now);
    expect(o).toMatchObject({ tip: 'oferta', suma: 90, expiraMs: ore(4) });
    expect((o as { expiraMs: number }).expiraMs).toBeGreaterThan(now);
  });
  it('exact la 4 h → încă se poate (6/9), ca executorul', () => {
    expect(calculeazaOferta(PLECARE, 135, ore(4))).toMatchObject({ tip: 'oferta', suma: 90 });
    expect(poateAnulaPasager(PLECARE, ore(4), 240)).toBe(true);
  });
  it('sub 4 h și după plecare → fără bani', () => {
    expect(calculeazaOferta(PLECARE, 135, ore(4) + 1000)).toEqual({ tip: 'fara_bani', motiv: 'sub_4h' });
    expect(poateAnulaPasager(PLECARE, ore(4) + 1000, 240)).toBe(false);
    expect(calculeazaOferta(PLECARE, 135, T + 1)).toEqual({ tip: 'fara_bani', motiv: 'plecat' });
  });
  it('grila sub 10 MDL → 10 lei (minimul băncii), fără dispecer (Ion, 10.10)', () => {
    const r = calculeazaOferta(PLECARE, 12, ore(5));
    expect(r.tip).toBe('oferta');
    if (r.tip === 'oferta') expect(r.suma).toBe(10);
    expect(calculeazaOferta(PLECARE, 9, ore(5))).toEqual({ tip: 'dispecer', motiv: 'sub_10' });
  });
});

describe('cifreCorecte', () => {
  it('ultimele 4 cifre, cu sau fără spații', () => {
    expect(cifreCorecte('37369123456', '3456')).toBe(true);
    expect(cifreCorecte('37369123456', ' 34-56 ')).toBe(true);
    expect(cifreCorecte('37369123456', '3455')).toBe(false);
    expect(cifreCorecte('37369123456', '345')).toBe(false);
    expect(cifreCorecte('', '0000')).toBe(false);
  });
});

describe('stareRetur — tabelul 16′/16″', () => {
  const of = (folosita: boolean, rezultat: string | null = null) => ({ folosita_la: folosita ? '2026-12-13T10:00:00Z' : null, rezultat });
  it('nefolosită → neatinsa', () => {
    expect(stareRetur({ oferta: of(false), comanda: { status: 'platita' }, checkout: null }).stare).toBe('neatinsa');
  });
  it('refuz cunoscut după reactivare → refuz (nu «în curs»)', () => {
    expect(stareRetur({ oferta: of(true, 'refuz:banca'), comanda: { status: 'platita' }, checkout: { refund_id: null, refund_status: null } }))
      .toEqual({ stare: 'refuz', motiv: 'banca' });
  });
  it('returnata, chiar fără refund_id (împăcare) → finalizat', () => {
    expect(stareRetur({ oferta: of(true), comanda: { status: 'returnata' }, checkout: { refund_id: null, refund_status: 'Accepted' } }).stare).toBe('finalizat');
  });
  it('Rejected / Manual → refuz_banca înaintea «creat»', () => {
    expect(stareRetur({ oferta: of(true), comanda: { status: 'anulata' }, checkout: { refund_id: 'r1', refund_status: 'Rejected' } }).stare).toBe('refuz_banca');
    expect(stareRetur({ oferta: of(true), comanda: { status: 'anulata' }, checkout: { refund_id: 'r1', refund_status: 'Manual' } }).stare).toBe('refuz_banca');
  });
  it('refund creat / necunoscut / Pending fără id', () => {
    expect(stareRetur({ oferta: of(true), comanda: { status: 'anulata' }, checkout: { refund_id: 'r1', refund_status: 'Created' } }).stare).toBe('creat');
    expect(stareRetur({ oferta: of(true), comanda: { status: 'anulata' }, checkout: { refund_id: null, refund_status: 'Necunoscut' } }).stare).toBe('necunoscut');
    expect(stareRetur({ oferta: of(true), comanda: { status: 'anulata' }, checkout: { refund_id: null, refund_status: 'Pending' } }).stare).toBe('in_curs');
  });
  it('folosită, fără rezultat, comanda încă plătită: sub 2 min → in_curs (dublu clic), peste → nedeterminat', () => {
    const d = { oferta: of(true), comanda: { status: 'platita' }, checkout: { refund_id: null, refund_status: null } };
    const folosita = Date.parse('2026-12-13T10:00:00Z');
    expect(stareRetur(d, folosita + 30_000).stare).toBe('in_curs');
    expect(stareRetur(d, folosita + 3 * 60_000).stare).toBe('nedeterminat');
    expect(stareRetur({ ...d, oferta: of(true, 'eroare') }, folosita + 30_000).stare).toBe('nedeterminat');
  });
});

describe('calculeazaOferta — garanția de lansare (Ion, 07.10: «100% garantat banii dacă călătoria nu a fost»)', () => {
  const plecare = Date.parse(PLECARE);
  it('cu garanție: tot, și sub 4 h, și după plecare până la +24 h', () => {
    expect(calculeazaOferta(PLECARE, 135, plecare - 30 * 60_000, true)).toMatchObject({ tip: 'oferta', noimi: 9, suma: 135 });
    expect(calculeazaOferta(PLECARE, 135, plecare + 2 * 3_600_000, true)).toMatchObject({ tip: 'oferta', noimi: 9, suma: 135 });
    expect(calculeazaOferta(PLECARE, 135, plecare + 25 * 3_600_000, true)).toEqual({ tip: 'fara_bani', motiv: 'plecat' });
  });
  it('cu garanție: oferta expiră în 15 min, dar nu după fereastră', () => {
    const now = plecare + 24 * 3_600_000 - 5 * 60_000;
    const r = calculeazaOferta(PLECARE, 135, now, true);
    expect(r).toMatchObject({ tip: 'oferta', expiraMs: plecare + 24 * 3_600_000 });
  });
  it('fără garanție: grila neschimbată (sub 4 h nimic)', () => {
    expect(calculeazaOferta(PLECARE, 135, plecare - 30 * 60_000, false)).toEqual({ tip: 'fara_bani', motiv: 'sub_4h' });
  });
});

// C6 (dezbaterea Claude–Codex, 10.10.2026): aceeași eligibilitate în bot, pe pagina biletului și în asistent
// (eligibilitateRetur), iar oferta botului trece de verificarea funcției din bază (562) și în garanția de lansare.
describe('C6: eligibilitateRetur + expirarea acceptată de bază', () => {
  const baza = { departureAt: PLECARE, total: 135, urcateTur: 0, leg: null, garantie: false };
  it('fără garanție: aceleași rezultate ca grila (calculeazaOferta)', () => {
    for (const h of [30, 20, 8, 5, 4, 3, 0.5, -1]) {
      expect(eligibilitateRetur({ ...baza, nowMs: ore(h) })).toEqual(calculeazaOferta(PLECARE, 135, ore(h)));
    }
  });
  it('bilet urcat → fără bani, și în garanție', () => {
    expect(eligibilitateRetur({ ...baza, urcateTur: 1, nowMs: ore(30), garantie: true })).toEqual({ tip: 'fara_bani', motiv: 'urcat' });
  });
  it('garanția: 2 h înainte și 10 h după plecare → 9/9, toată suma; după 24 h → plecat', () => {
    expect(eligibilitateRetur({ ...baza, nowMs: ore(2), garantie: true })).toMatchObject({ tip: 'oferta', noimi: 9, suma: 135 });
    expect(eligibilitateRetur({ ...baza, nowMs: ore(-10), garantie: true })).toMatchObject({ tip: 'oferta', noimi: 9, suma: 135 });
    expect(eligibilitateRetur({ ...baza, nowMs: ore(-24), garantie: true })).toEqual({ tip: 'fara_bani', motiv: 'plecat' });
  });
  it('tur-retur: doar până la plecarea turului (și în garanție — D4 deschis); returul urcat → nimic', () => {
    const leg = { total: 108, urcate: 0 };
    expect(eligibilitateRetur({ ...baza, leg, nowMs: ore(30) })).toMatchObject({ tip: 'oferta', noimi: 9 });
    expect(eligibilitateRetur({ ...baza, leg, nowMs: ore(-1), garantie: true })).toEqual({ tip: 'fara_bani', motiv: 'plecat' });
    expect(eligibilitateRetur({ ...baza, leg: { total: 108, urcate: 1 }, nowMs: ore(30) })).toEqual({ tip: 'fara_bani', motiv: 'urcat' });
  });
  it('orice ofertă (cu sau fără garanție, din minut în minut, −30 h … +30 h) trece de verificarea din bază', () => {
    for (const garantie of [false, true]) {
      for (let m = -30 * 60; m <= 30 * 60; m += 7) {
        const now = T - m * 60_000;
        const o = calculeazaOferta(PLECARE, 135, now, garantie);
        if (o.tip !== 'oferta') continue;
        expect(expirareAcceptataDeBaza(o.expiraMs, PLECARE, now, garantie)).toBe(true);
      }
    }
  });
  it('bugul vechi: oferta din garanție cu 2 h înainte ar fi fost respinsă de regula fără garanție', () => {
    const o = calculeazaOferta(PLECARE, 135, ore(2), true);
    expect(o.tip).toBe('oferta');
    expect(expirareAcceptataDeBaza((o as { expiraMs: number }).expiraMs, PLECARE, ore(2), false)).toBe(false);
    expect(expirareAcceptataDeBaza((o as { expiraMs: number }).expiraMs, PLECARE, ore(2), true)).toBe(true);
  });
});
