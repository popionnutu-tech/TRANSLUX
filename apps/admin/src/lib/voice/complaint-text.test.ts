import { describe, it, expect } from 'vitest';
import { esteReclamatieGoala } from './complaint-text';

describe('esteReclamatieGoala', () => {
  it('eticheta fără poveste e goală — cazul din 11.09', () => {
    for (const t of ['Reclamație despre șofer', 'reclamatie despre un sofer', 'Am o reclamație despre șofer',
      'Plângere la șofer', 'Жалоба на водителя', 'У меня жалоба на водителя', 'Претензия к водителю']) {
      expect(esteReclamatieGoala(t), t).toBe(true);
    }
  });

  it('lipsa textului e goală', () => {
    expect(esteReclamatieGoala(null)).toBe(true);
    expect(esteReclamatieGoala('')).toBe(true);
    expect(esteReclamatieGoala('   ')).toBe(true);
    expect(esteReclamatieGoala('a fumat')).toBe(true);
  });

  it('o faptă în puține cuvinte NU e goală', () => {
    for (const t of ['a luat 250 în loc de 68', 'a fumat la volan', 'nu a oprit la Cupcini', 'грубил и не остановился']) {
      expect(esteReclamatieGoala(t), t).toBe(false);
    }
  });

  it('eticheta urmată de poveste NU e goală', () => {
    expect(esteReclamatieGoala('Reclamație despre șofer: era staționat la Cupcini și s-a purtat agresiv cu oamenii din stație')).toBe(false);
    expect(esteReclamatieGoala('Жалоба на водителя: стоял в Купчинь и агрессивно вёл себя с людьми на остановке')).toBe(false);
  });
});
