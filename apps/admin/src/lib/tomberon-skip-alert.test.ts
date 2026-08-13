import { describe, it, expect } from 'vitest';
import {
  decideAlerts,
  marcheazaNetrimis,
  formatSkipAlert,
  GRACE_MS,
  type SkipItem,
  type SkipState,
} from './tomberon-skip-alert';

const T0 = 1_760_000_000_000;
const AZI = '2026-08-13';
const s = (foaie: string, cod: SkipItem['cod'] = 'auto_lipsa', motiv = 'mașina «029» lipsește'): SkipItem =>
  ({ foaie, sofer: 'Struna Valerii', cod, motiv });
const zi = (skips: SkipItem[], ziua = AZI) => [{ ziua, skips }];

describe('decideAlerts', () => {
  it('nu alertează imediat — lasă graficul să se completeze (grace)', () => {
    const { alerts, state } = decideAlerts(null, zi([s('949141')]), T0);
    expect(alerts).toEqual([]);
    expect(state.zile[AZI]['949141|auto_lipsa'].firstSeen).toBe(T0);
  });

  it('alertează după grace, o singură dată', () => {
    const first = decideAlerts(null, zi([s('949141')]), T0);
    const due = decideAlerts(first.state, zi([s('949141')]), T0 + GRACE_MS);
    expect(due.alerts).toHaveLength(1);
    expect(due.alerts[0].items.map(i => i.foaie)).toEqual(['949141']);

    const again = decideAlerts(due.state, zi([s('949141')]), T0 + GRACE_MS + 600_000);
    expect(again.alerts).toEqual([]);
  });

  it('textul motivului se schimbă, dar codul ține cronometrul — alerta tot pleacă', () => {
    // mesajele MS SQL diferă la fiecare rulare; cu ele în cheie alerta n-ar veni niciodată
    const t1 = decideAlerts(null, zi([s('949141', 'insert_esuat', 'timeout id=771')]), T0);
    const t2 = decideAlerts(t1.state, zi([s('949141', 'insert_esuat', 'timeout id=982')]), T0 + GRACE_MS);
    expect(t2.alerts[0].items.map(i => i.foaie)).toEqual(['949141']);
  });

  it('problemă rezolvată dispare din stare; dacă revine, cronometrul o ia de la capăt', () => {
    const seen = decideAlerts(null, zi([s('949141')]), T0);
    const rezolvat = decideAlerts(seen.state, zi([]), T0 + 60_000);
    expect(rezolvat.state.zile[AZI]).toEqual({});

    const revenit = decideAlerts(rezolvat.state, zi([s('949141')]), T0 + 120_000);
    expect(revenit.alerts).toEqual([]);
    expect(revenit.state.zile[AZI]['949141|auto_lipsa'].firstSeen).toBe(T0 + 120_000);
  });

  it('ziua care nu mai vine în payload cade din stare', () => {
    const ieri = decideAlerts(null, zi([s('949141')], '2026-08-12'), T0);
    const azi = decideAlerts(ieri.state, zi([s('949141')]), T0 + GRACE_MS);
    expect(Object.keys(azi.state.zile)).toEqual([AZI]);
    // foaia de azi e o problemă nouă → încă în grace, fără alertă
    expect(azi.alerts).toEqual([]);
  });

  it('ține zilele independent — o foaie pe mâine are cronometrul ei', () => {
    const payload = [
      { ziua: AZI, skips: [s('949141')] },
      { ziua: '2026-08-14', skips: [s('949200', 'nemapat', 'șofer nemapat')] },
    ];
    const t1 = decideAlerts(null, payload, T0);
    expect(t1.alerts).toEqual([]);
    const t2 = decideAlerts(t1.state, payload, T0 + GRACE_MS);
    expect(t2.alerts.map(a => a.ziua)).toEqual([AZI, '2026-08-14']);
  });
});

describe('marcheazaNetrimis', () => {
  it('livrarea eșuată se reîncearcă la rularea următoare', () => {
    const first = decideAlerts(null, zi([s('949141')]), T0);
    const due = decideAlerts(first.state, zi([s('949141')]), T0 + GRACE_MS);
    const state: SkipState = marcheazaNetrimis(due.state, due.alerts[0]);
    expect(state.zile[AZI]['949141|auto_lipsa'].alerted).toBe(false);

    const retry = decideAlerts(state, zi([s('949141')]), T0 + GRACE_MS + 600_000);
    expect(retry.alerts[0].items.map(i => i.foaie)).toEqual(['949141']);
  });
});

describe('formatSkipAlert', () => {
  it('scapă HTML-ul și listează foile', () => {
    const text = formatSkipAlert(AZI, [{ foaie: '949141', sofer: 'A <b>B</b>', cod: 'nemapat', motiv: 'x & y' }]);
    expect(text).toContain('13.08.2026');
    expect(text).toContain('949141');
    expect(text).toContain('A &lt;b&gt;B&lt;/b&gt;');
    expect(text).toContain('x &amp; y');
  });

  it('taie lista lungă ca să nu depășească limita Telegram de 4096', () => {
    const multe = Array.from({ length: 200 }, (_, i) => s(String(900000 + i), 'insert_esuat', 'x'.repeat(160)));
    const text = formatSkipAlert(AZI, multe);
    expect(text.length).toBeLessThan(4096);
    expect(text).toMatch(/…și încă \d+ foi/);
  });
});
