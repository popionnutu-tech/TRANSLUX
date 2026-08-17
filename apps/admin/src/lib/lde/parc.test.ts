import { describe, it, expect } from 'vitest';
import { normalizeazaPlaca, directionsCuUzina, mesajLegaturaDuplicata } from './parc';

describe('normalizeazaPlaca', () => {
  it('scoate spațiile și liniuțele, trece pe majuscule', () => {
    expect(normalizeazaPlaca(' 029 bras ')).toBe('029BRAS');
    expect(normalizeazaPlaca('c-mv-123')).toBe('CMV123');
  });

  it('respinge numărul gol', () => {
    expect(normalizeazaPlaca('   ')).toBeNull();
    expect(normalizeazaPlaca('- -')).toBeNull();
  });

  it('păstrează cifrele și literele, taie restul', () => {
    expect(normalizeazaPlaca('895/BRAX')).toBe('895BRAX');
  });

  it('recunoaște ca identice numerele scrise cu și fără spațiu', () => {
    // în bază există deja «692 TWK» și «795 MJW», salvate prin /vehicles cu
    // trim().toUpperCase() — fără normalizare comună s-ar crea o a doua mașină
    expect(normalizeazaPlaca('692 TWK')).toBe(normalizeazaPlaca('692TWK'));
    expect(normalizeazaPlaca('795 mjw')).toBe(normalizeazaPlaca('795MJW'));
  });
});

describe('directionsCuUzina', () => {
  it('adaugă uzina fără să piardă direcțiile existente', () => {
    expect(directionsCuUzina(['camioane'], 'SEBN_ORHEI')).toEqual(['camioane', 'SEBN_ORHEI']);
  });

  it('nu dublează uzina deja prezentă', () => {
    expect(directionsCuUzina(['SEBN_ORHEI'], 'SEBN_ORHEI')).toEqual(['SEBN_ORHEI']);
  });

  it('pornește de la listă goală sau lipsă', () => {
    expect(directionsCuUzina(null, 'LEAR_UNGHENI')).toEqual(['LEAR_UNGHENI']);
    expect(directionsCuUzina([], 'LEAR_UNGHENI')).toEqual(['LEAR_UNGHENI']);
  });
});

describe('mesajLegaturaDuplicata', () => {
  it('distinge șoferul ocupat de mașina ocupată pe schimb', () => {
    expect(mesajLegaturaDuplicata('duplicate key value violates unique constraint "uq_lde_active_assignments_one_per_driver"'))
      .toMatch(/șoferul/i);
    expect(mesajLegaturaDuplicata('duplicate key value violates unique constraint "uq_lde_active_assignments_one_per_vehicle_shift"'))
      .toMatch(/mașina/i);
  });

  it('are un mesaj de rezervă pentru orice alt conflict', () => {
    const fallback = mesajLegaturaDuplicata('duplicate key value violates unique constraint "altceva"');
    // nu doar «truthy»: mesajul trebuie să fie cel generic, nu unul dintre cele două specifice
    expect(fallback).toBe('Legătura există deja — verifică lista de mai jos.');
  });
});
