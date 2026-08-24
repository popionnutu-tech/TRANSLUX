import { describe, it, expect } from 'vitest';
import { decideRetur } from './core';

// Invarianții returului de uzină (spec 24.08.2026). Cele două capcane găsite la audit:
// returul orfan după golirea cursei și returul întins peste zilele bifate fără să fie cerut.

describe('decideRetur', () => {
  it('golirea mașinii de tur curăță returul, chiar dacă se cere o mașină de retur', () => {
    expect(decideRetur(null, 'RET')).toEqual({ fel: 'curata' });
  });
  it('retur neatins (undefined) → zilele bifate nu se ating', () => {
    expect(decideRetur('TUR', undefined)).toEqual({ fel: 'nu-atinge' });
  });
  it('mașină de tur neatinsă (undefined, editare doar-șofer) + retur neatins → nu se atinge', () => {
    expect(decideRetur(undefined, undefined)).toEqual({ fel: 'nu-atinge' });
  });
  it('«Elimină returul» (null) → se curăță', () => {
    expect(decideRetur('TUR', null)).toEqual({ fel: 'curata' });
  });
  it('mașină de retur aleasă → se setează', () => {
    expect(decideRetur('TUR', 'RET')).toEqual({ fel: 'seteaza', vehicleId: 'RET' });
  });
});
