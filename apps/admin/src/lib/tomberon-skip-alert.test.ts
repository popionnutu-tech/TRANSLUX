import { describe, it, expect } from 'vitest';
import {
  decideAlerts,
  marcheazaNetrimis,
  adaugaInJurnal,
  GRACE_MS,
  JURNAL_ZILE,
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
  it('scrierea eșuată se reîncearcă la rularea următoare', () => {
    const first = decideAlerts(null, zi([s('949141')]), T0);
    const due = decideAlerts(first.state, zi([s('949141')]), T0 + GRACE_MS);
    const state: SkipState = marcheazaNetrimis(due.state, due.alerts[0]);
    expect(state.zile[AZI]['949141|auto_lipsa'].alerted).toBe(false);

    const retry = decideAlerts(state, zi([s('949141')]), T0 + GRACE_MS + 600_000);
    expect(retry.alerts[0].items.map(i => i.foaie)).toEqual(['949141']);
  });
});

describe('adaugaInJurnal (din 21.09: faptul rămâne în bază, nu în Telegram)', () => {
  const acum = new Date('2026-08-13T09:00:00.000Z');

  it('scrie ce a trecut de răgaz, cu ziua foii și clipa', () => {
    const { alerts } = decideAlerts(
      decideAlerts(null, zi([s('949141')]), T0).state, zi([s('949141')]), T0 + GRACE_MS,
    );
    const jurnal = adaugaInJurnal(null, alerts, acum);
    expect(jurnal.intrari).toEqual([{
      ziua: AZI, foaie: '949141', sofer: 'Struna Valerii',
      cod: 'auto_lipsa', motiv: 'mașina «029» lipsește',
      vazut_la: '2026-08-13T09:00:00.000Z',
    }]);
  });

  it('aceeași (zi, foaie, cod) nu se scrie de două ori — starea nesalvată aduce rândul înapoi', () => {
    const alerte = [{ ziua: AZI, items: [s('949141')] }];
    const unu = adaugaInJurnal(null, alerte, acum);
    const doi = adaugaInJurnal(unu, alerte, new Date('2026-08-13T09:10:00.000Z'));
    expect(doi.intrari).toHaveLength(1);
    // Prima consemnare e cea care contează: de atunci foaia nu ajunge la terminal.
    expect(doi.intrari[0].vazut_la).toBe('2026-08-13T09:00:00.000Z');
  });

  it('coduri diferite pe aceeași foaie sunt fapte diferite', () => {
    const jurnal = adaugaInJurnal(null, [{ ziua: AZI, items: [s('949141', 'diferit'), s('949141', 'orfana')] }], acum);
    expect(jurnal.intrari.map((x) => x.cod)).toEqual(['diferit', 'orfana']);
  });

  it('taie ce e mai vechi de două săptămâni, după ziua foii', () => {
    const vechi = { ziua: '2026-07-01', items: [s('900001')] };
    const jurnal = adaugaInJurnal(
      adaugaInJurnal(null, [vechi], new Date('2026-07-01T09:00:00.000Z')),
      [{ ziua: AZI, items: [s('949141')] }],
      acum,
    );
    expect(jurnal.intrari.map((x) => x.ziua)).toEqual([AZI]);
    // Ziua de la limită rămâne: o foaie de acum JURNAL_ZILE zile încă se vede.
    const laLimita = new Date(acum.getTime() - JURNAL_ZILE * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const pastrat = adaugaInJurnal(null, [{ ziua: laLimita, items: [s('900002')] }], acum);
    expect(pastrat.intrari).toHaveLength(1);
  });
});

describe('codurile noi (10.09.2026)', () => {
  it('«diferit» și «orfana» au cronometrul lor, separat de celelalte coduri ale aceleiași foi', () => {
    // foaia a plecat la terminal pe șoferul vechi; după mutarea cursei apare DIFERIT
    const t1 = decideAlerts(null, zi([s('1125689', 'diferit', 'la terminal e pe alt șofer')]), T0);
    expect(t1.alerts).toEqual([]);
    const t2 = decideAlerts(t1.state, zi([s('1125689', 'diferit', 'la terminal e pe alt șofer')]), T0 + GRACE_MS);
    expect(t2.alerts[0].items.map(i => i.cod)).toEqual(['diferit']);
    const t3 = decideAlerts(t2.state, zi([s('1125689', 'orfana', 'șoferul nu mai e pe cursă')]), T0 + GRACE_MS + 1000);
    expect(t3.alerts).toEqual([]);
    expect(t3.state.zile[AZI]['1125689|orfana'].firstSeen).toBe(T0 + GRACE_MS + 1000);
  });
});
