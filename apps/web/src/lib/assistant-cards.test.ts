import { describe, expect, it } from 'vitest';
import { busTiles } from './assistant-cards';

describe('busTiles', () => {
  it('9 plăci; punctul cade în placa centrală, iar plăcile acoperă cutia hărții', () => {
    // Orhei, aproximativ.
    const { tiles } = busTiles(47.38, 28.82);
    expect(tiles).toHaveLength(9);
    const center = tiles[4];
    // Centrul cutiei (0,0) e în interiorul plăcii centrale.
    expect(center.dx).toBeLessThanOrEqual(0);
    expect(center.dx).toBeGreaterThan(-256);
    expect(center.dy).toBeLessThanOrEqual(0);
    expect(center.dy).toBeGreaterThan(-256);
    // Acoperire: cardul are ~350×170, deci ±175 pe orizontală și ±85 pe verticală.
    expect(Math.min(...tiles.map((t) => t.dx))).toBeLessThanOrEqual(-175);
    expect(Math.max(...tiles.map((t) => t.dx + 256))).toBeGreaterThanOrEqual(175);
    expect(Math.min(...tiles.map((t) => t.dy))).toBeLessThanOrEqual(-85);
    expect(Math.max(...tiles.map((t) => t.dy + 256))).toBeGreaterThanOrEqual(85);
    expect(center.src).toMatch(/^https:\/\/tile\.openstreetmap\.org\/13\/\d+\/\d+\.png$/);
  });
});
