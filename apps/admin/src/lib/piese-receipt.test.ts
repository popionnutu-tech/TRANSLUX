import { describe, it, expect } from 'vitest';
import { receiptLinesSum, countableLines, totalMatches, TOTAL_TOLERANCE } from './piese-receipt';

/* ── receiptLinesSum ── */

describe('receiptLinesSum', () => {
  it('adună liniile simple', () => {
    expect(receiptLinesSum([{ qty: 2, unit_cost: 10 }, { qty: 1, unit_cost: 5.5 }])).toBe(25.5);
  });

  it('dă 0 pentru listă goală', () => {
    expect(receiptLinesSum([])).toBe(0);
  });

  // Miezul deciziei: rotunjim PE LINIE, nu la final. Formularul derivă prețul unitar din suma tastată
  // (`sum/qty`, 4 zecimale), iar `unit_cost` e REAL în bază. Adunarea produselor brute ar acumula abaterea
  // peste toleranță la facturi cu multe rânduri și ar bloca o recepție corectă.
  it('rotunjește pe linie, ca abaterea să nu se acumuleze', () => {
    // 3 × 33.3333 = 99.9999 → 100.00 pe linie; suma brută ar fi dat 99.9999.
    expect(receiptLinesSum([{ qty: 3, unit_cost: 33.3333 }])).toBe(100);
  });

  it('rămâne în toleranță la o factură cu multe rânduri derivate din sumă', () => {
    // 40 de rânduri de câte 7 bucăți, preț derivat din suma 100.00 → 14.2857 fiecare.
    const lines = Array.from({ length: 40 }, () => ({ qty: 7, unit_cost: 14.2857 }));
    expect(Math.abs(receiptLinesSum(lines) - 4000)).toBeLessThanOrEqual(TOTAL_TOLERANCE);
  });

  it('tratează valorile venite ca text', () => {
    expect(receiptLinesSum([{ qty: '2' as unknown as number, unit_cost: '3.5' as unknown as number }])).toBe(7);
  });
});

/* ── countableLines ── */

describe('countableLines', () => {
  // Aceeași regulă ca serverul. Dacă ar diverge, ecranul ar putea arăta „✓ se potrivește" pentru o sumă
  // pe care serverul o respinge, iar depozitarul n-ar avea din ce să înțeleagă refuzul.
  it('păstrează doar rândurile cu piesă aleasă și cantitate pozitivă', () => {
    const rows = [
      { part_id: 1, qty: 2 },
      { part_id: '' as const, qty: 5 },   // piesă nealeasă
      { part_id: 3, qty: 0 },             // cantitate zero
      { part_id: 4, qty: -1 },            // cantitate negativă
      { part_id: 5, qty: 1 },
    ];
    expect(countableLines(rows).map((l) => l.part_id)).toEqual([1, 5]);
  });

  it('acceptă cantitatea ca text', () => {
    expect(countableLines([{ part_id: 1, qty: '3' }])).toHaveLength(1);
    expect(countableLines([{ part_id: 1, qty: '0' }])).toHaveLength(0);
  });
});

/* ── totalMatches ── */

describe('totalMatches', () => {
  const lines = [{ qty: 2, unit_cost: 10 }];

  it('acceptă potrivirea exactă', () => {
    expect(totalMatches(20, lines)).toBe(true);
  });

  it('acceptă abaterea de un ban, dar nu mai mult', () => {
    expect(totalMatches(20.01, lines)).toBe(true);
    expect(totalMatches(19.99, lines)).toBe(true);
    expect(totalMatches(20.02, lines)).toBe(false);
  });

  // Câmpul e opțional: necompletat înseamnă „fără verificare", nu „nepotrivire".
  it('trece când totalul nu e declarat', () => {
    expect(totalMatches(null, lines)).toBe(true);
  });

  // Fail-closed: o valoare nefinită nu are voie să treacă drept „se potrivește".
  it('respinge valorile nefinite', () => {
    expect(totalMatches(NaN, lines)).toBe(false);
    expect(totalMatches(Infinity, lines)).toBe(false);
  });

  it('prinde greșeala de tastare pe care e făcut să o prindă', () => {
    // 2 × 10 tastat greșit ca 2 × 100: totalul de pe factură rămâne 20, liniile dau 200.
    expect(totalMatches(20, [{ qty: 2, unit_cost: 100 }])).toBe(false);
  });
});
