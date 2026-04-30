import { describe, it, expect } from 'vitest';
import { validateRow, errorMessageRo, type ValidatableRow } from './validation';

const base: ValidatableRow = {
  cancelled: false,
  driver_id: null,
  vehicle_id: null,
  foaie_parcurs_nr: null,
};

describe('validateRow', () => {
  it('returns valid when row is cancelled (regardless of other fields)', () => {
    expect(validateRow({ ...base, cancelled: true })).toEqual({
      isValid: true,
      missing: [],
    });
    expect(validateRow({
      ...base,
      cancelled: true,
      driver_id: 'd1',
      vehicle_id: null,
      foaie_parcurs_nr: null,
    })).toEqual({ isValid: true, missing: [] });
  });

  it('returns valid when all three fields are filled', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: 'v1',
      foaie_parcurs_nr: '0945123',
    })).toEqual({ isValid: true, missing: [] });
  });

  it('reports lipsește auto when only auto missing', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: null,
      foaie_parcurs_nr: '0945123',
    })).toEqual({ isValid: false, missing: ['vehicle'] });
  });

  it('reports lipsește foaie when only foaie missing', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: 'v1',
      foaie_parcurs_nr: null,
    })).toEqual({ isValid: false, missing: ['foaie'] });
  });

  it('reports lipsește șofer when only driver missing', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: null,
      vehicle_id: 'v1',
      foaie_parcurs_nr: '0945123',
    })).toEqual({ isValid: false, missing: ['driver'] });
  });

  it('reports multiple missing when two or more fields missing', () => {
    expect(validateRow(base)).toEqual({
      isValid: false,
      missing: ['driver', 'vehicle', 'foaie'],
    });
    expect(validateRow({ ...base, driver_id: 'd1' })).toEqual({
      isValid: false,
      missing: ['vehicle', 'foaie'],
    });
  });

  it('treats empty string as missing for foaie_parcurs_nr', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: 'v1',
      foaie_parcurs_nr: '',
    })).toEqual({ isValid: false, missing: ['foaie'] });
  });
});

describe('errorMessageRo', () => {
  it('returns specific message for single missing field', () => {
    expect(errorMessageRo(['vehicle'])).toBe('Lipsește auto');
    expect(errorMessageRo(['foaie'])).toBe('Lipsește foaie de parcurs');
    expect(errorMessageRo(['driver'])).toBe('Lipsește șofer');
  });

  it('returns generic message for multiple missing', () => {
    expect(errorMessageRo(['driver', 'vehicle'])).toBe(
      "Bifează 'Anulată' sau completează șofer + auto + foaie",
    );
    expect(errorMessageRo(['vehicle', 'foaie'])).toBe(
      "Bifează 'Anulată' sau completează șofer + auto + foaie",
    );
    expect(errorMessageRo(['driver', 'vehicle', 'foaie'])).toBe(
      "Bifează 'Anulată' sau completează șofer + auto + foaie",
    );
  });

  it('returns empty string when nothing missing', () => {
    expect(errorMessageRo([])).toBe('');
  });
});
