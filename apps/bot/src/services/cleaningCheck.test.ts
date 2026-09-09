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

  it('pietoni: buruieni, afișe, con răsturnat rămân murdar; veceu: podea/vas/chiuvetă, coș plin, fără hârtie; petele vechi nu', () => {
    expect(CLEANING_SYSTEM_PROMPT).toContain('buruienile la stâlp, afișele lipite și conul răsturnat sau lipsă sunt MURDAR întotdeauna');
    expect(CLEANING_SYSTEM_PROMPT).toContain('podea, vas, pisoar sau chiuvetă murdare, coș plin, lipsă hârtie');
    expect(CLEANING_SYSTEM_PROMPT).toContain('petele vechi, permanente, de pe faianță sau gresie nu contează');
  });
});
