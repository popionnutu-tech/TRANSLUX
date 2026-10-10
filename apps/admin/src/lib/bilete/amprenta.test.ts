import { describe, expect, it } from 'vitest';
import { amprentaAlegerii, formaCanonica, type AlegereCumparator } from './amprenta';

// N3 (564): amprenta alegerii — aceeași cerere → aceeași amprentă; orice altă alegere → altă amprentă.
const baza = (): AlegereCumparator => ({
  tripDate: '2026-10-20', crmRouteId: 12, goingNorth: true, fromRo: 'Chișinău', toRo: 'Bălți', seats: 2, locuriAlese: [5, 3],
  passengerName: 'Popescu Ana', phone: '37369123456', email: 'ana@mail.md', punctUrcareId: 7, codRetur: null, studentJeton: null,
  retur: { tripDate: '2026-10-22', crmRouteId: 14, goingNorth: false, fromRo: 'Bălți', toRo: 'Chișinău', locuriAlese: null },
});

describe('amprenta alegerii (564, N3)', () => {
  it('aceeași cerere → aceeași amprentă; ordinea locurilor și spațiile nu contează', () => {
    const a = amprentaAlegerii(baza());
    expect(a).toMatch(/^a1:[0-9a-f]{64}$/);
    expect(amprentaAlegerii(baza())).toBe(a);
    expect(amprentaAlegerii({ ...baza(), locuriAlese: [3, 5], fromRo: '  Chișinău ', passengerName: 'Popescu  Ana', email: 'ANA@mail.md ' })).toBe(a);
  });

  const schimbari: Array<[string, Partial<AlegereCumparator>]> = [
    ['ziua', { tripDate: '2026-10-21' }], ['ruta', { crmRouteId: 13 }], ['sensul', { goingNorth: false }],
    ['oprirea de urcare', { fromRo: 'Strășeni' }], ['oprirea de coborâre', { toRo: 'Sîngerei' }], ['numărul de locuri', { seats: 3, locuriAlese: [3, 5, 6] }],
    ['locurile tur', { locuriAlese: [3, 6] }], ['locurile alese vs automat', { locuriAlese: null }], ['numele', { passengerName: 'Popescu Ion' }],
    ['corectura numelui (diacritice)', { passengerName: 'Popescu Ána' }], ['telefonul', { phone: '37369123457' }], ['e-mailul', { email: 'alt@mail.md' }],
    ['e-mailul scos', { email: null }], ['punctul de urcare', { punctUrcareId: 8 }], ['punctul scos', { punctUrcareId: null }],
    ['codul de retur', { codRetur: 'a'.repeat(64) }], ['jetonul de student', { studentJeton: 'jeton_student_123456789' }],
    ['returul scos', { retur: null }], ['ziua returului', { retur: { ...baza().retur!, tripDate: '2026-10-23' } }],
    ['cursa returului', { retur: { ...baza().retur!, crmRouteId: 15 } }], ['locurile returului', { retur: { ...baza().retur!, locuriAlese: [1, 2] } }],
    ['opririle returului', { retur: { ...baza().retur!, toRo: 'Orhei' } }],
  ];
  for (const [ce, s] of schimbari) {
    it(`altă alegere — ${ce} → altă amprentă`, () => {
      expect(amprentaAlegerii({ ...baza(), ...s })).not.toBe(amprentaAlegerii(baza()));
    });
  }

  it('jetonul nu apare în clar în forma canonică (doar hash)', () => {
    const f = formaCanonica({ ...baza(), studentJeton: 'jeton_secret_abcdefghijk' });
    expect(f).not.toContain('jeton_secret_abcdefghijk');
    expect(f).toMatch(/[0-9a-f]{64}/);
  });
});
