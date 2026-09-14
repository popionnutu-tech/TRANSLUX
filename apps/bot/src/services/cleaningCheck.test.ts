/**
 * Promptul de curățenie după interviul cu Ion (09.09, spec peron-app-criteria-v2, S01):
 * pragul «vizibil nemăturat = murdar; praful fin din rosturi nu», toleranța pe vreme rea,
 * zona pietoni (buruieni, afișe, con) și veceul. Test pe string — fără model, fără rețea.
 */
import { describe, expect, it } from 'vitest';
import { CLEANING_SYSTEM_PROMPT } from './cleaningCheck.js';

describe('promptul de curățenie — criteriile lui Ion', () => {
  it('pragul: vizibil nemăturat = MURDAR, praful fin din rosturi nu', () => {
    expect(CLEANING_SYSTEM_PROMPT).toContain('«vizibil nemăturat» = MURDAR');
    expect(CLEANING_SYSTEM_PROMPT).toContain('Praful fin din rosturile pavelelor e normal');
    expect(CLEANING_SYSTEM_PROMPT).toContain('nisip, pietriș, frunze, mucuri, hârtii');
  });

  it('toleranța pe vreme rea: frunzele proaspete și noroiul de ploaie nu; gunoiul da; se scrie în descriere', () => {
    expect(CLEANING_SYSTEM_PROMPT).toContain('Toleranță pe vreme rea');
    expect(CLEANING_SYSTEM_PROMPT).toContain('noroiul sau nisipul adus de ploaie NU se penalizează');
    expect(CLEANING_SYSTEM_PROMPT).toContain('se penalizează și pe vreme rea');
    expect(CLEANING_SYSTEM_PROMPT).toContain('toleranța de vreme');
    expect(CLEANING_SYSTEM_PROMPT).toContain('pavaj uscat = judecată normală');
  });

  it('pietoni: buruieni crescute, con răsturnat rămân murdar; veceu: podea/vas/chiuvetă, coș plin, fără hârtie; petele vechi nu', () => {
    expect(CLEANING_SYSTEM_PROMPT).toContain('buruienile crescute la stâlp și conul răsturnat sau lipsă sunt MURDAR întotdeauna');
    expect(CLEANING_SYSTEM_PROMPT).toContain('podea, vas, pisoar sau chiuvetă murdare, coș plin, lipsă hârtie');
    expect(CLEANING_SYSTEM_PROMPT).toContain('petele vechi, permanente, de pe faianță sau gresie nu contează');
  });

  it('Ion 14.09: afișele de pe stâlp nu se penalizează (operatorul nu le poate scoate); rădăcinile lemnoase rămase după cosit nu sunt buruieni', () => {
    expect(CLEANING_SYSTEM_PROMPT).toContain('afișele, anunțurile și hârtiile lipite pe stâlpul de stație — operatorul nu le poate scoate');
    expect(CLEANING_SYSTEM_PROMPT).toContain('rădăcinile lemnoase, cioturile și tulpinile uscate rămase la bază NU sunt buruieni');
    // afișele nu mai apar la MURDAR și nici în lista penalizată pe vreme rea
    expect(CLEANING_SYSTEM_PROMPT).not.toContain('afișe lipite pe stâlpul de stație.');
    expect(CLEANING_SYSTEM_PROMPT).not.toContain('afișele se penalizează');
  });

  it('Ion 14.09: podeaua veceului e industrială, cu aspect de asfalt murdar și spălată — nu se judecă după culoare sau textură', () => {
    expect(CLEANING_SYSTEM_PROMPT).toContain('cu aspect de asfalt murdar — așa arată și spălată; culoarea și textura ei NU sunt murdărie');
    expect(CLEANING_SYSTEM_PROMPT).toContain('Podeaua e murdară doar dacă se văd pe ea hârtii, gunoi, noroi, băltoace sau urme ude');
  });
});
