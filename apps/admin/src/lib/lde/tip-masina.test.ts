import { describe, it, expect } from 'vitest';
import { canonPlaca, tipPePlaca } from './tip-masina';

describe('tipul mașinii după plăcuță (ION-114)', () => {
  it('plăcuța canonică', () => {
    expect(canonPlaca('ARF 744')).toBe('744ARF');
    expect(canonPlaca('744ARF')).toBe('744ARF');
    expect(canonPlaca('144 braz')).toBe('144BRAZ');
  });
  it('vehicul → normă → tip; fără normă = lipsă', () => {
    const t = tipPePlaca(
      [{ id: 'a', plate_number: '713IZX' }, { id: 'b', plate_number: 'ARF 744' }, { id: 'c', plate_number: '925FTI' }],
      [{ vehicle_id: 'a', vehicle_type_id: 'DAF' }, { vehicle_id: 'b', vehicle_type_id: 'SPRINTER_515' }, { vehicle_id: 'c', vehicle_type_id: null }],
      [{ id: 'DAF', display_name: 'DAF' }, { id: 'SPRINTER_515', display_name: 'Sprinter 515' }],
    );
    expect(t).toEqual({ '713IZX': 'DAF', '744ARF': 'Sprinter 515' });
  });
});
