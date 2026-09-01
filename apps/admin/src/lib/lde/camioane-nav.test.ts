import { describe, it, expect } from 'vitest';
import { camioaneTabsForRole, poateAccesa } from './camioane-nav';

describe('camioaneTabsForRole', () => {
  it('ADMIN vede toate filele, inclusiv Analitica', () => {
    expect(camioaneTabsForRole('ADMIN').map((x) => x.href)).toEqual([
      '/lde/camioane', '/lde/camioane/planificare', '/lde/camioane/flota',
      '/lde/camioane/puncte', '/lde/camioane/analitica',
    ]);
  });

  it('DISPECER planifică, dar nu vede Analitica', () => {
    const t = camioaneTabsForRole('DISPECER').map((x) => x.href);
    expect(t).not.toContain('/lde/camioane/analitica');
    expect(t).toHaveLength(4);
  });

  it('alte roluri nu văd modulul deloc', () => {
    expect(camioaneTabsForRole('UZINE')).toEqual([]);
    expect(camioaneTabsForRole('DISPATCHER')).toEqual([]);
  });
});

describe('poateAccesa', () => {
  it('DISPECER intră pe dispecerat, planificare, flotă, puncte', () => {
    expect(poateAccesa('DISPECER', '/lde/camioane')).toBe(true);
    expect(poateAccesa('DISPECER', '/lde/camioane/planificare')).toBe(true);
    expect(poateAccesa('DISPECER', '/lde/camioane/flota')).toBe(true);
    expect(poateAccesa('DISPECER', '/lde/camioane/puncte')).toBe(true);
  });

  it('DISPECER NU intră pe analitică, nici pe sub-căile ei', () => {
    // /lde/camioane e prefixul tuturor filelor — verificarea trebuie să fie pe
    // fila cea mai specifică, altfel rădăcina ar deschide tot modulul.
    expect(poateAccesa('DISPECER', '/lde/camioane/analitica')).toBe(false);
    expect(poateAccesa('DISPECER', '/lde/camioane/analitica/trasee')).toBe(false);
  });

  it('ADMIN intră peste tot în modul', () => {
    expect(poateAccesa('ADMIN', '/lde/camioane/analitica')).toBe(true);
  });

  it('rol străin nu intră nicăieri', () => {
    expect(poateAccesa('UZINE', '/lde/camioane')).toBe(false);
  });
});
