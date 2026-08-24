import { describe, it, expect } from 'vitest';
import { judecaTura, type JudecataCtx } from './verify';

// Verdictul GPS al unei ture — cazurile din spec (retur cu altă mașină, 24.08.2026).
// Mașinile: TUR = mașina turului, RET = mașina pusă doar pe retur.

const ORHEI = { key: 'orhei', name: 'Orhei' };

function ctx(opts: {
  fara?: string[];                       // mașini fără date GPS în ziua respectivă
  inOrhei?: string[];                    // mașini care au oprit în Orhei
}): JudecataCtx {
  const stops = new Map<string, { locs: Set<string>; firstAt: Map<string, string> }>();
  for (const v of opts.inOrhei ?? []) {
    stops.set(v, { locs: new Set(['orhei']), firstAt: new Map([['orhei', '2026-08-24T04:12:00Z']]) });
  }
  return {
    accepted: [ORHEI],
    city: 'Orhei',
    hasGps: (v) => !(opts.fara ?? []).includes(v),
    stops,
    plateOf: (v) => (v === 'TUR' ? '820GXP' : '552BRAO'),
  };
}

describe('judecaTura — o singură mașină (neregresie: rândurile fără retur)', () => {
  it('mașina a fost în oraș → confirmat_auto, notă fără placă', () => {
    const r = judecaTura(['TUR'], ctx({ inOrhei: ['TUR'] }));
    expect(r.status).toBe('confirmat_auto');
    expect(r.note).toMatch(/^GPS: Orhei \d{2}:\d{2}$/);
  });
  it('mașina n-a ajuns → nepotrivire, notă identică cu cea de dinainte de retur', () => {
    expect(judecaTura(['TUR'], ctx({}))).toEqual({ status: 'nepotrivire', note: 'GPS: nu a ajuns în Orhei' });
  });
  it('fără date GPS → fara_date_gps, fără alarmă', () => {
    expect(judecaTura(['TUR'], ctx({ fara: ['TUR'] })))
      .toEqual({ status: 'fara_date_gps', note: 'fără date GPS în ziua respectivă' });
  });
});

describe('judecaTura — tur + retur pe altă mașină', () => {
  it('ambele în oraș → confirmat_auto, nota le numește pe amândouă', () => {
    const r = judecaTura(['TUR', 'RET'], ctx({ inOrhei: ['TUR', 'RET'] }));
    expect(r.status).toBe('confirmat_auto');
    expect(r.note).toContain('820GXP Orhei');
    expect(r.note).toContain('552BRAO Orhei');
  });
  it('turul da, returul nu → nepotrivire care numește mașina de retur', () => {
    expect(judecaTura(['TUR', 'RET'], ctx({ inOrhei: ['TUR'] })))
      .toEqual({ status: 'nepotrivire', note: 'GPS: 552BRAO nu a ajuns în Orhei' });
  });
  it('returul fără date GPS → fara_date_gps, nota spune care mașină', () => {
    expect(judecaTura(['TUR', 'RET'], ctx({ inOrhei: ['TUR'], fara: ['RET'] })))
      .toEqual({ status: 'fara_date_gps', note: '552BRAO fără date GPS în ziua respectivă' });
  });
});
