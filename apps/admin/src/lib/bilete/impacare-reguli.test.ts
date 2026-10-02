import { describe, expect, it } from 'vitest';
import { clasificaComanda, inFereastraFaraSofer, sesiuneInchisa, VARSTA_MIN_MS } from './impacare-reguli';

const now = Date.parse('2026-10-14T10:00:00+03:00');
const veche = new Date(now - VARSTA_MIN_MS - 1000).toISOString();
const proaspata = new Date(now - 5 * 60_000).toISOString();

describe('clasificaComanda', () => {
  it('noua veche fără checkout → fara_checkout; cu checkout → cu_checkout; proaspătă → nimic', () => {
    expect(clasificaComanda({ status: 'noua', checkout_id: null, created_at: veche, refund_finalizat_la: null }, now)).toBe('fara_checkout');
    expect(clasificaComanda({ status: 'eroare_creare', checkout_id: null, created_at: veche, refund_finalizat_la: null }, now)).toBe('fara_checkout');
    expect(clasificaComanda({ status: 'noua', checkout_id: 'x', created_at: veche, refund_finalizat_la: null }, now)).toBe('cu_checkout');
    expect(clasificaComanda({ status: 'noua', checkout_id: null, created_at: proaspata, refund_finalizat_la: null }, now)).toBe('nimic');
  });
  it('anulata nefinalizată → refund; finalizată → nimic; platita/expirata/returnata → nimic', () => {
    expect(clasificaComanda({ status: 'anulata', checkout_id: 'x', created_at: veche, refund_finalizat_la: null }, now)).toBe('refund');
    expect(clasificaComanda({ status: 'anulata', checkout_id: 'x', created_at: veche, refund_finalizat_la: '2026-10-14T09:00:00Z' }, now)).toBe('nimic');
    for (const s of ['platita', 'expirata', 'returnata', 'platita_fara_bilet']) {
      expect(clasificaComanda({ status: s, checkout_id: 'x', created_at: veche, refund_finalizat_la: null }, now)).toBe('nimic');
    }
  });
});

describe('sesiuneInchisa', () => {
  it('Expired/Cancelled/Failed/Abandoned (orice capitalizare) → închisă; Completed/Waitingforinit → nu', () => {
    for (const s of ['Expired', 'cancelled', 'FAILED', 'Abandoned']) expect(sesiuneInchisa(s)).toBe(true);
    for (const s of ['Completed', 'Waitingforinit', 'Initialized', null, undefined]) expect(sesiuneInchisa(s)).toBe(false);
  });
});

describe('inFereastraFaraSofer', () => {
  it('plecarea în 2 h → da; în 4 h → nu; deja plecată → nu', () => {
    expect(inFereastraFaraSofer('2026-10-14T12:00:00+03:00', now)).toBe(true);
    expect(inFereastraFaraSofer('2026-10-14T14:00:00+03:00', now)).toBe(false);
    expect(inFereastraFaraSofer('2026-10-14T09:00:00+03:00', now)).toBe(false);
  });
});
