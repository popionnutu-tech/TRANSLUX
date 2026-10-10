import { describe, it, expect } from 'vitest';
import {
  computeBaltiOfferPrice,
  offerDiscountOf,
  isBaltiChisinauOffer,
  resolveOfferPriceForDate,
  resolveOfferForDate,
  baltiChisinauFixedPrice,
} from './offer-calc.js';

// Ziua de dinainte de prețul fix (ION-165), ca testele formulei să nu depindă de azi.
const INAINTE = '2026-10-01';
const baltiOffer = { from_locality: 'Bălți', to_locality: 'Chișinău', original_price: 145, offer_price: 125 };

describe('computeBaltiOfferPrice', () => {
  it('reproduce formula RPC pe rata curentă (1.09 → 125)', () => {
    expect(computeBaltiOfferPrice(1.09, 20)).toBe(125);
  });

  it('rata nouă 1.12 → 129 (149 − 20)', () => {
    expect(computeBaltiOfferPrice(1.12, 20)).toBe(129);
  });

  it('nu coboară sub 0 (GREATEST din RPC)', () => {
    expect(computeBaltiOfferPrice(0.1, 20)).toBe(0);
  });
});

describe('isBaltiChisinauOffer', () => {
  it('recunoaște perechea cu diacritice, în ambele sensuri', () => {
    expect(isBaltiChisinauOffer('Bălți', 'Chișinău')).toBe(true);
    expect(isBaltiChisinauOffer('Chișinău', 'Bălți')).toBe(true);
  });

  it('ofertele manuale pentru alte perechi nu se recalculează', () => {
    expect(isBaltiChisinauOffer('Chișinău', 'Edineț')).toBe(false);
  });
});

describe('resolveOfferPriceForDate', () => {
  it('Bălți↔Chișinău: prețul urmează rata datei', () => {
    expect(resolveOfferPriceForDate(baltiOffer, 1.12, INAINTE)).toBe(129);
    expect(resolveOfferPriceForDate(baltiOffer, 1.09, INAINTE)).toBe(125);
  });

  it('fără rată (nicio perioadă) → offer_price din tabel', () => {
    expect(resolveOfferPriceForDate(baltiOffer, null, INAINTE)).toBe(125);
  });

  it('ofertă manuală pe altă pereche → offer_price fix', () => {
    const manual = { from_locality: 'Chișinău', to_locality: 'Edineț', original_price: 200, offer_price: 99 };
    expect(resolveOfferPriceForDate(manual, 1.12)).toBe(99);
  });

  it('discount derivat din rând (offerDiscountOf)', () => {
    expect(offerDiscountOf(145, 125)).toBe(20);
  });
});

describe('resolveOfferForDate (ambele prețuri, pentru banner/get_offers)', () => {
  it('Bălți↔Chișinău pe rata nouă: 149 → 129', () => {
    expect(resolveOfferForDate(baltiOffer, 1.12, INAINTE)).toEqual({
      ...baltiOffer,
      original_price: 149,
      offer_price: 129,
    });
  });

  it('fără rată sau pereche manuală → rândul neatins', () => {
    expect(resolveOfferForDate(baltiOffer, null, INAINTE)).toEqual(baltiOffer);
    const manual = { from_locality: 'Chișinău', to_locality: 'Edineț', original_price: 200, offer_price: 99 };
    expect(resolveOfferForDate(manual, 1.12)).toEqual(manual);
  });
});

describe('prețul fix Bălți → Chișinău din 02.10.2026 (ION-165)', () => {
  it('din 02.10: 150 lei pe orice rată; înainte: formula', () => {
    expect(resolveOfferPriceForDate(baltiOffer, 1.19, '2026-10-02')).toBe(150);
    expect(resolveOfferPriceForDate(baltiOffer, 1.4, '2027-01-15')).toBe(150);
    expect(resolveOfferPriceForDate(baltiOffer, null, '2026-10-02')).toBe(150);
    expect(resolveOfferPriceForDate(baltiOffer, 1.19, '2026-10-01')).toBe(138);
  });
  it('bannerul: 150 în loc de prețul întreg', () => {
    expect(resolveOfferForDate(baltiOffer, 1.19, '2026-10-02')).toEqual({ ...baltiOffer, original_price: 158, offer_price: 150 });
  });
  it('doar sensul Bălți → Chișinău; returul și alte perechi neatinse', () => {
    expect(baltiChisinauFixedPrice('Chișinău', 'Bălți', '2026-10-09')).toBeNull();
    expect(baltiChisinauFixedPrice('Chișinău', 'Bălți', '2026-10-10')).toBe(150); // Ion 10.10: și returul 150
    expect(baltiChisinauFixedPrice('Edineț', 'Bălți', '2026-10-10')).toBeNull();
    expect(baltiChisinauFixedPrice('Bălți', 'Chișinău', '2026-10-02')).toBe(150);
    expect(baltiChisinauFixedPrice('Balti', 'chisinau', '2026-10-02')).toBe(150);
    const retur = { from_locality: 'Chișinău', to_locality: 'Bălți', original_price: 158, offer_price: 138 };
    expect(resolveOfferPriceForDate(retur, 1.19, '2026-10-02')).toBe(138);
  });
});
