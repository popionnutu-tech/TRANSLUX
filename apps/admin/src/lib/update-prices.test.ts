import { describe, it, expect } from 'vitest';
import { parseRates } from './update-prices';

const makeHtml = (interurbanWord: string, dateClause = '') => `
${dateClause}
<h3>${interurbanWord}</h3>
<table>
  <tr><td>Categoria de confort II</td><td>0,94</td></tr>
  <tr><td>Categoria de confort I</td><td>1,07</td></tr>
</table>
<h3>Trafic raional</h3>
<table>
  <tr><td>Categoria de confort II</td><td>1,08</td></tr>
  <tr><td>Categoria de confort I</td><td>1,21</td></tr>
</table>
`;

describe('parseRates', () => {
  it('parses current ANTA format: "Trafic interraional"', () => {
    const rates = parseRates(makeHtml('Trafic interraional'));
    expect(rates.interurbanLong).toBeCloseTo(0.94, 2);
    expect(rates.interurbanShort).toBeCloseTo(1.07, 2);
    expect(rates.suburban).toBeCloseTo(1.21, 2);
  });

  it('parses old format: "Trafic interațional"', () => {
    const rates = parseRates(makeHtml('Trafic interațional'));
    expect(rates.interurbanLong).toBeCloseTo(0.94, 2);
    expect(rates.interurbanShort).toBeCloseTo(1.07, 2);
    expect(rates.suburban).toBeCloseTo(1.21, 2);
  });

  it('parses ASCII variant: "Trafic interational"', () => {
    const rates = parseRates(makeHtml('Trafic interational'));
    expect(rates.interurbanLong).toBeCloseTo(0.94, 2);
    expect(rates.interurbanShort).toBeCloseTo(1.07, 2);
    expect(rates.suburban).toBeCloseTo(1.21, 2);
  });

  it('parses effective date from "începând cu DD.MM.YYYY"', () => {
    const html = makeHtml(
      'Trafic interraional',
      '<p>începând cu 17.04.2026</p>',
    );
    const rates = parseRates(html);
    expect(rates.effectiveDate).toBe('2026-04-17');
  });

  it('returns null effectiveDate when date clause is absent', () => {
    const rates = parseRates(makeHtml('Trafic interraional'));
    expect(rates.effectiveDate).toBeNull();
  });

  it('throws when interurban section is missing', () => {
    const html = '<p>Trafic raional</p><p>Categoria de confort I: 1,21</p>';
    expect(() => parseRates(html)).toThrow('Could not find interurban tariff section');
  });

  it('throws when suburban section has no valid rate', () => {
    const html = `
      <p>Trafic interraional</p>
      <p>Categoria de confort II: 0,94</p>
      <p>Categoria de confort I: 1,07</p>
      <p>Trafic raional</p>
      <p>No rates here</p>
    `;
    expect(() => parseRates(html)).toThrow('Could not parse confort I rate');
  });
});
