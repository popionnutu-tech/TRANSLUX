import { describe, it, expect } from 'vitest';
import { poateNumara, esteAdminCamere, calePermisaContabilLde } from './roles';

const TOATE = ['ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL',
  'DEPOZITAR', 'VINZATOR', 'MANAGER', 'GESTIONAR', 'UZINE', 'DISPECER', 'OBSERVATOR', 'CONTABIL_LDE'];

describe('roluri în Numărare', () => {
  it('număra: ADMIN, ADMIN_CAMERE, OPERATOR_CAMERE, CONTABIL_LDE — nimeni altcineva', () => {
    expect(TOATE.filter(poateNumara)).toEqual(['ADMIN', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'CONTABIL_LDE']);
  });
  it('admin camere: ADMIN, ADMIN_CAMERE, CONTABIL_LDE; operatorul NU', () => {
    expect(TOATE.filter(esteAdminCamere)).toEqual(['ADMIN', 'ADMIN_CAMERE', 'CONTABIL_LDE']);
    expect(esteAdminCamere('OPERATOR_CAMERE')).toBe(false);
    expect(esteAdminCamere('EVALUATOR_INCASARI')).toBe(false);
  });
  it('rol lipsă = nimic', () => {
    expect(poateNumara(undefined)).toBe(false);
    expect(esteAdminCamere(null)).toBe(false);
  });
});

describe('căile Clavei (CONTABIL_LDE)', () => {
  it('intră pe agreare, norme, consum și numărare', () => {
    for (const p of ['/lde/agreare', '/lde/agreare/norme', '/lde/agreare/consum', '/numarare', '/numarare/x']) {
      expect(calePermisaContabilLde(p)).toBe(true);
    }
  });
  it('nu intră pe restul LDE, utilizatori sau API', () => {
    for (const p of ['/lde/combustibil', '/lde/agrearex', '/users', '/api/lde/camioane', '/lde', '/numararex', '/grafic']) {
      expect(calePermisaContabilLde(p)).toBe(false);
    }
  });
});
