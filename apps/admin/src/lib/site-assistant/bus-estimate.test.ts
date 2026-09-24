import { describe, expect, it } from 'vitest';
import { estimateOnLine, type LatLon, type TimedStop } from './bus-estimate';

// O linie dreaptă nord → sud, cu trei opriri: 0 km (N), 10 km, 20 km (S).
const line: LatLon[] = [[48.0, 28.0], [47.95, 28.0], [47.9, 28.0], [47.85, 28.0], [47.82, 28.0]];
const stops = (m: [number, number, number]): TimedStop[] => [
  { stop_order: 10, lat: 48.0, lon: 28.0, minute: m[0] },
  { stop_order: 20, lat: 47.9, lon: 28.0, minute: m[1] },
  { stop_order: 30, lat: 47.82, lon: 28.0, minute: m[2] },
];

describe('estimateOnLine', () => {
  it('spre sud: la jumătatea timpului dintre opriri, la jumătatea drumului dintre ele', () => {
    const p = estimateOnLine(line, stops([600, 620, 640]), false, 610)!;
    expect(p[0]).toBeCloseTo(47.95, 3);
  });

  it('spre nord merge invers pe opriri', () => {
    const p = estimateOnLine(line, stops([640, 620, 600]), true, 630)!;
    expect(p[0]).toBeCloseTo(47.95, 3);
  });

  it('înainte de plecare sau după sosire: fără estimare', () => {
    expect(estimateOnLine(line, stops([600, 620, 640]), false, 590)).toBeNull();
    expect(estimateOnLine(line, stops([600, 620, 640]), false, 650)).toBeNull();
  });

  it('cursa care trece de miezul nopții', () => {
    const p = estimateOnLine(line, stops([1430, 10, 30]), false, 0)!;
    expect(p[0]).toBeGreaterThan(47.9);
    expect(p[0]).toBeLessThan(48.0);
  });
});
