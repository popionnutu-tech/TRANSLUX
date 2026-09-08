import { describe, it, expect } from 'vitest';
import { taraDinPozitie, inInel } from './tara';

describe('taraDinPozitie', () => {
  it('punctele modulului cad în țara lor', () => {
    expect(taraDinPozitie(47.0105, 28.8638)).toBe('Moldova');      // Chișinău
    expect(taraDinPozitie(47.7699, 27.9236)).toBe('Moldova');      // Bălți
    expect(taraDinPozitie(48.3535, 27.1013)).toBe('Moldova');      // Briceni
    expect(taraDinPozitie(44.1312, 28.6163)).toBe('România');      // Port Constanța
    expect(taraDinPozitie(44.3357, 28.6394)).toBe('România');      // Petromidia
    expect(taraDinPozitie(49.8851, 28.5439)).toBe('Ucraina');      // Berdichev
    expect(taraDinPozitie(43.8564, 25.9707)).toBe('Bulgaria');     // Ruse
    expect(taraDinPozitie(42.6977, 23.3219)).toBe('Bulgaria');     // Sofia
  });
  it('vămile și malurile Prutului/Dunării se despart corect', () => {
    expect(taraDinPozitie(46.8067, 28.1961)).toBe('Moldova');      // Leușeni
    expect(taraDinPozitie(46.6733, 28.0597)).toBe('România');      // Huși
    expect(taraDinPozitie(45.4665, 28.1998)).toBe('Moldova');      // Giurgiulești
    expect(taraDinPozitie(45.4470, 28.0480)).toBe('România');      // Galați
    expect(taraDinPozitie(43.8890, 25.9600)).toBe('România');      // Giurgiu (peste Dunăre de Ruse)
  });
  it('Transnistria e Moldova, Odesa e Ucraina', () => {
    expect(taraDinPozitie(46.8403, 29.6433)).toBe('Moldova');      // Tiraspol
    expect(taraDinPozitie(46.4825, 30.7233)).toBe('Ucraina');      // Odesa
  });
  it('marea și țările neincluse dau null, nu o țară inventată', () => {
    expect(taraDinPozitie(43.5, 30.5)).toBeNull();                 // Marea Neagră
    expect(taraDinPozitie(48.8566, 2.3522)).toBeNull();            // Paris
    expect(taraDinPozitie(Number.NaN, 28)).toBeNull();
  });
  it('inInel: pătrat unitate', () => {
    const p = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    expect(inInel(0.5, 0.5, p)).toBe(true);
    expect(inInel(1.5, 0.5, p)).toBe(false);
  });
});
