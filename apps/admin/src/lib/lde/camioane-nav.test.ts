import { describe, it, expect } from 'vitest';
import { camioaneTabsForRole, poateAccesa, poateScrie } from './camioane-nav';

describe('camioaneTabsForRole', () => {
  it('ADMIN vede toate filele, inclusiv Analitica', () => {
    expect(camioaneTabsForRole('ADMIN').map((x) => x.href)).toEqual([
      '/lde/camioane', '/lde/camioane/flota', '/lde/camioane/puncte', '/lde/camioane/analitica',
    ]);
  });

  it('DISPECER planifică, dar nu vede Analitica', () => {
    const t = camioaneTabsForRole('DISPECER').map((x) => x.href);
    expect(t).not.toContain('/lde/camioane/analitica');
    expect(t).toHaveLength(3);
  });

  it('rutele vechi rămân permise, ca redirectul lor să funcționeze', () => {
    // Dispeceratul și grila s-au contopit în bandă; căile lor se potrivesc acum
    // cu rădăcina, deci un semn salvat ajunge la redirect, nu la /login.
    expect(poateAccesa('DISPECER', '/lde/camioane/planificare')).toBe(true);
    expect(poateAccesa('DISPECER', '/lde/camioane/banda')).toBe(true);
  });

  it('alte roluri nu văd modulul deloc', () => {
    expect(camioaneTabsForRole('UZINE')).toEqual([]);
    expect(camioaneTabsForRole('DISPATCHER')).toEqual([]);
  });
});

describe('poateAccesa', () => {
  it('DISPECER intră pe dispecerat, bandă, planificare, flotă, puncte', () => {
    expect(poateAccesa('DISPECER', '/lde/camioane')).toBe(true);
    expect(poateAccesa('DISPECER', '/lde/camioane/banda')).toBe(true);
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

  it('OBSERVATOR vede DOAR banda — nu flota, nu punctele, nu analitica', () => {
    expect(camioaneTabsForRole('OBSERVATOR').map((x) => x.href)).toEqual(['/lde/camioane']);
    expect(poateAccesa('OBSERVATOR', '/lde/camioane')).toBe(true);
    expect(poateAccesa('OBSERVATOR', '/lde/camioane/flota')).toBe(false);
    expect(poateAccesa('OBSERVATOR', '/lde/camioane/puncte')).toBe(false);
    expect(poateAccesa('OBSERVATOR', '/lde/camioane/analitica')).toBe(false);
  });
});

describe('poateScrie', () => {
  it('scriu doar administratorul și dispecerul', () => {
    expect(poateScrie('ADMIN')).toBe(true);
    expect(poateScrie('DISPECER')).toBe(true);
  });

  it('OBSERVATOR nu scrie — deși vede banda', () => {
    // Gaura pe care o închide: acțiunile de server verifică o cale care nu mai e
    // filă ('/lde/camioane/planificare'), iar potrivirea pe prefix o rezolvă la
    // rădăcină. `poateAccesa` singur ar fi lăsat observatorul să salveze.
    expect(poateAccesa('OBSERVATOR', '/lde/camioane/planificare')).toBe(true);
    expect(poateScrie('OBSERVATOR')).toBe(false);
  });

  it('lista e albă: un rol nou nu capătă scriere din neatenție', () => {
    expect(poateScrie('UZINE')).toBe(false);
    expect(poateScrie('DISPATCHER')).toBe(false);
    expect(poateScrie('ROL_INVENTAT')).toBe(false);
  });
});
