import { describe, it, expect } from 'vitest';
import {
  computeBaltiOfferPrice,
  offerDiscountOf,
  isBaltiChisinauOffer,
  resolveOfferPriceForDate,
  resolveOfferForDate,
} from './offer-calc.js';

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
    expect(resolveOfferPriceForDate(baltiOffer, 1.12)).toBe(129);
    expect(resolveOfferPriceForDate(baltiOffer, 1.09)).toBe(125);
  });

  it('fără rată (nicio perioadă) → offer_price din tabel', () => {
    expect(resolveOfferPriceForDate(baltiOffer, null)).toBe(125);
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
    expect(resolveOfferForDate(baltiOffer, 1.12)).toEqual({
      ...baltiOffer,
      original_price: 149,
      offer_price: 129,
    });
  });

  it('fără rată sau pereche manuală → rândul neatins', () => {
    expect(resolveOfferForDate(baltiOffer, null)).toEqual(baltiOffer);
    const manual = { from_locality: 'Chișinău', to_locality: 'Edineț', original_price: 200, offer_price: 99 };
    expect(resolveOfferForDate(manual, 1.12)).toEqual(manual);
  });
});
