import { describe, expect, it } from 'vitest';
import {
  baniiAuAjuns, clasificaUrma, deltaRefund, INCERCARI_MAX, pasul, pauzaDupaRefuz, poateTrimite, urmaBanca, type UrmaBanca,
} from './refund-intentii-reguli';

// Intenția de refund (558; dezbaterea Claude ⇄ Codex 10.10.2026, N2 + C3 + Codex C1): mașina de stări și împăcarea cu banca.

describe('pasul după starea revendicată', () => {
  it('revendicata → trimite; trimisa_necunoscut → împacă (niciodată retrimitere directă); creata → verifică', () => {
    expect(pasul('revendicata')).toBe('trimite');
    expect(pasul('trimisa_necunoscut')).toBe('impaca');
    expect(pasul('creata')).toBe('verifica');
    for (const s of ['de_trimis', 'finalizata', 'refuzata', 'anulata'] as const) expect(pasul(s)).toBe('nimic');
  });
});

describe('pauza după refuz: reîncercat automat, apoi blocat (nu «gata»)', () => {
  it('15 min, 1 h, 6 h, 24 h, apoi null (blocată) la INCERCARI_MAX', () => {
    expect(pauzaDupaRefuz(1)).toBe(15 * 60_000);
    expect(pauzaDupaRefuz(2)).toBe(60 * 60_000);
    expect(pauzaDupaRefuz(3)).toBe(6 * 60 * 60_000);
    expect(pauzaDupaRefuz(4)).toBe(24 * 60 * 60_000);
    expect(INCERCARI_MAX).toBe(5);
    expect(pauzaDupaRefuz(5)).toBeNull();
    expect(pauzaDupaRefuz(9)).toBeNull();
    expect(pauzaDupaRefuz(0)).toBeNull();
  });
});

const baza: UrmaBanca = { returnat: 0, cerut: 0, returnabil: 270 };

describe('împăcarea după un POST necunoscut (Codex C1: refundedAmount=0 nu e singura dovadă)', () => {
  it('nicio mișcare în niciun câmp → lipsește (se poate retrimite)', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 0, returnabil: 270 }, 150)).toBe('lipseste');
  });
  it('cererea în curs (requested ↑, returnat încă 0) → există: NU se retrimite', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 150, returnabil: 270 }, 150)).toBe('exista');
  });
  it('doar returnabilul a scăzut → există', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 0, returnabil: 120 }, 150)).toBe('exista');
  });
  it('acceptat → există', () => {
    expect(clasificaUrma(baza, { returnat: 150, cerut: 0, returnabil: 120 }, 150)).toBe('exista');
  });
  it('mișcare parțială → neclar (nimic automat)', () => {
    expect(clasificaUrma(baza, { returnat: 0, cerut: 40, returnabil: 270 }, 150)).toBe('neclar');
  });
  it('al doilea refund pe plata pachetului: baza include primul refund (120), nu zero', () => {
    const b2: UrmaBanca = { returnat: 120, cerut: 120, returnabil: 150 };
    expect(clasificaUrma(b2, { returnat: 120, cerut: 120, returnabil: 150 }, 150)).toBe('lipseste');
    // «cerut» cumulat (o lectură a documentației) sau doar în curs (cealaltă): ambele dau «există»
    expect(clasificaUrma(b2, { returnat: 120, cerut: 270, returnabil: 0 }, 150)).toBe('exista');
    expect(clasificaUrma({ returnat: 120, cerut: 0, returnabil: 150 }, { returnat: 120, cerut: 150, returnabil: 150 }, 150)).toBe('exista');
    expect(deltaRefund(b2, { returnat: 270, cerut: 270, returnabil: 0 })).toBe(150);
  });
  it('fără returnabil la bancă: se judecă pe celelalte două', () => {
    expect(clasificaUrma({ returnat: 0, cerut: 0, returnabil: null }, { returnat: 0, cerut: 0, returnabil: null }, 10)).toBe('lipseste');
    expect(clasificaUrma({ returnat: 0, cerut: 0, returnabil: null }, { returnat: 10, cerut: 0, returnabil: null }, 10)).toBe('exista');
  });
  it('banii au ajuns doar când returnatul a crescut cu toată suma', () => {
    expect(baniiAuAjuns(baza, { returnat: 0, cerut: 150, returnabil: 120 }, 150)).toBe(false);
    expect(baniiAuAjuns(baza, { returnat: 150, cerut: 0, returnabil: 120 }, 150)).toBe(true);
  });
  it('urmaBanca: lipsă → 0 / null', () => {
    expect(urmaBanca({ status: 'Executed', amount: 10 })).toEqual({ returnat: 0, cerut: 0, returnabil: null });
  });
});

describe('poateTrimite: verificările dinaintea POST-ului', () => {
  const p = { status: 'Executed', amount: 270, refundedAmount: 0, refundableAmount: 270, isRefundable: true, partialRefundAvailable: true };
  it('plata executată, suma în returnabil → da', () => {
    expect(poateTrimite(p, 270)).toEqual({ ok: true });
    expect(poateTrimite(p, 120)).toEqual({ ok: true });
  });
  it('al doilea refund: plata «PartiallyRefunded» se acceptă (D6 se încearcă la bancă)', () => {
    expect(poateTrimite({ ...p, status: 'PartiallyRefunded', refundedAmount: 120, refundableAmount: 150 }, 150)).toEqual({ ok: true });
  });
  it('peste returnabil, plata nereturnabilă, plata eșuată / returnată integral → refuz local', () => {
    expect(poateTrimite({ ...p, refundableAmount: 100 }, 150).ok).toBe(false);
    expect(poateTrimite({ ...p, isRefundable: false }, 10).ok).toBe(false);
    expect(poateTrimite({ ...p, status: 'Refunded' }, 10).ok).toBe(false);
    expect(poateTrimite({ ...p, status: 'Failed' }, 10).ok).toBe(false);
    expect(poateTrimite(p, 0).ok).toBe(false);
  });
  it('fără refund parțial: bucata din rest e refuzată, restul întreg se încearcă', () => {
    const q = { ...p, status: 'PartiallyRefunded', refundedAmount: 120, refundableAmount: 150, partialRefundAvailable: false };
    expect(poateTrimite(q, 100).ok).toBe(false);
    expect(poateTrimite(q, 150)).toEqual({ ok: true });
  });
});
