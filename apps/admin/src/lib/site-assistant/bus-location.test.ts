import { describe, expect, it } from 'vitest';
import { END_SLACK_MIN, hhmmToMin, isOnRoad, minToHhmm, tripWindow } from './bus-location';
import { tripsCard } from './cards';

describe('bus-location — poarta «doar în orele cursei»', () => {
  it('ora din crm_stop_fares; 0:00 = oprire fără oră', () => {
    expect(hhmmToMin('6:55')).toBe(415);
    expect(hhmmToMin('0:00')).toBeNull();
    expect(hhmmToMin('')).toBeNull();
    expect(minToHhmm(1470)).toBe('00:30');
  });

  // Ruta: stop_order 1 = nord (Lipcani), 3 = Chișinău.
  const stops = (h: [string, string, string]) => [
    { stop_order: 1, hour: h[0] }, { stop_order: 2, hour: h[1] }, { stop_order: 3, hour: h[2] },
  ];

  it('spre nord (din Chișinău): de la ora din Chișinău până la ultima oprire', () => {
    expect(tripWindow(stops(['21:40', '19:50', '18:30']), true)).toEqual({ start: 1110, end: 1300 });
  });

  it('spre Chișinău: invers, după stop_order', () => {
    expect(tripWindow(stops(['05:00', '06:20', '08:10']), false)).toEqual({ start: 300, end: 490 });
  });

  it('opririle fără oră nu contează; sub două ore = fără fereastră', () => {
    expect(tripWindow(stops(['0:00', '19:50', '18:30']), true)).toEqual({ start: 1110, end: 1190 });
    expect(tripWindow(stops(['0:00', '0:00', '18:30']), true)).toBeNull();
  });

  it('pe drum doar între plecare și sosire + marjă', () => {
    const w = { start: 1110, end: 1300 };
    expect(isOnRoad(w, 1109)).toBe(false);
    expect(isOnRoad(w, 1110)).toBe(true);
    expect(isOnRoad(w, 1300 + END_SLACK_MIN)).toBe(true);
    expect(isOnRoad(w, 1300 + END_SLACK_MIN + 1)).toBe(false);
  });

  it('cursa care trece de miezul nopții', () => {
    const w = tripWindow(stops(['00:40', '23:30', '22:10']), true)!;
    expect(w).toEqual({ start: 1330, end: 1480 });
    expect(isOnRoad(w, 1400)).toBe(true);
    expect(isOnRoad(w, 30)).toBe(true);       // 00:30, încă pe drum
    expect(isOnRoad(w, 120)).toBe(false);     // 02:00
    expect(isOnRoad(w, 600)).toBe(false);     // 10:00
  });
});

describe('cards — lista curselor', () => {
  it('ia orele, prețul și numărul din rezultat; cursa fără șofer n-are număr', () => {
    const c = tripsCard({ from: 'Chișinău', to: 'Bălți' }, {
      date: '2026-09-24',
      trips: [
        { departure: '06:55', price: 155, phone: '+37369000001' },
        { departure: '07:30', price: 155, phone: null, awaiting_driver: true },
      ],
    });
    expect(c).toEqual({
      type: 'trips', from: 'Chișinău', to: 'Bălți', date: '2026-09-24', total: 2,
      trips: [{ time: '06:55', price: 155, phone: '+37369000001' }, { time: '07:30', price: 155, phone: null }],
    });
    expect(tripsCard({}, { trips: [] })).toBeNull();
  });
});
