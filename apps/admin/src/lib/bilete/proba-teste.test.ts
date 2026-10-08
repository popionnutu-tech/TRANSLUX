import { describe, expect, it } from 'vitest';
import { curataVerdicte, mesajRezultat, TESTE_PROBA } from './proba-teste';

describe('testele probei (Ion, 08.10: «20 de teste», «să trimită mie rezultatele»)', () => {
  it('sunt exact 20, numerotate 1..20', () => {
    expect(TESTE_PROBA.map((t) => t.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('curataVerdicte păstrează doar 1..20, ok/bad, nota tăiată la 300', () => {
    const v = curataVerdicte({ 1: { v: 'ok' }, 2: { v: 'bad', nota: 'x'.repeat(500) }, 3: { v: 'poate' }, 21: { v: 'ok' }, abc: { v: 'ok' } });
    expect([...v.keys()]).toEqual([1, 2]);
    expect(v.get(2)?.nota.length).toBe(300);
    expect(curataVerdicte(null).size).toBe(0);
    expect(curataVerdicte('x').size).toBe(0);
  });

  it('mesajul: sumar, picatele cu nota (HTML scăpat), nefăcutele', () => {
    const v = curataVerdicte({ 1: { v: 'ok' }, 2: { v: 'bad', nota: 'pagina <b>albă</b>' } });
    const m = mesajRezultat(v, 'Iura', '08.10 15:20');
    expect(m).toContain('✅ 1 · ❌ 1 · nefăcute 18 din 20');
    expect(m).toContain('❌ 2. Deschide pagina de probă');
    expect(m).toContain('→ pagina &lt;b&gt;albă&lt;/b&gt;');
    expect(m).toContain('⬜ Nefăcute: 3, 4,');
  });

  it('toate merg → o singură propoziție de final', () => {
    const toate = Object.fromEntries(TESTE_PROBA.map((t) => [t.n, { v: 'ok' }]));
    expect(mesajRezultat(curataVerdicte(toate), 'Iura', 'acum')).toContain('Toate cele 20 de teste au mers.');
  });
});
