import { describe, expect, it } from 'vitest';
import { citesteForme, CHEIE_FORME, MAX_FORME, scrieForme } from './forme-memorate';

const st = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); } }; };

describe('ION-277: liniile rutelor memorate', () => {
  it('scrie și citește înapoi; cheile rămân «id:amprentă»', () => {
    const s = st();
    scrieForme(s, new Map([['21:ab12', [[47.1, 28.8], [47.2, 28.9]]]]));
    expect(citesteForme(s).get('21:ab12')).toEqual([[47.1, 28.8], [47.2, 28.9]]);
  });
  it('gunoi, chei străine sau puncte nevalide → ignorate', () => {
    expect(citesteForme(st({ [CHEIE_FORME]: 'nu-e-json' })).size).toBe(0);
    const s = st({ [CHEIE_FORME]: JSON.stringify({ 'x': [[1, 2]], '7:v1': [[1, 'a']], '8:v2': [[1, 2]] }) });
    expect([...citesteForme(s).keys()]).toEqual(['8:v2']);
  });
  it(`ține cel mult ${MAX_FORME}, cele mai noi`, () => {
    const s = st();
    scrieForme(s, new Map(Array.from({ length: MAX_FORME + 5 }, (_, i) => [`${i}:v`, [[1, 2]] as [number, number][]])));
    const r = citesteForme(s);
    expect(r.size).toBe(MAX_FORME);
    expect(r.has('0:v')).toBe(false);
    expect(r.has(`${MAX_FORME + 4}:v`)).toBe(true);
  });
});
