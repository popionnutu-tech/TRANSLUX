import { describe, it, expect } from 'vitest';
import { judecaTura, textAlertaZilnica, zileLibere, type JudecataCtx, type OpririMasina, type Poarta, type VerifySummary } from './verify';

// Verdictul GPS al unei ture — cazurile din spec (retur cu altă mașină, 24.08.2026)
// plus judecata pe porți (migrația 359, 16.09.2026).
// Mașinile: TUR = mașina turului, RET = mașina pusă doar pe retur.

const ORHEI = { key: 'orhei', name: 'Orhei' };

function ctx(opts: {
  fara?: string[];                       // mașini fără date GPS în ziua respectivă
  inOrhei?: string[];                    // mașini care au oprit în Orhei
}): JudecataCtx {
  const stops = new Map<string, OpririMasina>();
  for (const v of opts.inOrhei ?? []) {
    stops.set(v, { locs: new Set(['orhei']), firstAt: new Map([['orhei', '2026-08-24T04:12:00Z']]), puncte: [] });
  }
  return {
    accepted: [ORHEI],
    gates: [],
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

// ── judecata pe porți (migrația 359) ────────────────────────────────────────
// Cifrele sunt cele reale din Bălți: poarta vest a uzinei și autobaza, la 0,73 km una
// de alta. Cu raza 0,5 km autobaza NU trebuie să confirme cursa.

const POARTA_VEST: Poarta = { label: 'Poarta vest (ZEL)', lat: 47.77408, lon: 27.91593, radiusKm: 0.5 };
const POARTA_EST: Poarta = { label: 'Poarta est (ZEL)', lat: 47.78513, lon: 27.94307, radiusKm: 0.6 };
const AUTOBAZA = { lat: 47.76980, lon: 27.92329 };

function ctxPorti(puncte: Record<string, Array<{ lat: number; lon: number; at: string }>>, fara: string[] = []): JudecataCtx {
  const stops = new Map<string, OpririMasina>();
  for (const [v, p] of Object.entries(puncte)) {
    // localitatea «Bălți» e pusă anume: uzina cu porți nu mai are voie s-o folosească
    stops.set(v, { locs: new Set(['balti']), firstAt: new Map([['balti', p[0]?.at ?? '']]), puncte: p });
  }
  return {
    accepted: [{ key: 'balti', name: 'Bălți' }],
    gates: [POARTA_EST, POARTA_VEST],
    city: 'Bălți',
    hasGps: (v) => !fara.includes(v),
    stops,
    plateOf: (v) => (v === 'TUR' ? '441ASB' : '880RNK'),
  };
}

describe('judecaTura — uzină cu porți', () => {
  it('oprire în raza porții → confirmat_auto, nota dă numele porții', () => {
    const r = judecaTura(['TUR'], ctxPorti({ TUR: [{ lat: 47.77420, lon: 27.91600, at: '2026-09-08T00:20:21Z' }] }));
    expect(r.status).toBe('confirmat_auto');
    expect(r.note).toMatch(/^GPS: Poarta vest \(ZEL\) \d{2}:\d{2}$/);
  });

  it('numai autobaza (0,73 km de poartă) → nepotrivire, deși localitatea e «Bălți»', () => {
    const r = judecaTura(['TUR'], ctxPorti({ TUR: [{ ...AUTOBAZA, at: '2026-09-05T05:00:00Z' }] }));
    expect(r).toEqual({ status: 'nepotrivire', note: 'GPS: nu a ajuns la poarta uzinei (Bălți)' });
  });

  it('prima poartă atinsă dă ora, nu ultima', () => {
    const r = judecaTura(['TUR'], ctxPorti({
      TUR: [
        { ...AUTOBAZA, at: '2026-09-08T00:00:00Z' },
        { lat: 47.78520, lon: 27.94300, at: '2026-09-08T03:30:00Z' },
        { lat: 47.77410, lon: 27.91590, at: '2026-09-08T09:01:51Z' },
      ],
    }));
    expect(r.status).toBe('confirmat_auto');
    expect(r.note).toContain('Poarta est (ZEL)');
  });

  it('tur la poartă, retur doar în oraș → nepotrivire care numește mașina de retur', () => {
    const r = judecaTura(['TUR', 'RET'], ctxPorti({
      TUR: [{ lat: 47.77410, lon: 27.91590, at: '2026-09-08T00:20:00Z' }],
      RET: [{ ...AUTOBAZA, at: '2026-09-08T18:00:00Z' }],
    }));
    expect(r).toEqual({ status: 'nepotrivire', note: 'GPS: 880RNK nu a ajuns la poarta uzinei (Bălți)' });
  });

  it('lipsa datelor GPS rămâne înaintea judecății pe porți', () => {
    expect(judecaTura(['TUR'], ctxPorti({}, ['TUR'])))
      .toEqual({ status: 'fara_date_gps', note: 'fără date GPS în ziua respectivă' });
  });

  it('oprirea fără nume de localitate confirmă totuși, dacă e în poartă', () => {
    const stops = new Map<string, OpririMasina>([
      ['TUR', { locs: new Set<string>(), firstAt: new Map(), puncte: [{ lat: 47.78500, lon: 27.94310, at: '2026-09-08T03:30:00Z' }] }],
    ]);
    const r = judecaTura(['TUR'], {
      accepted: [{ key: 'balti', name: 'Bălți' }], gates: [POARTA_EST, POARTA_VEST], city: 'Bălți',
      hasGps: () => true, stops, plateOf: () => '441ASB',
    });
    expect(r.status).toBe('confirmat_auto');
  });
});

// ── rezumatul de ADMIN ──────────────────────────────────────────────────────

const sumar = (o: Partial<VerifySummary> = {}): VerifySummary => ({
  date: '2026-09-10', verificate: 191, confirmate_auto: 0, nepotriviri: 0, fara_date_gps: 0,
  fara_masina: 0, uzine_libere: 0, actualizate: 0, push_trimise: 0, alerta_admin: false, dry: false, ...o,
});
const NUME = new Map([['LEAR_UNGHENI', 'LEAR-Ungheni'], ['TROX_BRICENI', 'Trox-Briceni']]);

describe('textAlertaZilnica', () => {
  it('zi curată, fără nepotriviri → niciun mesaj', () => {
    expect(textAlertaZilnica('2026-09-08', new Map(), NUME, sumar({ confirmate_auto: 183, fara_date_gps: 8 }), [])).toBeNull();
  });

  it('feed GPS căzut (191/191) → alarmă explicită, cu ce anume să verifice', () => {
    const t = textAlertaZilnica('2026-09-10', new Map(), NUME, sumar({ fara_date_gps: 191 }), [])!;
    expect(t).toContain('GPS lipsă pe 2026-09-10');
    expect(t).toContain('191 din 191');
    expect(t).toContain('100%');
    expect(t).toContain('gps-worker.mjs');
  });

  it('lipsă GPS obișnuită (sub prag) nu declanșează alarma de avarie', () => {
    expect(textAlertaZilnica('2026-09-05', new Map(), NUME, sumar({ confirmate_auto: 100, fara_date_gps: 68 }), [])).toBeNull();
  });

  it('ziua mică nu se judecă pe procent — 3 rânduri fără GPS nu sunt o avarie', () => {
    expect(textAlertaZilnica('2026-09-13', new Map(), NUME, sumar({ verificate: 3, fara_date_gps: 3 }), [])).toBeNull();
  });

  it('nepotrivirile se listează pe uzine, descrescător', () => {
    const t = textAlertaZilnica('2026-09-08', new Map([['TROX_BRICENI', 2], ['LEAR_UNGHENI', 5]]), NUME,
      sumar({ confirmate_auto: 166, nepotriviri: 7 }), [])!;
    expect(t).toContain('<b>7 nepotriviri</b>');
    expect(t.indexOf('LEAR-Ungheni')).toBeLessThan(t.indexOf('Trox-Briceni'));
  });

  it('uzina fără manager configurat e numită explicit', () => {
    const t = textAlertaZilnica('2026-09-08', new Map([['TROX_BRICENI', 2]]), NUME,
      sumar({ nepotriviri: 2 }), ['TROX_BRICENI'])!;
    expect(t).toContain('Fără manager configurat');
    expect(t).toContain('Trox-Briceni');
  });

  it('avarie GPS și nepotriviri în aceeași zi → ambele blocuri', () => {
    const t = textAlertaZilnica('2026-09-12', new Map([['LEAR_UNGHENI', 3]]), NUME,
      sumar({ nepotriviri: 3, fara_date_gps: 160 }), [])!;
    expect(t).toContain('GPS lipsă');
    expect(t).toContain('Atribuiri 2026-09-12');
  });
});

// ── ziua în care uzina n-a lucrat (migr. 371) ───────────────────────────────
// Ion, 17.09: «uneori sâmbăta lucrează ei». Regula e «zero sau nu»: dacă niciun rând
// al uzinei n-a fost confirmat de GPS, uzina n-a lucrat.

const v = (direction: string, status: string) => ({ direction, status });

describe('zileLibere', () => {
  it('uzina fără nicio confirmare, cu destule rânduri judecate → zi liberă', () => {
    expect([...zileLibere([v('UNGHENI', 'nepotrivire'), v('UNGHENI', 'nepotrivire')])])
      .toEqual(['UNGHENI']);
  });

  it('o singură confirmare ține uzina în picioare — restul rămân nepotriviri', () => {
    expect(zileLibere([v('ORHEI', 'confirmat_auto'), v('ORHEI', 'nepotrivire'), v('ORHEI', 'nepotrivire')]).size)
      .toBe(0);
  });

  it('uzinele se judecă separat: sâmbăta Orhei lucrează, Ungheni nu', () => {
    const libere = zileLibere([
      v('ORHEI', 'confirmat_auto'), v('ORHEI', 'nepotrivire'),
      v('UNGHENI', 'nepotrivire'), v('UNGHENI', 'nepotrivire'),
    ]);
    expect([...libere]).toEqual(['UNGHENI']);
  });

  it('un singur rând judecat nu declară ziua liberă — o lipsă nu e o zi', () => {
    expect(zileLibere([v('STRASENI', 'nepotrivire')]).size).toBe(0);
  });

  it('rândurile fără GPS nu se pun la socoteală', () => {
    // două fără GPS + una nepotrivire = un singur rând judecat → sub pragul de 2
    expect(zileLibere([v('TROX', 'fara_date_gps'), v('TROX', 'fara_date_gps'), v('TROX', 'nepotrivire')]).size)
      .toBe(0);
  });

  it('ziua întreagă fără GPS nu e zi liberă, e zi oarbă', () => {
    expect(zileLibere([v('ORHEI', 'fara_date_gps'), v('ORHEI', 'fara_date_gps')]).size).toBe(0);
  });

  it('confirmarea manuală a unui om bate GPS-ul: uzina a lucrat', () => {
    expect(zileLibere([v('TROX', 'nepotrivire'), v('TROX', 'nepotrivire')], new Map([['TROX', 1]])).size)
      .toBe(0);
  });

  it('a doua rulare pe aceeași zi nu răstoarnă confirmările primei', () => {
    // rândurile confirmate la prima rulare nu mai vin în `rows`; vin ca `confirmariExistente`
    expect(zileLibere([v('ORHEI', 'nepotrivire'), v('ORHEI', 'nepotrivire')], new Map([['ORHEI', 49]])).size)
      .toBe(0);
  });
});

describe('textAlertaZilnica — ziua liberă', () => {
  it('weekend fără nicio nepotrivire reală → niciun mesaj', () => {
    expect(textAlertaZilnica('2026-09-13', new Map(), NUME, sumar({ verificate: 73, uzine_libere: 47, fara_date_gps: 24 }), []))
      .toBeNull();
  });

  it('când există și nepotriviri reale, uzinele libere sunt numite', () => {
    const t = textAlertaZilnica('2026-09-12', new Map([['LEAR_UNGHENI', 4]]), NUME,
      sumar({ nepotriviri: 4, uzine_libere: 20 }), [], ['TROX_BRICENI'])!;
    expect(t).toContain('Nu au lucrat în ziua asta');
    expect(t).toContain('Trox-Briceni');
  });
});
