import { describe, it, expect } from 'vitest';
import { decideAlerts, formatSkipAlert, GRACE_MS, type SkipItem } from './tomberon-skip-alert';

const T0 = 1_760_000_000_000;
const s = (foaie: string, motiv = 'mașina «029» negăsită'): SkipItem => ({ foaie, sofer: 'Struna Valerii', motiv });

describe('decideAlerts', () => {
  it('nu alertează imediat — lasă graficul să se completeze (grace)', () => {
    const { alerts, state } = decideAlerts(null, '2026-08-13', [s('949141')], T0);
    expect(alerts).toEqual([]);
    expect(state.items['949141|mașina «029» negăsită'].firstSeen).toBe(T0);
  });

  it('alertează după grace, o singură dată', () => {
    const first = decideAlerts(null, '2026-08-13', [s('949141')], T0);
    const due = decideAlerts(first.state, '2026-08-13', [s('949141')], T0 + GRACE_MS);
    expect(due.alerts.map(a => a.foaie)).toEqual(['949141']);

    const again = decideAlerts(due.state, '2026-08-13', [s('949141')], T0 + GRACE_MS + 600_000);
    expect(again.alerts).toEqual([]);
  });

  it('problemă rezolvată dispare din stare; dacă revine, cronometrul o ia de la capăt', () => {
    const seen = decideAlerts(null, '2026-08-13', [s('949141')], T0);
    const rezolvat = decideAlerts(seen.state, '2026-08-13', [], T0 + 60_000);
    expect(rezolvat.state.items).toEqual({});

    const revenit = decideAlerts(rezolvat.state, '2026-08-13', [s('949141')], T0 + 120_000);
    expect(revenit.alerts).toEqual([]);
    expect(revenit.state.items['949141|mașina «029» negăsită'].firstSeen).toBe(T0 + 120_000);
  });

  it('zi nouă → stare resetată (foaia de ieri nu blochează alerta de azi)', () => {
    const ieri = decideAlerts(null, '2026-08-12', [s('949141')], T0);
    const alertatIeri = decideAlerts(ieri.state, '2026-08-12', [s('949141')], T0 + GRACE_MS);
    expect(alertatIeri.alerts).toHaveLength(1);

    const azi = decideAlerts(alertatIeri.state, '2026-08-13', [s('949141')], T0 + GRACE_MS + 1000);
    expect(azi.alerts).toEqual([]);
    expect(azi.state.ziua).toBe('2026-08-13');
    expect(azi.state.items['949141|mașina «029» negăsită'].firstSeen).toBe(T0 + GRACE_MS + 1000);
  });

  it('aceeași foaie cu motiv nou ține cronometru propriu', () => {
    const a = decideAlerts(null, '2026-08-13', [s('949141')], T0);
    // motivul nou abia acum apare → alertează doar primul, care și-a făcut graceul
    const b = decideAlerts(a.state, '2026-08-13', [s('949141'), s('949141', 'șofer nemapat')], T0 + GRACE_MS);
    expect(b.alerts.map(x => x.motiv)).toEqual(['mașina «029» negăsită']);
    // …iar al doilea, un grace mai târziu
    const c = decideAlerts(b.state, '2026-08-13', [s('949141'), s('949141', 'șofer nemapat')], T0 + 2 * GRACE_MS);
    expect(c.alerts.map(x => x.motiv)).toEqual(['șofer nemapat']);
  });
});

describe('formatSkipAlert', () => {
  it('scapă HTML-ul și listează foile', () => {
    const text = formatSkipAlert('2026-08-13', [{ foaie: '949141', sofer: 'A <b>B</b>', motiv: 'x & y' }]);
    expect(text).toContain('13.08.2026');
    expect(text).toContain('949141');
    expect(text).toContain('A &lt;b&gt;B&lt;/b&gt;');
    expect(text).toContain('x &amp; y');
  });
});
